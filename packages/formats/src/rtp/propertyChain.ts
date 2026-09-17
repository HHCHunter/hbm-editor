import { decodeText } from '../binary/text';
import type { PeImage } from '../pe/PeImage';
import { ENUM_READER_VA, PROPERTY_LOADERS, type PropertyType } from './propertyTypes';

// Run-time property reflection ("RTP", serializerlib/rtp.h). A class's GetProperties returns a
// ZPropertyInfo { +0 First cNode*, +4 Super ZPropertyInfo*, +8 Name }, and each property record is a
// cNode { +0 m_Next, +4 m_Name, +8 m_Filter } followed by +0x0C, the type handler whose slot 0 is Load.
// RTP::LoadSerializable 0x00059800 loads the Super chain first, then this list in order, skipping
// records whose filter lacks bit `content` (0 for level files). Names are 0 in the PC executable.

export interface EnumOption {
  name: string;
  value: number;
}

export interface EnumInfo {
  va: number;
  name: string;
  /** Width of the destination field in bytes. */
  size: number;
  /** In declaration order. */
  options: EnumOption[];
}

export interface PropertyRecord {
  va: number;
  filter: number;
  loadRva: number;
  /** Null when the load function isn't one of the known level-file types. */
  type: PropertyType | null;
  enumInfo: EnumInfo | null;
}

export interface PropertyLevel {
  /** The ZPropertyInfo address; one per class that registers properties. */
  head: number;
  records: PropertyRecord[];
}

/** Level files use stream content 0. */
export const LEVEL_CONTENT = 0;
const MAX_RECORDS = 512;

const readName = (image: PeImage, va: number | null) => {
  const bytes = va ? image.cstringAtVa(va, 128) : null;
  return bytes ? decodeText(bytes) : null;
};

/**
 * ZEnumInfo { +0 m_Last, +4 m_Name, +8 m_Size } with entries { +0 m_Prev, +4 m_Value, +8 m_Name },
 * linked backwards from the last one.
 */
export function readEnumInfo(image: PeImage, va: number): EnumInfo | null {
  const name = readName(image, image.u32AtVa(va + 4));
  const size = image.u32AtVa(va + 8);
  if (name === null || size === null) return null;
  const options: EnumOption[] = [];
  const seen = new Set<number>();
  for (let entry = image.u32AtVa(va); entry && !seen.has(entry) && options.length < 1024; entry = image.u32AtVa(entry)) {
    seen.add(entry);
    const value = image.u32AtVa(entry + 4);
    const optionName = readName(image, image.u32AtVa(entry + 8));
    if (value === null || optionName === null) break;
    options.push({ name: optionName, value: value | 0 });
  }
  return { va, name, size, options: options.reverse() };
}

/**
 * Bitfield loaders push their ZEnumInfo (`68 imm32`) shortly before calling the shared reader, with
 * the other arguments pushed in between (`68 <info> 56 50 8B CF E8 <reader>`).
 */
function bitfieldInfo(image: PeImage, loadVa: number): EnumInfo | null {
  const body = image.bytesAtVa(loadVa, 96);
  if (!body) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let i = 0; i + 10 <= body.length; i++) {
    if (body[i] !== 0x68) continue;
    for (let k = i + 5; k <= i + 16 && k + 5 <= body.length; k++) {
      if (body[k] === 0xe8 && loadVa + k + 5 + view.getInt32(k + 1, true) === ENUM_READER_VA) {
        return readEnumInfo(image, view.getUint32(i + 1, true));
      }
    }
  }
  return null;
}

function readRecord(image: PeImage, va: number): PropertyRecord | null {
  const filter = image.u32AtVa(va + 8);
  const handler = image.u32AtVa(va + 12);
  const load = handler === null ? null : image.u32AtVa(handler);
  if (filter === null || load === null) return null;
  const loadRva = load - image.imageBase;
  const type = PROPERTY_LOADERS.get(loadRva) ?? null;

  let enumInfo: EnumInfo | null = null;
  if (type?.shape.kind === 'enum') {
    // Member enum records are 0x18 bytes with the info at +0x14; accessor ones 0x24 with it at +0x20.
    const infoVa = image.u32AtVa(va + (type.record === 'member' ? 0x14 : 0x20));
    enumInfo = infoVa ? readEnumInfo(image, infoVa) : null;
  } else if (type?.shape.kind === 'bitfield') {
    enumInfo = bitfieldInfo(image, load);
  }
  return { va, filter, loadRva, type, enumInfo };
}

/** Every level of a property chain, base class first. */
export function readPropertyChain(image: PeImage, headVa: number): PropertyLevel[] {
  const heads: number[] = [];
  for (let info: number | null = headVa; info && !heads.includes(info) && heads.length < 32; info = image.u32AtVa(info + 4)) {
    heads.push(info);
  }
  return heads.reverse().map((head) => {
    const records: PropertyRecord[] = [];
    const seen = new Set<number>();
    for (let node = image.u32AtVa(head); node && !seen.has(node) && records.length < MAX_RECORDS; node = image.u32AtVa(node)) {
      seen.add(node);
      const record = readRecord(image, node);
      if (!record) break;
      records.push(record);
    }
    return { head, records };
  });
}

/** Whether a record is loaded from a level file. */
export const inLevelFiles = (record: PropertyRecord) => (record.filter & (1 << LEVEL_CONTENT)) !== 0;
