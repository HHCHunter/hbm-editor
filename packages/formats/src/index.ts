// Game file readers: pure TypeScript over Uint8Array, with no Node APIs, so they run on the server
// and in the browser alike.

export { FormatError } from './binary/FormatError';
export { ByteReader } from './binary/ByteReader';
export { ByteWriter } from './binary/ByteWriter';
export { cstringAt, hex, i32At, u16At, u32At, u8At } from './binary/bytes';
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

export { readGeomCount } from './gms/gmsImage';
