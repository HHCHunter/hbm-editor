import * as THREE from 'three';
import type { TextureDTO } from '@hbm/protocol';
import { textureRgbaUrl } from '../api/endpoints';
import type { MeshPartData } from './meshStore';

/** The largest mip level no bigger than `maxEdge`, or the smallest stored level; -1 if none has data. */
export function levelFor(info: TextureDTO, maxEdge: number): number {
  const fits = info.levels.findIndex((l) => l.size > 0 && Math.max(l.width, l.height) <= maxEdge);
  return fits >= 0 ? fits : info.levels.findIndex((l) => l.size > 0);
}

export interface GameTextureOptions {
  maxEdge?: number;
  /** Colour data (diffuse, illumination) is sRGB; normal maps, masks and scales are linear. */
  color?: boolean;
  signal?: AbortSignal;
}

/**
 * A game texture as a three.js texture: one mip level decoded to RGBA by the server, mipmapped on
 * upload. Rows are stored top first, which is where Direct3D texture coordinates start.
 */
export async function fetchGameTexture(sceneId: string, info: TextureDTO, options: GameTextureOptions = {}): Promise<THREE.DataTexture> {
  const level = levelFor(info, options.maxEdge ?? 1024);
  const size = info.levels[level];
  if (!size) throw new Error(`texture ${info.id} has no stored image`);
  const res = await fetch(textureRgbaUrl(sceneId, info.id, level), { signal: options.signal });
  if (!res.ok) throw new Error(`texture ${info.id} failed (${res.status})`);
  const texture = new THREE.DataTexture(new Uint8Array(await res.arrayBuffer()), size.width, size.height);
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = options.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** A model part as three.js geometry, with vertex normals computed when the part has none. */
export function partGeometry(part: MeshPartData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
  if (part.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
  else geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
