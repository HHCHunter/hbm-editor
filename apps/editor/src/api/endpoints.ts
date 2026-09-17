import type {
  BrowseDTO,
  ConfigDTO,
  LocEntryDTO,
  LocLookupDTO,
  NodeDetailDTO,
  SceneGraphDTO,
  SceneListItemDTO,
  SceneScriptsDTO,
  SkeletonDTO,
  SurfaceDTO,
  TextureDTO,
} from '@hbm/protocol';
import { decodeMeshPack, type MeshPack } from '@hbm/scene';
import { getBytes, getJson, postJson } from './client';

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  return q.toString();
};
const sceneUrl = (route: string, scene: string, params: Record<string, string | number | undefined> = {}) =>
  `/api/scene/${route}?${query({ scene, ...params })}`;

export const getConfig = () => getJson<ConfigDTO>('/api/config');
export const chooseGame = (path: string) => postJson<ConfigDTO>('/api/config/game', { path });
export const browse = (path?: string) => getJson<BrowseDTO>(`/api/browse?${query({ path })}`);
export const listScenes = () => getJson<SceneListItemDTO[]>('/api/scenes');

export const getGraph = (scene: string) => getJson<SceneGraphDTO>(sceneUrl('graph', scene));
export const getSurfaces = (scene: string) => getJson<SurfaceDTO[]>(sceneUrl('surfaces', scene));
export const getNodeDetail = (scene: string, index: number, signal?: AbortSignal) =>
  getJson<NodeDetailDTO>(sceneUrl('node', scene, { index }), signal);

/** World transforms, 12 floats per node. */
export async function getTransforms(scene: string): Promise<Float32Array> {
  const bytes = await getBytes(sceneUrl('transforms', scene));
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export async function getMeshPack(scene: string, roots: number[], signal?: AbortSignal): Promise<MeshPack> {
  return decodeMeshPack(await getBytes(sceneUrl('meshes', scene, { roots: roots.join(',') }), signal));
}

export const listTextures = (scene: string) => getJson<TextureDTO[]>(sceneUrl('textures', scene));
export const textureUrl = (scene: string, id: number, level?: number) => sceneUrl('texture', scene, { id, level, as: 'png' });
/** Raw R, G, B, A bytes, rows top first. */
export const textureRgbaUrl = (scene: string, id: number, level: number) => sceneUrl('texture', scene, { id, level, as: 'rgba' });

export const getSkeleton = (scene: string, root: number) => getJson<SkeletonDTO>(sceneUrl('skeleton', scene, { root }));

export const getSceneScripts = (scene: string) => getJson<SceneScriptsDTO>(sceneUrl('scripts', scene));

export const locChildren = (scene: string, path: string) => getJson<LocEntryDTO[]>(sceneUrl('loc/children', scene, { path }));
export const locLookup = (scene: string, path: string) => getJson<LocLookupDTO>(sceneUrl('loc/lookup', scene, { path }));
export const locSearch = (scene: string, q: string) => getJson<LocEntryDTO[]>(sceneUrl('loc/search', scene, { q, limit: 200 }));
