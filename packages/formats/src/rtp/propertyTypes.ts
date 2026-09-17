import type { PrpTokenKind } from '../prp/PrpCursor';

// What each property load callback reads from a level stream. A property record's +0x0C points at a
// type handler whose first slot is Load; the load function's address says which type it is. The
// functions are the retail executable's (addresses relative to the 0x00400000 image base), and the
// corpus sweep checks every level record in the shipped scenes binds against this table.

export type PropertyShape =
  | { kind: 'scalar'; token: PrpTokenKind }
  | { kind: 'array'; token: PrpTokenKind; count: number }
  | { kind: 'enum' }
  | { kind: 'bitfield' }
  | { kind: 'referenceTable' }
  | { kind: 'raw' };

export interface PropertyType {
  /** Display name of the type, e.g. "float32[3]". */
  type: string;
  /** Member records store the value at an offset; accessor records call get/set functions. */
  record: 'member' | 'accessor';
  shape: PropertyShape;
}

const scalar = (type: string, token: PrpTokenKind, record: PropertyType['record'] = 'member'): PropertyType => ({
  type,
  record,
  shape: { kind: 'scalar', token },
});
const array = (type: string, token: PrpTokenKind, count: number, record: PropertyType['record'] = 'member'): PropertyType => ({
  type: `${type}[${count}]`,
  record,
  shape: { kind: 'array', token, count },
});

/** Load function RVA → type. */
export const PROPERTY_LOADERS: ReadonlyMap<number, PropertyType> = new Map<number, PropertyType>([
  [0x00059920, { type: 'enum', record: 'member', shape: { kind: 'enum' } }],
  [0x002a0070, { type: 'enum', record: 'accessor', shape: { kind: 'enum' } }],
  [0x002a0050, scalar('resource-name', 'string')],
  [0x002a14c0, scalar('resource-name', 'string', 'accessor')],
  [0x002a1400, scalar('message', 'string')],
  [0x002a13c0, scalar('geom-reference', 'string')],
  [0x002a16e0, scalar('geom-reference', 'string', 'accessor')],
  [0x002a3160, scalar('geom-reference', 'string')],
  [0x002a1560, scalar('int32', 'u32')],
  [0x002a3060, scalar('int32', 'u32', 'accessor')],
  [0x002a2ce0, scalar('uint32', 'u32')],
  [0x002a3430, scalar('uint32', 'u32', 'accessor')],
  [0x002a2c00, scalar('int16', 'u16')],
  [0x002a3220, scalar('uint16', 'u16')],
  [0x002a2e10, scalar('uint8', 'u8')],
  [0x002a2a80, scalar('bool', 'bool')],
  [0x002a2a10, scalar('bool', 'bool', 'accessor')],
  [0x002a2c50, scalar('float32', 'f32')],
  [0x002a2b70, scalar('float32', 'f32', 'accessor')],
  [0x002a2ad0, { type: 'bitfield', record: 'member', shape: { kind: 'bitfield' } }],
  [0x002a31a0, { type: 'bitfield', record: 'member', shape: { kind: 'bitfield' } }],
  [0x002a31e0, { type: 'bitfield', record: 'member', shape: { kind: 'bitfield' } }],
  [0x002a3500, { type: 'bitfield', record: 'accessor', shape: { kind: 'bitfield' } }],
  [0x002a2be0, array('float32', 'f32', 3)],
  [0x002a32b0, array('float32', 'f32', 3, 'accessor')],
  [0x002a2fb0, array('float32', 'f32', 4)],
  [0x002a3650, array('float32', 'f32', 9, 'accessor')],
  [0x002a2ee0, array('float32', 'f32', 12)],
  [0x002a2df0, array('float32', 'f32', 32)],
  [0x002a2e80, array('int32', 'u32', 3)],
  [0x002a3110, array('int32', 'u32', 3)],
  [0x002a35d0, array('int32', 'u32', 21)],
  [0x002a2ec0, array('uint32', 'u32', 32)],
  [0x002a2ea0, array('uint32', 'u32', 64)],
  [0x002a35f0, array('uint32', 'u32', 128)],
  [0x002a0010, { type: 'raw-data', record: 'member', shape: { kind: 'raw' } }],
  [0x002a0130, { type: 'raw-data', record: 'member', shape: { kind: 'raw' } }],
  [0x002a02f0, { type: 'reference-table', record: 'member', shape: { kind: 'referenceTable' } }],
  [0x002a15d0, { type: 'reference-table', record: 'member', shape: { kind: 'referenceTable' } }],
  [0x002a0310, { type: 'reference-table', record: 'accessor', shape: { kind: 'referenceTable' } }],
]);

/** The shared enum/bitfield reader the bitfield loaders call with their ZEnumInfo (VA). */
export const ENUM_READER_VA = 0x004599f0;
