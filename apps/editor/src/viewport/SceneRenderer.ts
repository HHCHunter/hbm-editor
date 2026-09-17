import * as THREE from 'three';
import type { SurfaceDTO, TextureDTO } from '@hbm/protocol';
import { drawsVariant, partHiddenReason } from '@hbm/scene';
import { listTextures, textureRgbaUrl } from '../api/endpoints';
import { effectiveFlags, meshNodeIndices, positionBounds, TRANSFORM } from '../scene/sceneModel';
import type { CameraState, EditorState, LoadedScene } from '../state/store';
import { VERTICAL_FOV_DEG, cameraBasis, orbit, pan, zoom } from './camera';
import { loadSceneMeshes, meshPartsOf, type MeshLoad, type MeshPartData } from './meshStore';
import { keepSkeletonsFor, skeletonFor } from './skeletonStore';

export interface RendererCallbacks {
  onCamera: (cam: CameraState) => void;
  onPick: (index: number | null, additive: boolean) => void;
  onMeshProgress: (loaded: number, total: number, failed: number) => void;
  onStats: (text: string) => void;
  /** Something the user should know about: a load that failed, or a limit that was reached. */
  onMessage: (message: string) => void;
}

/** Largest texture edge uploaded; bigger textures use a smaller mip level. */
const MAX_TEXTURE_EDGE = 1024;
const MAX_HIGHLIGHTS = 256;
const MAX_SKELETONS = 400;
const DRAG_THRESHOLD = 4;
const CLEAR_COLOR = 0x1c1c1c;

interface PartMesh {
  part: MeshPartData;
  mesh: THREE.InstancedMesh;
  /** Node index per instance. */
  nodes: number[];
}

type ViewKey = Pick<EditorState['view'], 'W' | 'Li' | 'Tx'>;

function nodeMatrix(transforms: Float32Array, index: number, out: THREE.Matrix4): THREE.Matrix4 {
  const t = transforms.subarray(index * TRANSFORM, (index + 1) * TRANSFORM);
  // Row-major rotation acting on column vectors, then the translation.
  return out.set(t[0]!, t[1]!, t[2]!, t[9]!, t[3]!, t[4]!, t[5]!, t[10]!, t[6]!, t[7]!, t[8]!, t[11]!, 0, 0, 0, 1);
}

/**
 * Draws a loaded scene: one InstancedMesh per model part, placed at every node that uses the model.
 * Everything lives under a group that flips Z, converting the engine's left-handed coordinates.
 */
export class SceneRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, 1, 1, 2_000_000);
  private readonly scene = new THREE.Scene();
  private readonly world = new THREE.Group();
  private readonly models = new THREE.Group();
  private readonly overlays = new THREE.Group();
  private readonly skeletons = new THREE.Group();
  private skeletonGeneration = 0;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly resizeObserver: ResizeObserver;

  private state: EditorState | null = null;
  private loaded: LoadedScene | null = null;
  private load: MeshLoad | null = null;
  private parts: PartMesh[] = [];
  private instancesByNode = new Map<number, PartMesh[]>();
  private hiddenNodes: Uint8Array = new Uint8Array(0);
  private frozenNodes: Uint8Array = new Uint8Array(0);

  private materials = new Map<string, THREE.Material>();
  private textures = new Map<number, Promise<THREE.Texture | null>>();
  private textureInfo: Promise<Map<number, TextureDTO>> | null = null;
  /** Whether this scene has already reported a texture it couldn't load. */
  private textureFailureReported = false;
  private grid: THREE.GridHelper | null = null;
  private markers: THREE.Points | null = null;

  private needsRender = true;
  private frame = 0;
  private lastRenderMs = 0;
  private drag: { x: number; y: number; button: number; shift: boolean; moved: boolean } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: RendererCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(CLEAR_COLOR);
    host.appendChild(this.renderer.domElement);

    this.world.scale.set(1, 1, -1);
    this.world.add(this.models, this.overlays, this.skeletons);
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3630, 1.4));
    this.scene.add(this.camera);
    this.camera.add(this.sun);
    this.sun.position.set(0.4, 1, 0.3);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.bindPointer();
    this.frame = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------- state

  update(state: EditorState): void {
    const prev = this.state;
    this.state = state;

    if (state.scene !== this.loaded) this.setScene(state.scene);
    if (!prev || prev.cam !== state.cam) this.applyCamera(state.cam);
    if (!prev || prev.view.W !== state.view.W || prev.view.Li !== state.view.Li || prev.view.Tx !== state.view.Tx) {
      this.refreshMaterials();
    }
    if (!prev || prev.view.F !== state.view.F || prev.cam.dist !== state.cam.dist) this.applyFog();
    if (this.grid) this.grid.visible = state.view.G;
    if (!prev || prev.view.P !== state.view.P || prev.scene !== state.scene) this.buildMarkers();
    if (!prev || prev.filters !== state.filters) this.applyFilters();
    if (!prev || prev.hidden !== state.hidden || prev.scene !== state.scene) {
      this.hiddenNodes = state.scene ? effectiveFlags(state.scene.graph.nodes, state.hidden) : new Uint8Array(0);
      for (const part of this.parts) this.placeInstances(part);
    }
    if (!prev || prev.frozen !== state.frozen || prev.scene !== state.scene) {
      this.frozenNodes = state.scene ? effectiveFlags(state.scene.graph.nodes, state.frozen) : new Uint8Array(0);
    }
    if (!prev || prev.sel !== state.sel || prev.hidden !== state.hidden) this.buildHighlights();
    if (!prev || prev.sel !== state.sel || prev.hidden !== state.hidden || prev.view.Bn !== state.view.Bn || prev.scene !== state.scene) {
      this.buildSkeletons();
    }
    this.needsRender = true;
  }

  private setScene(scene: LoadedScene | null): void {
    this.load?.cancel();
    this.load = null;
    this.clearModels();
    this.clearSkeletons();
    this.loaded = scene;
    this.textureInfo = null;
    this.textureFailureReported = false;
    if (!scene) return;
    keepSkeletonsFor(scene.id);

    const placed = new Map<number, number[]>();
    for (const node of scene.graph.nodes) {
      if (!node.meshRoot) continue;
      const list = placed.get(node.meshRoot) ?? [];
      list.push(node.index);
      placed.set(node.meshRoot, list);
    }
    this.buildGrid(scene);

    const roots = [...placed.keys()];
    let failed = 0;
    let firstError = '';
    const progress = (done: number) => {
      this.callbacks.onMeshProgress(done, roots.length, failed);
      if (done === roots.length && failed) {
        this.callbacks.onMessage(`${failed} of ${roots.length} models couldn't be read: ${firstError}`);
      }
    };
    this.callbacks.onMeshProgress(0, roots.length, 0);
    this.load = loadSceneMeshes(
      scene.id,
      roots,
      (batch, done) => {
        if (this.loaded !== scene) return;
        for (const root of batch) this.addRoot(scene, root, placed.get(root) ?? []);
        progress(done);
        this.needsRender = true;
      },
      (batch, err, done) => {
        if (this.loaded !== scene) return;
        failed += batch.length;
        firstError ||= err instanceof Error ? err.message : String(err);
        progress(done);
      },
    );
  }

  private addRoot(scene: LoadedScene, root: number, nodes: number[]): void {
    const parts = meshPartsOf(scene.id, root) ?? [];
    for (const part of parts) {
      // Each placement draws only the character it asks for (0 draws the whole model).
      const drawn = nodes.filter((n) => drawsVariant(scene.graph.nodes[n]!.variantId, part.variantId));
      if (!part.indices.length || !drawn.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 4, true));
      geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
      if (part.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      else geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const mesh = new THREE.InstancedMesh(geometry, this.materialFor(part.materialSlot), drawn.length);
      const entry: PartMesh = { part, mesh, nodes: drawn };
      this.placeInstances(entry);
      this.applyPartFilter(entry);
      this.models.add(mesh);
      this.parts.push(entry);
      for (const node of drawn) {
        const list = this.instancesByNode.get(node) ?? [];
        list.push(entry);
        this.instancesByNode.set(node, list);
      }
    }
    if (this.state?.sel.some((i) => nodes.includes(i))) this.buildHighlights();
  }

  private placeInstances(entry: PartMesh): void {
    const { mesh, nodes } = entry;
    const transforms = this.loaded?.transforms;
    if (!transforms) return;
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    nodes.forEach((node, i) => mesh.setMatrixAt(i, this.hiddenNodes[node] ? zero : nodeMatrix(transforms, node, m)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  private clearModels(): void {
    for (const { mesh } of this.parts) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.models.clear();
    this.parts = [];
    this.instancesByNode.clear();
    this.clearOverlays();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    for (const pending of this.textures.values()) void pending.then((texture) => texture?.dispose());
    this.textures.clear();
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.dispose();
      this.grid = null;
    }
    if (this.markers) {
      this.world.remove(this.markers);
      this.markers.geometry.dispose();
      (this.markers.material as THREE.Material).dispose();
      this.markers = null;
    }
  }

  // ---------------------------------------------------------------- filters

  private applyFilters(): void {
    for (const part of this.parts) this.applyPartFilter(part);
  }

  private applyPartFilter(entry: PartMesh): void {
    const state = this.state;
    const scene = this.loaded;
    if (!state || !scene) return;
    const { part } = entry;
    const lodOk = part.lodMask === 0 || (part.lodMask & (1 << state.filters.lod)) !== 0;
    const surface = scene.surfaces[part.materialSlot];
    const reason = surface ? partHiddenReason(surface, part.drawMode) : null;
    const reasonOk = reason === null || state.filters.show[reason];
    entry.mesh.visible = lodOk && reasonOk;
    // Non-surface geometry is drawn as a see-through overlay so it doesn't hide the level.
    if (reason) entry.mesh.material = this.helperMaterial(reason);
  }

  // ---------------------------------------------------------------- materials and textures

  private materialFor(slot: number): THREE.Material {
    const view = this.viewKey();
    const key = `${slot}|${view.W}|${view.Li}|${view.Tx}`;
    let material = this.materials.get(key);
    if (material) return material;

    const surface: SurfaceDTO | undefined = this.loaded?.surfaces[slot];
    const params: THREE.MeshLambertMaterialParameters = {
      color: new THREE.Color().setRGB(...((surface?.baseColor.slice(0, 3) ?? [1, 1, 1]) as [number, number, number]), THREE.SRGBColorSpace),
      wireframe: view.W,
      vertexColors: true,
      side: surface?.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    };
    if (surface?.alpha === 'mask') params.alphaTest = surface.alphaCutoff ?? 0.5;
    if (surface?.alpha === 'blend' || surface?.additive) {
      params.transparent = true;
      params.depthWrite = false;
      params.opacity = surface.opacity;
      if (surface.additive) params.blending = THREE.AdditiveBlending;
    }
    material = view.Li ? new THREE.MeshLambertMaterial(params) : new THREE.MeshBasicMaterial(params);
    this.materials.set(key, material);

    if (view.Tx && surface?.diffuseTextureId != null) {
      const target = material as THREE.MeshLambertMaterial;
      void this.texture(surface.diffuseTextureId).then((texture) => {
        if (!texture) return;
        target.map = texture;
        target.needsUpdate = true;
        this.needsRender = true;
      });
    }
    return material;
  }

  private helperMaterial(reason: string): THREE.Material {
    const key = `helper|${reason}|${this.viewKey().W}`;
    let material = this.materials.get(key);
    if (!material) {
      const colors: Record<string, number> = { collision: 0x40c0ff, bounds: 0xffa030, shadow: 0x606060, placeholder: 0xff40ff, helper: 0x80ff80 };
      material = new THREE.MeshBasicMaterial({
        color: colors[reason] ?? 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private viewKey(): ViewKey {
    const view = this.state?.view;
    return { W: view?.W ?? false, Li: view?.Li ?? true, Tx: view?.Tx ?? true };
  }

  private refreshMaterials(): void {
    const old = [...this.materials.values()];
    this.materials.clear();
    for (const entry of this.parts) entry.mesh.material = this.materialFor(entry.part.materialSlot);
    this.applyFilters();
    for (const material of old) material.dispose();
    this.buildHighlights();
  }

  /** One request per texture id, shared by every material that uses it. */
  private texture(id: number): Promise<THREE.Texture | null> {
    let pending = this.textures.get(id);
    if (!pending) {
      pending = this.loadTexture(id);
      this.textures.set(id, pending);
    }
    return pending;
  }

  private async loadTexture(id: number): Promise<THREE.Texture | null> {
    const scene = this.loaded;
    if (!scene) return null;

    try {
      if (!this.textureInfo) {
        const info = listTextures(scene.id).then((list) => new Map(list.map((t) => [t.id, t])));
        this.textureInfo = info;
        // A failed list isn't kept, so the next texture asks again.
        info.catch(() => {
          if (this.textureInfo === info) this.textureInfo = null;
        });
      }
      const info = (await this.textureInfo).get(id);
      if (!info) return null;
      let level = info.levels.findIndex((l) => l.size > 0 && Math.max(l.width, l.height) <= MAX_TEXTURE_EDGE);
      if (level < 0) level = info.levels.findIndex((l) => l.size > 0);
      const size = info.levels[level];
      if (!size) return null;

      const res = await fetch(textureRgbaUrl(scene.id, id, level));
      if (this.loaded !== scene) return null;
      if (!res.ok) throw new Error(`texture ${id} failed (${res.status})`);
      const texture = new THREE.DataTexture(new Uint8Array(await res.arrayBuffer()), size.width, size.height);
      // The rows are stored top first, which is where Direct3D texture coordinates start.
      texture.flipY = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      if (this.loaded !== scene) {
        texture.dispose();
        return null;
      }
      return texture;
    } catch (err) {
      if (this.loaded !== scene) return null;
      // Forget the failure so a later material rebuild asks again.
      this.textures.delete(id);
      if (!this.textureFailureReported) {
        this.textureFailureReported = true;
        this.callbacks.onMessage(`Some textures couldn't be loaded, so their models are drawn untextured: ${err instanceof Error ? err.message : String(err)}`);
      }
      return null;
    }
  }

  // ---------------------------------------------------------------- overlays

  private buildGrid(scene: LoadedScene): void {
    const bounds = positionBounds(scene.transforms, meshNodeIndices(scene.graph));
    if (!bounds) return;
    const extent = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], 100);
    const step = 10 ** Math.ceil(Math.log10(extent / 50));
    const size = Math.ceil(extent / step / 2) * 2 * step + 2 * step;
    this.grid = new THREE.GridHelper(size, size / step, 0x555555, 0x333333);
    this.grid.position.set((bounds.min[0] + bounds.max[0]) / 2, bounds.min[1], -(bounds.min[2] + bounds.max[2]) / 2);
    this.grid.visible = this.state?.view.G ?? true;
    this.scene.add(this.grid);
  }

  /** A dot for every node that has no model: lights, cameras, markers and plain groups. */
  private buildMarkers(): void {
    if (this.markers) {
      this.world.remove(this.markers);
      this.markers.geometry.dispose();
      (this.markers.material as THREE.Material).dispose();
      this.markers = null;
    }
    const scene = this.loaded;
    if (!scene || !this.state?.view.P) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const palette = { light: [1, 0.9, 0.3], camera: [0.3, 0.9, 1], room: [0.6, 0.6, 1], group: [0.6, 0.6, 0.6], other: [0.9, 0.5, 0.9], mesh: [1, 1, 1] };
    for (const node of scene.graph.nodes) {
      if (node.meshRoot || node.kind === 'group' || node.kind === 'room') continue;
      const o = node.index * TRANSFORM;
      positions.push(scene.transforms[o + 9]!, scene.transforms[o + 10]!, scene.transforms[o + 11]!);
      colors.push(...palette[node.kind]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.markers = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true }));
    this.world.add(this.markers);
  }

  private clearOverlays(): void {
    for (const child of [...this.overlays.children]) {
      this.overlays.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /** A box around each selected node's models, or a small cross where it has none. */
  private buildHighlights(): void {
    this.clearOverlays();
    const scene = this.loaded;
    const state = this.state;
    if (!scene || !state) return;
    const m = new THREE.Matrix4();
    if (state.sel.length > MAX_HIGHLIGHTS) {
      this.callbacks.onMessage(`Outlining the first ${MAX_HIGHLIGHTS} of ${state.sel.length} selected objects`);
    }
    for (const index of state.sel.slice(0, MAX_HIGHLIGHTS)) {
      nodeMatrix(scene.transforms, index, m);
      const entries = this.instancesByNode.get(index);
      if (entries?.length) {
        const box = new THREE.Box3();
        for (const { mesh } of entries) {
          if (mesh.visible && mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
        }
        if (box.isEmpty()) continue;
        // Box3Helper would place itself from the box and drop the node transform, so build the edges here.
        const size = box.getSize(new THREE.Vector3());
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
        edges.translate(...box.getCenter(new THREE.Vector3()).toArray());
        const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffe040, depthTest: false }));
        outline.renderOrder = 1;
        outline.matrixAutoUpdate = false;
        outline.matrix.copy(m);
        this.overlays.add(outline);
      } else {
        const size = Math.max(10, state.cam.dist * 0.01);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([-size, 0, 0, size, 0, 0, 0, -size, 0, 0, size, 0, 0, 0, -size, 0, 0, size], 3),
        );
        const cross = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffe040, depthTest: false }));
        cross.matrixAutoUpdate = false;
        cross.matrix.copy(m);
        this.overlays.add(cross);
      }
    }
  }

  private clearSkeletons(): void {
    for (const child of [...this.skeletons.children]) {
      this.skeletons.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /** Bind-pose bones for the selected characters, or for every character with the Bn flag. */
  private buildSkeletons(): void {
    const generation = ++this.skeletonGeneration;
    this.clearSkeletons();
    const scene = this.loaded;
    const state = this.state;
    if (!scene || !state) return;

    const skinned = (index: number) => {
      const node = scene.graph.nodes[index];
      return !!node?.meshRoot && (scene.roots[node.meshRoot]?.bones ?? 0) > 0 && !this.hiddenNodes[index];
    };
    const skinnedNodes = (state.view.Bn ? scene.graph.nodes.map((n) => n.index) : state.sel).filter(skinned);
    if (skinnedNodes.length > MAX_SKELETONS) {
      this.callbacks.onMessage(`Drawing the skeletons of the first ${MAX_SKELETONS} of ${skinnedNodes.length} characters`);
    }
    const wanted = skinnedNodes.slice(0, MAX_SKELETONS);

    for (const index of wanted) {
      const root = scene.graph.nodes[index]!.meshRoot;
      void skeletonFor(scene.id, root).then((skeleton) => {
        if (!skeleton || generation !== this.skeletonGeneration || this.loaded !== scene) return;
        const points: number[] = [];
        for (const bone of skeleton.bones) {
          const parent = skeleton.bones[bone.parent];
          // The root bone (GROUND) is the placement origin, not a joint: its links to PELVIS and to
          // camera_bone (in front of the head) would draw as lines through and beside the body.
          if (!parent || parent.parent < 0) continue;
          points.push(parent.global[9]!, parent.global[10]!, parent.global[11]!, bone.global[9]!, bone.global[10]!, bone.global[11]!);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x40e0ff, depthTest: false }));
        lines.renderOrder = 2;
        lines.matrixAutoUpdate = false;
        nodeMatrix(scene.transforms, index, lines.matrix);
        this.skeletons.add(lines);
        this.needsRender = true;
      });
    }
  }

  // ---------------------------------------------------------------- camera, fog, size

  private applyCamera(cam: CameraState): void {
    const { eye } = cameraBasis(cam);
    this.camera.position.set(eye.x, eye.y, -eye.z);
    this.camera.near = Math.max(0.5, cam.dist * 0.002);
    this.camera.far = Math.max(cam.dist * 50, 100_000);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cam.tx, cam.ty, -cam.tz);
  }

  private applyFog(): void {
    const state = this.state;
    this.scene.fog = state?.view.F ? new THREE.Fog(CLEAR_COLOR, state.cam.dist * 0.5, state.cam.dist * 4) : null;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private readonly tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    if (!this.needsRender) return;
    this.needsRender = false;
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.lastRenderMs = performance.now() - start;
    const info = this.renderer.info.render;
    const visible = this.parts.reduce((n, p) => n + (p.mesh.visible ? 1 : 0), 0);
    this.callbacks.onStats(`${visible} parts · ${info.calls} draws · ${Math.round(info.triangles / 1000)}k tris · ${this.lastRenderMs.toFixed(1)} ms`);
  };

  // ---------------------------------------------------------------- pointer

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      const drag = this.drag;
      const cam = this.state?.cam;
      if (!drag || !cam) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const panning = drag.button === 2 || drag.button === 1 || drag.shift;
      this.callbacks.onCamera(panning ? pan(cam, dx, dy) : orbit(cam, dx, dy));
    });
    el.addEventListener('pointerup', (e) => {
      const drag = this.drag;
      this.drag = null;
      if (drag && !drag.moved && drag.button === 0) this.pick(e);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const cam = this.state?.cam;
        if (cam) this.callbacks.onCamera(zoom(cam, e.deltaY));
      },
      { passive: false },
    );
  }

  private pick(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const targets = this.parts.filter((p) => p.mesh.visible).map((p) => p.mesh);
    const byMesh = new Map(this.parts.map((p) => [p.mesh as THREE.Object3D, p]));
    for (const hit of raycaster.intersectObjects(targets, false)) {
      const entry = byMesh.get(hit.object);
      const node = entry && hit.instanceId !== undefined ? entry.nodes[hit.instanceId] : undefined;
      if (node === undefined || this.frozenNodes[node] || this.hiddenNodes[node]) continue;
      this.callbacks.onPick(node, e.ctrlKey || e.metaKey);
      return;
    }
    this.callbacks.onPick(null, false);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.load?.cancel();
    this.resizeObserver.disconnect();
    this.clearModels();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
