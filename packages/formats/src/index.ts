// Game file readers: pure TypeScript over Uint8Array, with no Node APIs, so they run on the server
// and in the browser alike.

export { FormatError } from './binary/FormatError';
export { ByteReader } from './binary/ByteReader';
export { ByteWriter } from './binary/ByteWriter';
export { cstringAt, f32At, hex, i32At, u16At, u32At, u8At } from './binary/bytes';
export { asciiLower, decodeText, latin1Bytes } from './binary/text';
export { crc32 } from './binary/crc32';
export { bytesSource, type Codec, type RandomAccess } from './io';

export {
  checkLocalHeader,
  findMember,
  memberKey,
  readMember,
  readZipDirectory,
  type ZipDirectory,
  type ZipEntry,
} from './zip/zipDirectory';
export { cacheFileName } from './zip/cacheFileName';
export { unpackChunk, type PackedChunk } from './zip/packedChunk';

export {
  LOC_CHILDREN,
  LOC_SOUND,
  LOC_TEXT,
  LOC_TEXT2,
  LocDatabase,
  type LocChild,
  type LocLookupResult,
  type LocRecord,
  type LocWalkResult,
} from './loc/LocDatabase';

export {
  PRP_DICTIONARY,
  PRP_PAYLOAD,
  PRP_STRING_TABLE,
  PRP_TEXT,
  readPrpHeader,
  type PrpHeader,
} from './prp/header';
export { PrpCursor, type PrpToken, type PrpTokenKind } from './prp/PrpCursor';
export {
  readPrpTree,
  readRecordTokens,
  type PrpController,
  type PrpNode,
  type PrpRange,
  type PrpSceneProperty,
  type PrpTree,
} from './prp/PrpTree';
export { readGeomHead, type PrpGeomHead } from './prp/geomHead';

export { PeImage, type PeSection } from './pe/PeImage';
export { demangleTypeName, findPrimaryVtables, type VtableIndex } from './pe/msvcRtti';
export { PROPERTY_LOADERS, type PropertyShape, type PropertyType } from './rtp/propertyTypes';
export {
  inLevelFiles,
  readEnumInfo,
  readPropertyChain,
  type EnumInfo,
  type EnumOption,
  type PropertyLevel,
  type PropertyRecord,
} from './rtp/propertyChain';
export { findControllerClasses, namesAgree, type ControllerClass } from './rtp/factories';
export { resolveSchemas, type ClassSchema, type SchemaLevel, type SchemaRegistry } from './rtp/schemas';
export { bindRecord, type BoundProperty, type BoundRecord, type BoundValue } from './rtp/bindRecord';
export { SCRIPTS_EXPORT_ORDINAL, readScriptCreators, scriptCreatorKey, type ScriptCreator } from './scripts/missionDll';
export {
  HARVESTED_REGISTRATIONS,
  geomFamily,
  isA,
  resolveClassRegistry,
  type ClassInfo,
  type ClassRegistration,
  type ClassRegistry,
  type GeomFamily,
} from './classreg/classRegistry';

export { readGeomCount, readGms, type GmsGeom, type GmsImage } from './gms/gms';
export { computePlacements, type Placements } from './gms/placements';
export { bufString } from './buf/buf';

export {
  TEX_FLAG_CUBEMAP,
  TEX_FLAG_ID_LIST,
  TEX_SLOTS,
  readTex,
  texLevelSize,
  type TexFile,
  type TexFormat,
  type TexLevel,
  type TexRecord,
} from './tex/tex';
export { decodeTexLevel, firstLevelWithData, type DecodedImage } from './tex/decode';

export {
  PRIM_SUBTYPE_WEIGHTED,
  PRIM_TYPE,
  PrmFile,
  strideCandidates,
  type PrimHeader,
  type PrimMesh,
  type PrimObject,
  type PrimObjectHeader,
  type PrimSubMesh,
  type PrmDescriptor,
} from './prm/prm';
export {
  VERTEX_LAYOUTS,
  decodeVertices,
  layoutForMaterialClass,
  unpackNormal,
  type DecodedVertices,
  type VertexLayout,
} from './prm/vertices';

export { MAT_FLOAT, MAT_INT, MAT_LIST, MAT_STRING, MatFile, type MatEntry, type MatMaterial, type MatNode } from './mat/mat';
export {
  bindProperties,
  colorProperty,
  renderState,
  textureStages,
  type MatRenderState,
  type MatTextureStage,
} from './mat/materialProps';
