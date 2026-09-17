// Request and response shapes shared by @hbm/server and @hbm/editor.

export const API_VERSION = 1;

/** Header every state-changing request must carry. The page reads the value from /api/session. */
export const TOKEN_HEADER = 'x-hbm-token';

export interface HealthDTO {
  ok: true;
  version: string;
  apiVersion: number;
}

export interface SessionDTO {
  token: string;
  version: string;
  apiVersion: number;
}

export interface ErrorDTO {
  error: string;
}

// ---------------------------------------------------------------- game install

export interface ConfigDTO {
  /** The install folder, or null until one is chosen. */
  gameRoot: string | null;
  exePath: string | null;
  /** Whether class names could be read from HitmanBloodMoney.exe. */
  classNames: boolean;
  dataDir: string;
}

/** POST /api/config/game. The executable, the install folder or its Scenes folder. */
export interface ChooseGameRequest {
  path: string;
}

export interface BrowseEntryDTO {
  name: string;
  path: string;
  kind: 'drive' | 'dir' | 'file';
  /** The entry is, or leads straight to, a Hitman: Blood Money install. */
  isGame: boolean;
}

export interface BrowseDTO {
  /** Null at the top level, which lists drives. */
  path: string | null;
  parent: string | null;
  entries: BrowseEntryDTO[];
  /** The install this folder belongs to, if it is one. */
  gameRoot: string | null;
}

// ---------------------------------------------------------------- scenes

export interface SceneListItemDTO {
  /** Path under Scenes without the extension, e.g. "M03/M03_main". */
  id: string;
  /** The mission folder, or "" for scenes at the top of Scenes. */
  group: string;
  bytes: number;
}

export interface SceneMemberDTO {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
}

export interface SceneSummaryDTO {
  id: string;
  members: SceneMemberDTO[];
  problems: string[];
}

export type NodeKindDTO = 'room' | 'group' | 'light' | 'camera' | 'mesh' | 'other';
export type HiddenReasonDTO = 'placeholder' | 'collision' | 'bounds' | 'shadow' | 'helper';

export interface SceneNodeDTO {
  index: number;
  /** Parent node index, or -1 under the scene root. */
  parent: number;
  depth: number;
  name: string;
  typeId: number;
  className: string | null;
  kind: NodeKindDTO;
  /** The .PRM model root this node draws, or 0. */
  meshRoot: number;
  /** Which character of a multi-character model it draws: 0 draws every object, otherwise only objects with this lVariantId. */
  variantId: number;
  boundingBox: string | number | null;
  inactive: boolean | null;
  controllers: string[];
}

export interface MeshRootDTO {
  root: number;
  parts: number;
  triangles: number;
  /** Union of the parts' LOD masks. */
  lodMask: number;
  variants: number[];
  hiddenReasons: HiddenReasonDTO[];
  weighted: boolean;
}

export interface ScenePropertyDTO {
  name: string;
  type: number;
  values: (number | string)[];
}

export interface SceneGraphDTO {
  id: string;
  nodes: SceneNodeDTO[];
  roots: MeshRootDTO[];
  sceneProperties: ScenePropertyDTO[];
  problems: string[];
}

/** GET /api/scene/transforms returns this many little-endian f32 per node: a row-major 3×3, then the translation. */
export const TRANSFORM_STRIDE = 12;

export interface PropertyTokenDTO {
  offset: number;
  kind: string;
  value: number | string;
}

/**
 * One property of a record, typed from its class's property chain in the executable. The PC
 * executable carries no property names, so properties are identified by class and position.
 */
export interface BoundPropertyDTO {
  /** The class that registered it, e.g. "ZGEOM". */
  owner: string;
  /** 1-based position among the record's level-file properties. */
  index: number;
  type: string;
  filter: number;
  value: number | boolean | string | number[] | string[] | null;
  /** For enums and bitfields: the enum type and its options. */
  enumName: string | null;
  options: string[] | null;
}

export interface RecordSchemaDTO {
  /** The class whose chain was used, or null when none was found and only raw tokens are shown. */
  className: string | null;
  properties: BoundPropertyDTO[];
  /** Class-specific data after the reflected properties (ScriptC variables, for one). */
  tailTokens: number;
  /** Why binding stopped early, if it did. */
  mismatch: string | null;
}

export interface NodeDetailDTO {
  node: SceneNodeDTO;
  gms: {
    recordOffset: number;
    nameOffset: number;
    prim: number;
    typeId: number;
    controlFlags: number;
    rawDataOffset: number;
    auxCount: number;
    refId: number;
    poolGroup: number;
  };
  /** World transform, TRANSFORM_STRIDE numbers. */
  transform: number[];
  properties: PropertyTokenDTO[];
  /** Null when the executable couldn't be read for schemas. */
  schema: RecordSchemaDTO | null;
  controllers: {
    name: string;
    properties: PropertyTokenDTO[];
    schema: RecordSchemaDTO | null;
    /** For ScriptC: the mission DLL script class its ScriptName matches, if any. */
    scriptCreator: string | null;
  }[];
}

export interface SurfaceDTO {
  slot: number;
  name: string | null;
  className: string;
  diffuseTextureId: number | null;
  baseColor: [number, number, number, number];
  alpha: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number | null;
  opacity: number;
  additive: boolean;
  doubleSided: boolean;
  hiddenReason: HiddenReasonDTO | null;
}

// ---------------------------------------------------------------- mission scripts

export interface ScriptCreatorDTO {
  name: string;
  /** Base classes, nearest first. */
  bases: string[];
  /** Instance size in bytes. */
  size: number;
  /** Scene objects whose ScriptC asks for this script. */
  users: number[];
}

export interface ScriptUserDTO {
  node: number;
  /** The ScriptC's ScriptName, e.g. "m11\\m11_bartenderassassin". */
  scriptName: string;
  /** The creator it names, matched by name; null when the mission DLL has none. */
  creator: string | null;
}

export interface SceneScriptsDTO {
  /** The scene's ScriptCModule, e.g. "M11". */
  module: string | null;
  /** The DLL file found for it under Scriptcs/_gamerelease. */
  dll: string | null;
  creators: ScriptCreatorDTO[];
  users: ScriptUserDTO[];
}

// ---------------------------------------------------------------- textures

export interface TextureDTO {
  id: number;
  name: string;
  format: 'DXT1' | 'DXT3' | 'RGBA' | 'I8' | 'U8V8' | 'PALN' | 'PALO';
  width: number;
  height: number;
  levels: { width: number; height: number; size: number }[];
  flags: number;
  scale: number;
  /** Material slots with an enabled stage naming this texture. */
  materials: number[];
  /** The six face ids of a cubemap. */
  faces: number[] | null;
}

// ---------------------------------------------------------------- localisation

export interface LocEntryDTO {
  name: string;
  path: string;
  flags: number;
  text: string | null;
  text2: string | null;
  soundId: number | null;
  hasChildren: boolean;
}

export interface LocLookupDTO {
  path: string;
  found: boolean;
  /** The engine matched only the start of a longer name (see loc.md). */
  shadowed: boolean;
  entry: LocEntryDTO | null;
}

// ---------------------------------------------------------------- classes

export interface ClassDTO {
  typeId: number;
  name: string;
  parentName: string | null;
  size: number;
}
