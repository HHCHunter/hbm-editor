import { cstringAt, f32At, hex, u16At, u32At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';

// The texture container (tex.md). The record grammar is what ZBitmap::LoadBin 0x0003E260 reads;
// the manager reaches records only through the 2048-entry id table T0, never by scanning.
//
//   +0x00 off0 (T0, and the end of the record stream)   +0x04 off4 (T1)   +0x08 0   +0x0C version
//   record: +0x00 size  +0x04 tag  +0x08 tag again  +0x0C id  +0x10 u16 height  +0x12 u16 width
//           +0x14 mip count  +0x18 flags  +0x1C f32 scale  +0x20 unk20  +0x24 name
//           then per mip, largest first: u32 size, pixels; then PALN/PALO: u32 count, RGBA quads

export type TexFormat = 'DXT1' | 'DXT3' | 'RGBA' | 'I8' | 'U8V8' | 'PALN' | 'PALO';

/** One ZBitmap subclass per tag; the tag dword reads as these values. */
const FORMATS: Record<number, TexFormat> = {
  0x44585431: 'DXT1',
  0x44585433: 'DXT3',
  0x52474241: 'RGBA',
  0x49382020: 'I8',
  0x55385638: 'U8V8',
  0x50414c4e: 'PALN',
  0x50414c4f: 'PALO',
};

const BYTES_PER_UNIT: Record<TexFormat, { bytes: number; block: boolean }> = {
  DXT1: { bytes: 8, block: true },
  DXT3: { bytes: 16, block: true },
  RGBA: { bytes: 4, block: false },
  I8: { bytes: 1, block: false },
  U8V8: { bytes: 2, block: false },
  PALN: { bytes: 1, block: false },
  PALO: { bytes: 1, block: false },
};

export const TEX_SLOTS = 2048;
export const TEX_FLAG_ID_LIST = 0x0100;
export const TEX_FLAG_CUBEMAP = 0x0400;
const HEADER = 0x10;
const RECORD_FIXED = 0x24;

export interface TexLevel {
  offset: number;
  size: number;
  width: number;
  height: number;
}

export interface TexRecord {
  offset: number;
  recordSize: number;
  format: TexFormat;
  id: number;
  width: number;
  height: number;
  flags: number;
  /** ZBitmap's scale factor; 1.0 on most records. */
  scale: number;
  unk20: number;
  name: string;
  levels: TexLevel[];
  paletteCount: number;
  paletteOffset: number;
}

export interface TexFile {
  data: Uint8Array;
  version: number;
  records: TexRecord[];
  byId: Map<number, TexRecord>;
  /** T1 blocks by owning id: cubemap face ids, or an id list. */
  idLists: Map<number, number[]>;
  levelCount: number;
  /** Bytes of the record stream no table entry reaches. */
  unreferencedBytes: number;
  problems: string[];
}

export function texLevelSize(format: TexFormat, width: number, height: number, level: number): number {
  const w = Math.max(1, width >> level);
  const h = Math.max(1, height >> level);
  const unit = BYTES_PER_UNIT[format];
  return unit.block ? Math.ceil(w / 4) * Math.ceil(h / 4) * unit.bytes : w * h * unit.bytes;
}

const align16 = (n: number) => (n + 15) & ~15;

export function readTex(data: Uint8Array): TexFile {
  const off0 = u32At(data, 0);
  const off4 = u32At(data, 4);
  const version = u32At(data, 12);
  if (off0 < HEADER || off4 + TEX_SLOTS * 4 > data.length) {
    throw new FormatError('id tables are outside the file', 0);
  }
  const problems: string[] = [];
  if (off4 !== off0 + TEX_SLOTS * 4) problems.push(`T1 at ${hex(off4)} doesn't follow T0 at ${hex(off0)}`);
  if (data.length !== off4 + TEX_SLOTS * 4) problems.push(`file doesn't end at the end of T1`);

  const records: TexRecord[] = [];
  const byId = new Map<number, TexRecord>();
  const idLists = new Map<number, number[]>();
  let levelCount = 0;
  const spans: { start: number; end: number }[] = [];

  for (let id = 0; id < TEX_SLOTS; id++) {
    const offset = u32At(data, off0 + id * 4);
    if (!offset) continue;
    if (id === 0) problems.push('T0[0] is set, but id 0 means "no texture"');
    try {
      const record = readRecord(data, offset, off0, problems);
      if (record.id !== id) problems.push(`T0[${id}] points at a record with id ${record.id}`);
      records.push(record);
      byId.set(id, record);
      levelCount += record.levels.length;
      spans.push({ start: offset, end: align16(offset + record.recordSize) });
    } catch (err) {
      if (!(err instanceof FormatError)) throw err;
      problems.push(`id ${id}: ${err.message}`);
    }
  }

  for (let id = 0; id < TEX_SLOTS; id++) {
    const offset = u32At(data, off4 + id * 4);
    if (!offset) continue;
    const count = u32At(data, offset);
    if (offset + 4 + count * 4 > off0) {
      problems.push(`T1[${id}] block at ${hex(offset)} overruns the record stream`);
      continue;
    }
    const ids: number[] = [];
    for (let i = 0; i < count; i++) ids.push(u32At(data, offset + 4 + i * 4));
    idLists.set(id, ids);
    spans.push({ start: offset, end: align16(offset + 4 + count * 4) });
    const owner = byId.get(id);
    if (!owner) problems.push(`T1[${id}] is set but there is no record ${id}`);
    else if (!(owner.flags & (TEX_FLAG_ID_LIST | TEX_FLAG_CUBEMAP))) {
      problems.push(`T1[${id}] is set but record ${id} is neither a cubemap nor an id list`);
    }
  }

  // What the tables reach must not overlap. Bytes they don't reach are legal: shipped files carry
  // id-list blocks that no T1 entry points to.
  spans.sort((a, b) => a.start - b.start);
  let expected = HEADER;
  let unreferencedBytes = 0;
  for (const span of spans) {
    if (span.start < expected) problems.push(`stream items overlap at ${hex(span.start)}`);
    else unreferencedBytes += span.start - expected;
    expected = Math.max(expected, span.end);
  }
  if (expected > off0) problems.push(`stream runs past T0 (${hex(off0)})`);
  else unreferencedBytes += off0 - expected;

  records.sort((a, b) => a.id - b.id);
  return { data, version, records, byId, idLists, levelCount, unreferencedBytes, problems };
}

function readRecord(data: Uint8Array, offset: number, streamEnd: number, problems: string[]): TexRecord {
  const recordSize = u32At(data, offset);
  const tag = u32At(data, offset + 4);
  const format = FORMATS[tag];
  if (!format) throw new FormatError(`unknown texture format tag ${hex(tag)}`, offset + 4);
  // LoadBin asserts the second copy of the tag matches the class it was constructed as.
  if (u32At(data, offset + 8) !== tag) throw new FormatError('the two format tags disagree', offset + 8);
  const end = offset + recordSize;
  if (end > streamEnd) throw new FormatError('record runs past the end of the record stream', offset);

  const id = u32At(data, offset + 0x0c);
  const height = u16At(data, offset + 0x10);
  const width = u16At(data, offset + 0x12);
  const mipCount = u32At(data, offset + 0x14);
  const flags = u32At(data, offset + 0x18);
  const scale = f32At(data, offset + 0x1c);
  const unk20 = u32At(data, offset + 0x20);
  const nameBytes = cstringAt(data, offset + RECORD_FIXED);
  const name = decodeText(nameBytes);
  const where = () => `id ${id} (${name || 'unnamed'})`;

  let cursor = offset + RECORD_FIXED + nameBytes.length + 1;
  const levels: TexLevel[] = [];
  for (let level = 0; level < mipCount; level++) {
    if (cursor + 4 > end) throw new FormatError(`mip ${level} runs past the record`, cursor);
    const size = u32At(data, cursor);
    cursor += 4;
    const expected = texLevelSize(format, width, height, level);
    if (size !== expected) problems.push(`${where()}: mip ${level} holds ${size} bytes; ${format} ${width}×${height} needs ${expected}`);
    if (cursor + size > end) throw new FormatError(`mip ${level} runs past the record`, cursor);
    levels.push({ offset: cursor, size, width: Math.max(1, width >> level), height: Math.max(1, height >> level) });
    cursor += size;
  }

  let paletteCount = 0;
  let paletteOffset = 0;
  const left = end - cursor;
  if (format === 'PALN' || format === 'PALO') {
    if (left < 4) {
      problems.push(`${where()}: ${format} record has no palette`);
    } else {
      paletteCount = u32At(data, cursor);
      paletteOffset = cursor + 4;
      const expected = 4 + paletteCount * 4 + (format === 'PALO' ? width * height : 0);
      if (left !== expected) problems.push(`${where()}: palette section is ${left} bytes, expected ${expected}`);
    }
  } else if (left !== 0) {
    problems.push(`${where()}: ${left} unexplained bytes after the mips`);
  }

  return { offset, recordSize, format, id, width, height, flags, scale, unk20, name, levels, paletteCount, paletteOffset };
}
