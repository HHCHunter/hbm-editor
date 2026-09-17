// The scene join: turns a scene archive's readers into a scene graph, mesh parts and surfaces.
// Pure TypeScript like @hbm/formats, so it runs on the server and in the browser.

export { SceneArchive, type PrpStream, type SceneArchiveOptions } from './archive';
export {
  ZLOADER_SEQUENCE_SETUP,
  buildSceneGraph,
  leafName,
  type NodeKind,
  type SceneGraph,
  type SceneGraphInput,
  type SceneNode,
} from './graph';
export { lodLevels, meshParts, type MeshPart } from './parts';
export {
  DRAW_MODE_NOT_A_SURFACE,
  describeSurface,
  partHiddenReason,
  type AlphaMode,
  type HiddenReason,
  type Surface,
} from './surfaces';
export {
  MESH_PACK_VERSION,
  decodeMeshPack,
  encodeMeshPack,
  type MeshPack,
  type MeshPackPart,
  type PackRange,
} from './meshPack';
