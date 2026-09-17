import * as THREE from 'three';
import { descendantIds, isVisible, sceneIndex } from '../scene/sceneIndex';
import type { SceneObject } from '../scene/types';
import type { CameraState, EditorState, GizmoMode } from '../state/store';
import { VERTICAL_FOV_DEG, cameraBasis, orbit, pan, zoom } from './camera';

export interface RendererCallbacks {
  onCamera(cam: CameraState): void;
  onPick(id: string | null, additive: boolean): void;
}

const WHITE = 0xffffff;
const DEFAULT_WIRE = 0x39ff39;
const LIGHT_COLOR = 0xffb45a;
const LIGHT_GIZMO_COLOR = 0xffc46e;
const POINT_COLOR = 0x66ccff;
/** Pointer travel (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 5;
const LIGHT_PICK_RADIUS_PX = 11;
/** Screen size of a light gizmo, in pixels. */
const LIGHT_GIZMO_PX = 8;

const AXES: [THREE.Vector3, number][] = [
  [new THREE.Vector3(1, 0, 0), 0xff5a5a],
  [new THREE.Vector3(0, 1, 0), 0x7cff7c],
  [new THREE.Vector3(0, 0, 1), 0x7c9cff],
];

interface BoxEntry {
  obj: SceneObject;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
}

interface LightEntry {
  obj: SceneObject;
  light: THREE.PointLight;
  gizmo: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

interface Drag {
  x: number;
  y: number;
  moved: number;
  button: number;
  shift: boolean;
}

interface TransformGizmo {
  root: THREE.Group;
  tips: Record<GizmoMode, THREE.Group>;
  dispose(): void;
}

/**
 * The M0 viewport: draws the mock scene's boxes and lights with three.js, rendering on demand.
 * M1 replaces the per-object boxes with instanced meshes from real scene data.
 */
export class SceneRenderer {
  private readonly host: HTMLElement;
  private readonly callbacks: RendererCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, 1, 0.3, 4000);
  /** Glacier is left-handed. Scaling Z by -1 here maps engine coordinates into three.js space. */
  private readonly world = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly lightGizmos = new THREE.Group();
  private readonly grid = new THREE.GridHelper(96, 12, 0x5a5a6e, 0x3a3a46);
  private readonly ambient = new THREE.AmbientLight(WHITE, 0);
  private readonly sun = new THREE.DirectionalLight(WHITE, 0);
  private readonly fog = new THREE.Fog(0x000000, 12, 142);
  private readonly raycaster = new THREE.Raycaster();
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitEdges = new THREE.EdgesGeometry(this.unitBox);
  private readonly unitCorners = buildCornerGeometry();
  private readonly lightGizmoGeometry = buildLightGizmoGeometry();
  private readonly transformGizmo = buildTransformGizmo();
  private readonly resizeObserver: ResizeObserver;
  private readonly size = new THREE.Vector2();

  private boxes: BoxEntry[] = [];
  private lights: LightEntry[] = [];
  private builtFrom: readonly SceneObject[] | null = null;
  private state: EditorState | null = null;
  private frameRequest = 0;
  private drag: Drag | null = null;

  constructor(host: HTMLElement, callbacks: RendererCallbacks) {
    this.host = host;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000);
    host.appendChild(this.renderer.domElement);

    this.world.scale.set(1, 1, -1);
    const gridMaterial = this.grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.6;
    this.world.add(this.grid, this.content, this.lightGizmos, this.transformGizmo.root);
    this.sun.position.set(0.35, 1, 0.55);
    this.scene.add(this.world, this.ambient, this.sun);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(host);
  }

  update(state: EditorState): void {
    this.state = state;
    if (state.objects !== this.builtFrom) {
      this.rebuild(state.objects);
      this.builtFrom = state.objects;
    }
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameRequest);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.disposeObjects();
    this.unitBox.dispose();
    this.unitEdges.dispose();
    this.unitCorners.dispose();
    this.lightGizmoGeometry.dispose();
    this.transformGizmo.dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  // ------------------------------------------------------------ scene building

  private disposeObjects(): void {
    for (const b of this.boxes) {
      b.mesh.material.dispose();
      b.edges.material.dispose();
      b.points.material.dispose();
    }
    for (const l of this.lights) {
      l.gizmo.material.dispose();
      l.light.dispose();
    }
    this.content.clear();
    this.lightGizmos.clear();
    this.boxes = [];
    this.lights = [];
  }

  private rebuild(objects: readonly SceneObject[]): void {
    this.disposeObjects();
    for (const obj of objects) {
      if (obj.size) {
        const group = new THREE.Group();
        group.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
        group.scale.set(obj.size.x, obj.size.y, obj.size.z);
        const mesh = new THREE.Mesh(
          this.unitBox,
          new THREE.MeshLambertMaterial({
            color: obj.tint,
            // Push faces back slightly so selection edges drawn on the same surface stay visible.
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          }),
        );
        mesh.userData.id = obj.id;
        const edges = new THREE.LineSegments(this.unitEdges, new THREE.LineBasicMaterial());
        const points = new THREE.Points(
          this.unitCorners,
          new THREE.PointsMaterial({ size: 3, sizeAttenuation: false }),
        );
        group.add(mesh, edges, points);
        this.content.add(group);
        this.boxes.push({ obj, group, mesh, edges, points });
      }
      if (obj.light) {
        const light = new THREE.PointLight(LIGHT_COLOR, 0, 0, 1);
        light.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
        this.content.add(light);
        const gizmo = new THREE.LineSegments(
          this.lightGizmoGeometry,
          new THREE.LineBasicMaterial({ depthTest: false, transparent: true }),
        );
        gizmo.position.copy(light.position);
        gizmo.renderOrder = 9;
        this.lightGizmos.add(gizmo);
        this.lights.push({ obj, light, gizmo });
      }
    }
  }

  // ------------------------------------------------------------ rendering

  private requestRender(): void {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this.render();
    });
  }

  private render(): void {
    const st = this.state;
    if (!st || !this.resize()) return;
    this.applyCamera(st.cam);
    this.sync(st);
    this.renderer.render(this.scene, this.camera);
  }

  /** Match the drawing buffer to the host. Returns false while the host has no size. */
  private resize(): boolean {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return false;
    this.renderer.getSize(this.size);
    if (this.size.x !== w || this.size.y !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  private applyCamera(cam: CameraState): void {
    const { eye } = cameraBasis(cam);
    this.camera.position.set(eye.x, eye.y, -eye.z);
    this.camera.lookAt(cam.tx, cam.ty, -cam.tz);
    this.camera.updateMatrixWorld();
  }

  private sync(st: EditorState): void {
    const view = st.view;
    const index = sceneIndex(st.objects);

    const highlighted = new Set<string>();
    for (const id of st.sel) {
      highlighted.add(id);
      for (const d of descendantIds(index, id)) highlighted.add(d);
    }

    for (const { obj, group, mesh, edges, points } of this.boxes) {
      const selected = highlighted.has(obj.id);
      group.visible = isVisible(index, obj);
      mesh.visible = !view.W;
      edges.visible = view.W || selected;
      edges.material.color.set(selected ? WHITE : (obj.wire ?? DEFAULT_WIRE));
      points.visible = view.P;
      points.material.color.set(selected ? WHITE : POINT_COLOR);
    }

    // Lit: the scene's own point lights over a dim ambient. Unlit: flat, direction-only shading.
    this.ambient.intensity = Math.PI * (view.Li ? 0.1 : 0.55);
    this.sun.intensity = view.Li ? 0 : Math.PI * 0.45;
    for (const { obj, light } of this.lights) {
      const on = view.Li && isVisible(index, obj) && obj.light;
      light.intensity = on ? Math.PI * 0.3 * obj.light!.intensity * obj.light!.radius : 0;
    }

    this.scene.fog = view.F ? this.fog : null;
    this.grid.visible = view.G;

    const worldPos = new THREE.Vector3();
    const pxToWorld = (distance: number) =>
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.size.y;

    for (const { obj, gizmo } of this.lights) {
      gizmo.visible = st.gizmoKind === 'Lights' && isVisible(index, obj);
      gizmo.material.color.set(highlighted.has(obj.id) ? WHITE : LIGHT_GIZMO_COLOR);
      gizmo.getWorldPosition(worldPos);
      gizmo.scale.setScalar(LIGHT_GIZMO_PX * pxToWorld(worldPos.distanceTo(this.camera.position)));
    }

    this.syncTransformGizmo(st);
  }

  private syncTransformGizmo(st: EditorState): void {
    const { root, tips } = this.transformGizmo;
    const index = sceneIndex(st.objects);
    const picked = st.sel.map((id) => index.byId.get(id)).filter((o): o is SceneObject => !!o);
    root.visible = picked.length > 0;
    if (!root.visible) return;

    const n = picked.length;
    root.position.set(
      picked.reduce((s, o) => s + o.pos.x, 0) / n,
      picked.reduce((s, o) => s + o.pos.y, 0) / n,
      picked.reduce((s, o) => s + o.pos.z, 0) / n,
    );
    for (const mode of Object.keys(tips) as GizmoMode[]) tips[mode].visible = mode === st.gizmoMode;

    // Editor2 draws the handles shorter up close, capped at 8 units further out.
    const centre = root.getWorldPosition(new THREE.Vector3());
    const distance = centre.distanceTo(this.camera.position);
    root.scale.setScalar(Math.min(8, 0.254 * distance + 2));
  }

  // ------------------------------------------------------------ input

  private readonly onContextMenu = (e: Event) => e.preventDefault();

  private readonly onPointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, shift: e.shiftKey };
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const drag = this.drag;
    if (!drag || !this.state) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    const cam = this.state.cam;
    this.callbacks.onCamera(drag.button === 2 || drag.shift ? pan(cam, dx, dy) : orbit(cam, dx, dy));
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.moved > CLICK_SLOP || drag.button === 2) return;
    this.pick(e);
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.state) this.callbacks.onCamera(zoom(this.state.cam, e.deltaY));
  };

  private pick(e: PointerEvent): void {
    const st = this.state;
    if (!st) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) return;

    this.applyCamera(st.cam);
    this.scene.updateMatrixWorld();
    const index = sceneIndex(st.objects);

    const ndc = new THREE.Vector2((mx / rect.width) * 2 - 1, -(my / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const pickable = this.boxes
      .filter((b) => !b.obj.frozen && isVisible(index, b.obj))
      .map((b) => b.mesh);
    const hit = this.raycaster.intersectObjects(pickable, false)[0];
    let bestId: string | null = hit ? (hit.object.userData.id as string) : null;
    let bestDistance = hit ? hit.distance : Infinity;

    // Lights have no surface to hit, so they're picked by screen distance to their centre.
    const p = new THREE.Vector3();
    for (const { obj, gizmo } of this.lights) {
      if (!isVisible(index, obj)) continue;
      gizmo.getWorldPosition(p);
      const distance = p.distanceTo(this.camera.position);
      const s = p.clone().project(this.camera);
      if (s.z < -1 || s.z > 1) continue;
      const sx = ((s.x + 1) / 2) * rect.width;
      const sy = ((1 - s.y) / 2) * rect.height;
      if (Math.hypot(sx - mx, sy - my) < LIGHT_PICK_RADIUS_PX && distance < bestDistance + 6) {
        bestId = obj.id;
        bestDistance = distance;
      }
    }

    this.callbacks.onPick(bestId, e.ctrlKey || e.metaKey);
  }
}

// ------------------------------------------------------------ shared geometry

function buildCornerGeometry(): THREE.BufferGeometry {
  const corners: number[] = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push(x, y, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  return geometry;
}

/** A unit cross through a small wire octahedron. */
function buildLightGizmoGeometry(): THREE.BufferGeometry {
  const octahedron = new THREE.OctahedronGeometry(0.45);
  const edges = new THREE.EdgesGeometry(octahedron);
  const positions = [...(edges.getAttribute('position').array as Float32Array)];
  positions.push(-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1);
  octahedron.dispose();
  edges.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Unit-length axis handles with arrow, ball or cube tips for move, rotate and scale. */
function buildTransformGizmo(): TransformGizmo {
  const root = new THREE.Group();
  const tips: Record<GizmoMode, THREE.Group> = {
    move: new THREE.Group(),
    rotate: new THREE.Group(),
    scale: new THREE.Group(),
  };
  const cone = new THREE.ConeGeometry(0.07, 0.22, 12);
  const ball = new THREE.SphereGeometry(0.06, 12, 8);
  const cube = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const disposables: { dispose(): void }[] = [cone, ball, cube];
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (const [dir, color] of AXES) {
    // Transparent + no depth test: drawn last, on top of the scene, like Editor2's overlay.
    const lineMaterial = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    const solidMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir]);
    disposables.push(lineMaterial, solidMaterial, lineGeometry);

    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = 10;
    root.add(line);

    const orientation = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
    const addTip = (group: THREE.Group, geometry: THREE.BufferGeometry) => {
      const tip = new THREE.Mesh(geometry, solidMaterial);
      tip.position.copy(dir);
      tip.quaternion.copy(orientation);
      tip.renderOrder = 10;
      group.add(tip);
    };
    addTip(tips.move, cone);
    addTip(tips.rotate, ball);
    addTip(tips.scale, cube);
  }

  root.add(tips.move, tips.rotate, tips.scale);
  return { root, tips, dispose: () => disposables.forEach((d) => d.dispose()) };
}
