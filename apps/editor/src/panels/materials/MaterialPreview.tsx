import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialDetailDTO, SceneNodeDTO, TextureDTO } from '@hbm/protocol';
import { drawsVariant } from '@hbm/scene';
import { useEditor } from '../../state/store';
import { Select } from '../../ui';
import { fetchGameTexture, partGeometry } from '../../viewport/gameTextures';
import { meshPartsOf, type MeshPartData } from '../../viewport/meshStore';
import { groupMaterial, mainValue, textureRef, type GroupedMaterial } from './materialModel';

type Shape = 'sphere' | 'cube' | 'plane' | 'object';

/** Features the preview shows; the rest are listed as not shown. */
const PREVIEWED = new Set(['Base', 'Bump', 'Specular', 'Reflection', 'Illumination']);
const PREVIEW_EDGE = 512;
const NO_NODES: readonly SceneNodeDTO[] = [];

const num = (v: unknown, i = 0, fallback = 0) => (Array.isArray(v) && typeof v[i] === 'number' ? (v[i] as number) : fallback);

function findProp(grouped: GroupedMaterial, name: string) {
  for (const f of grouped.features) {
    const p = [...f.textures, ...f.values].find((x) => x.name === name);
    if (p) return { feature: f, prop: p };
  }
  return null;
}

/** The model parts of the first placed object that draws with this material, or null if none is loaded. */
function objectParts(sceneId: string, nodes: readonly SceneNodeDTO[], users: readonly number[], slot: number): MeshPartData[] | null {
  for (const index of users) {
    const node = nodes[index];
    if (!node?.meshRoot) continue;
    const parts = meshPartsOf(sceneId, node.meshRoot)?.filter(
      (p) => p.materialSlot === slot && p.indices.length > 0 && drawsVariant(node.variantId, p.variantId),
    );
    if (parts?.length) return parts;
  }
  return null;
}

/** The parts as one geometry, mirrored from the engine's left-handed coordinates. */
function objectGeometry(parts: readonly MeshPartData[]): THREE.BufferGeometry {
  const geometries = parts.map((part) => {
    const g = partGeometry(part);
    g.deleteAttribute('color');
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    return g;
  });
  const merged = geometries.length > 1 ? (mergeGeometries(geometries) ?? geometries[0]!) : geometries[0]!;
  merged.scale(1, 1, -1);
  return merged;
}

function shapeGeometry(shape: Shape, object: THREE.BufferGeometry | null): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  if (shape === 'object' && object) geometry = object;
  else if (shape === 'cube') geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  else if (shape === 'plane') geometry = new THREE.PlaneGeometry(2, 2);
  else geometry = new THREE.SphereGeometry(1, 64, 48);
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(1.1 / radius, 1.1 / radius, 1.1 / radius);
  return geometry;
}

async function cubeTexture(sceneId: string, faces: readonly number[], byId: ReadonlyMap<number, TextureDTO>, signal: AbortSignal): Promise<THREE.CubeTexture | null> {
  const images: HTMLCanvasElement[] = [];
  for (const id of faces.slice(0, 6)) {
    const info = byId.get(id);
    if (!info) return null;
    const texture = await fetchGameTexture(sceneId, info, { maxEdge: 256, signal });
    const { data, width, height } = texture.image as { data: Uint8Array; width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    images.push(canvas);
    texture.dispose();
  }
  if (images.length < 6) return null;
  const cube = new THREE.CubeTexture(images);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

export interface MaterialPreviewProps {
  sceneId: string;
  material: MaterialDetailDTO;
  textures: ReadonlyMap<number, TextureDTO>;
}

/**
 * The material on a simple shape or on an object that uses it. An approximation in three.js:
 * colour, normal, specular, self-illumination and cubemap reflection are shown; the game's own
 * shaders do more (see the note under the preview).
 */
export function MaterialPreview({ sceneId, material, textures }: MaterialPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<Shape>('sphere');
  const [status, setStatus] = useState<string | null>(null);
  const nodes = useEditor((s) => s.scene?.graph.nodes) ?? NO_NODES;
  const meshProgress = useEditor((s) => s.meshProgress);
  const hasObject = !!objectParts(sceneId, nodes, material.users, material.slot);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abort = new AbortController();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x2a2a2a);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.3, 4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(3, 4, 5);
    scene.add(sun);

    const grouped = groupMaterial(material.properties);
    const surface = material.surface;
    const params: THREE.MeshPhongMaterialParameters = {
      color: new THREE.Color().setRGB(surface.baseColor[0], surface.baseColor[1], surface.baseColor[2], THREE.SRGBColorSpace),
      // Mirroring an object turns its triangles inside out, so it's drawn from both sides.
      side: surface.doubleSided || shape === 'plane' || shape === 'object' ? THREE.DoubleSide : THREE.FrontSide,
      shininess: 20,
      specular: new THREE.Color(0x000000),
    };
    if (surface.alpha === 'mask') params.alphaTest = surface.alphaCutoff ?? 0.5;
    if (surface.alpha === 'blend' || surface.additive) {
      params.transparent = true;
      params.opacity = surface.opacity;
      if (surface.additive) params.blending = THREE.AdditiveBlending;
    }
    const mat = new THREE.MeshPhongMaterial(params);
    const parts = shape === 'object' ? objectParts(sceneId, nodes, material.users, material.slot) : null;
    const geometry = shapeGeometry(shape, parts ? objectGeometry(parts) : null);
    const mesh = new THREE.Mesh(geometry, mat);
    scene.add(mesh);

    let raf = 0;
    const render = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Drag to turn the object.
    let drag: { x: number; y: number } | null = null;
    const canvas = renderer.domElement;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      mesh.rotation.y += (e.clientX - drag.x) * 0.01;
      mesh.rotation.x += (e.clientY - drag.y) * 0.01;
      drag = { x: e.clientX, y: e.clientY };
      render();
    };
    const up = () => (drag = null);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);

    const textureOf = async (name: string, color: boolean): Promise<THREE.Texture | null> => {
      const found = findProp(grouped, name);
      if (!found || !found.prop.enabled || !found.feature.on) return null;
      const { textureId } = textureRef(found.prop);
      const info = textureId !== null ? textures.get(textureId) : undefined;
      if (!info) return null;
      return fetchGameTexture(sceneId, info, { maxEdge: PREVIEW_EDGE, color, signal: abort.signal });
    };
    const value = (name: string) => {
      const found = findProp(grouped, name);
      return found && found.prop.enabled && found.feature.on ? mainValue(found.prop) : null;
    };
    const featureOn = (key: string) => grouped.features.find((f) => f.spec.key === key)?.on ?? false;

    const load = async () => {
      setStatus('Loading textures…');
      const [diffuse, normal, specularMask, illumination] = await Promise.all([
        textureOf('mapDiffuse', true),
        textureOf('mapNormal', false),
        textureOf('mapSpecularMask', false),
        textureOf('mapIllumination', true),
      ]);
      if (abort.signal.aborted) return;
      if (diffuse) mat.map = diffuse;
      if (normal) {
        mat.normalMap = normal;
        const scale = value('v4BumpScale');
        mat.normalScale.set(num(scale, 0, 1), num(scale, 1, 1));
      }
      if (featureOn('Specular')) {
        const colour = value('v4SpecularColor');
        const level = num(value('vSpecularLevel'), 0, 1);
        mat.specular.setRGB(num(colour, 0, 1) * level, num(colour, 1, 1) * level, num(colour, 2, 1) * level, THREE.SRGBColorSpace);
        mat.shininess = Math.max(1, num(value('v4SpecularPower'), 0, 20));
        if (specularMask) mat.specularMap = specularMask;
      }
      if (featureOn('Illumination')) {
        const colour = value('v4IlluminationColor');
        mat.emissive.setRGB(num(colour, 0, 1), num(colour, 1, 1), num(colour, 2, 1), THREE.SRGBColorSpace);
        if (illumination) mat.emissiveMap = illumination;
      }
      if (featureOn('Reflection')) {
        const env = findProp(grouped, 'mapEnvironment');
        const ref = env ? textureRef(env.prop) : null;
        const faces = ref?.textureId != null ? textures.get(ref.textureId)?.faces : null;
        if (faces) {
          const cube = await cubeTexture(sceneId, faces, textures, abort.signal);
          if (cube && !abort.signal.aborted) {
            mat.envMap = cube;
            mat.combine = THREE.AddOperation;
            mat.reflectivity = Math.min(1, num(value('vReflectionLevel'), 0, 0.3));
          }
        }
      }
      mat.needsUpdate = true;
      render();
      setStatus(null);
    };
    load().catch((err: unknown) => {
      if (abort.signal.aborted) return;
      setStatus(`Some textures couldn't be loaded: ${err instanceof Error ? err.message : String(err)}`);
      render();
    });

    return () => {
      abort.abort();
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      for (const t of [mat.map, mat.normalMap, mat.specularMap, mat.emissiveMap, mat.envMap]) t?.dispose();
      mat.dispose();
      geometry.dispose();
      renderer.dispose();
      canvas.remove();
    };
    // The object geometry only matters when the object shape is chosen; meshProgress brings it in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, material, textures, shape, shape === 'object' ? meshProgress : null]);

  const grouped = groupMaterial(material.properties);
  const notShown = grouped.features.filter((f) => f.on && !PREVIEWED.has(f.spec.key)).map((f) => f.spec.title);
  const envFromEngine = grouped.features.some(
    (f) => f.spec.key === 'Reflection' && f.on && f.textures.some((t) => t.name === 'mapEnvironment' && textureRef(t).engineSlot !== null),
  );

  return (
    <div className="mat-preview">
      <div className="mat-preview-canvas" ref={hostRef} role="img" aria-label={`Preview of ${material.name ?? 'the material'} on a ${shape}`} />
      <div className="mat-preview-bar">
        <Select<Shape>
          label="Preview shape"
          hideLabel
          compact
          value={shape}
          options={[
            { value: 'sphere', label: 'Sphere' },
            { value: 'cube', label: 'Cube' },
            { value: 'plane', label: 'Plane' },
            { value: 'object', label: hasObject ? 'Object using it' : 'Object (model not loaded)', disabled: !hasObject },
          ]}
          onChange={setShape}
        />
        <span className="mat-preview-hint">Drag to turn</span>
      </div>
      {status && (
        <p className="mat-preview-note" role="status">
          {status}
        </p>
      )}
      <p className="mat-preview-note">
        An approximation of the game’s shaders.
        {notShown.length ? ` Not shown: ${notShown.join(', ')}.` : ''}
        {envFromEngine ? ' The reflection uses an environment the game supplies at run time, so it isn’t shown.' : ''}
      </p>
    </div>
  );
}
