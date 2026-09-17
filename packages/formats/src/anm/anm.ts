import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';

// Scene animation files (.ANM, anm.md). The container is the engine's CHUNKFILE, as
// Animation::Manager::LoadDataBlock (0x0018C680) walks it:
//   +0x00 type  +0x04 flags  +0x08 data offset  +0x0C child count  +0x10 table size
//   flags bit 31: has children; bit 30: children follow a table (+0x14 + tableSize*4) instead of +0x10;
//   low 30 bits: extent including the header. Data is at +[+8] when either top bit is set, else +8.
// The manager block holds a 13-dword header (0x34 bytes), the clip headers (0x40 each), the packed
// key data, then NUL-separated bone, animation and pose names. Clip decoding (the shared bitstream
// decoder 0x00188C10, StateFit) is not reimplemented, so only the headers are read here.

export interface AnmChunk {
  offset: number;
  type: number;
  extent: number;
  /** Absolute offset of the chunk's data. */
  data: number;
  children: AnmChunk[];
}

export const ANM_MAGIC = 0x004d4e41; // "ANM\0" read as a little-endian dword ("MNA\0" on disk... see anm.md)
/** Chunk types seen at the top of scene files: collection names, collection bodies, the manager block. */
export const ANM_CHUNK = { COLLECTION: 5, COLLECTION_BODY: 6, MANAGER: 4 } as const;

export const CLIP_QUATS = 0x02;
export const CLIP_HUMAN_STATE = 0x04;
export const CLIP_BONE_LIST = 0x10;
export const CLIP_POSE = 0x20;
export const CLIP_FRAME_SNAP = 0x04000000;
/** The bone id of the root (ground) track. */
export const ROOT_TRACK_BONE = 0x38;

export interface AnmClip {
  index: number;
  name: string;
  /** Human-state channel bits. */
  states: number;
  frames: number;
  fps: number;
  mask: number;
  blendFrames: number;
  /** Bone ids the clip animates (the root track id 0x38 included when present). */
  boneIds: number[];
  soundIndex: number;
}

export interface AnmFile {
  root: AnmChunk;
  /** "anmcol:animationdatabase#<Name>" collection names. */
  collections: string[];
  boneNames: string[];
  poseNames: string[];
  clips: AnmClip[];
  problems: string[];
}

const MAX_DEPTH = 8;

function readChunk(bytes: Uint8Array, view: DataView, at: number, depth: number): AnmChunk {
  if (at + 16 > bytes.length) throw new FormatError('chunk header runs past the end', at);
  const type = view.getUint32(at, true);
  const flags = view.getUint32(at + 4, true);
  const extent = flags & 0x3fffffff;
  const hasData = (flags & 0xc0000000) !== 0;
  const data = hasData ? at + view.getUint32(at + 8, true) : at + 8;
  if (extent < 8 || at + extent > bytes.length) throw new FormatError(`chunk extent ${extent} runs past the end`, at);

  const children: AnmChunk[] = [];
  if (flags & 0x80000000 && depth < MAX_DEPTH) {
    const count = view.getUint32(at + 12, true);
    let child = flags & 0x40000000 ? at + 0x14 + view.getUint32(at + 16, true) * 4 : at + 0x10;
    // Children sit between the header (or table) and the chunk's own data.
    const end = hasData && data > at ? Math.min(data, at + extent) : at + extent;
    for (let i = 0; i < count && child + 8 <= end; i++) {
      const c = readChunk(bytes, view, child, depth + 1);
      children.push(c);
      child += c.extent;
    }
  }
  return { offset: at, type, extent, data, children };
}

/** NUL-separated names in [start, start + size). */
function names(bytes: Uint8Array, start: number, size: number, count: number): string[] {
  const out: string[] = [];
  let at = start;
  const end = Math.min(bytes.length, start + size);
  while (at < end && out.length < count) {
    let nul = at;
    while (nul < end && bytes[nul] !== 0) nul++;
    out.push(decodeText(bytes.subarray(at, nul)));
    at = nul + 1;
  }
  return out;
}

export function readAnm(bytes: Uint8Array): AnmFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const root = readChunk(bytes, view, 0, 0);
  const problems: string[] = [];

  const collections = root.children
    .filter((c) => c.type === ANM_CHUNK.COLLECTION)
    .map((c) => names(bytes, c.data, c.offset + c.extent - c.data, 1)[0] ?? '');

  // The manager block: found by chunk type in shipped files; the caller that hands it to
  // LoadDataBlock isn't reimplemented yet.
  const manager = root.children.find((c) => c.type === ANM_CHUNK.MANAGER);
  if (!manager) return { root, collections, boneNames: [], poseNames: [], clips: [], problems: ['no manager block'] };

  const m = manager.data;
  const u32 = (at: number) => view.getUint32(at, true);
  const [animCount, dataSize, boneNamesSize, animNamesSize, poseNamesSize, boneCount, animNameCount, poseCount] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => u32(m + i * 4)) as number[];
  const headers = m + 0x34;
  const dataBlock = headers + animCount! * 0x40;
  const boneNamesAt = dataBlock + dataSize!;
  const animNamesAt = boneNamesAt + boneNamesSize!;
  const poseNamesAt = animNamesAt + animNamesSize!;
  if (poseNamesAt + poseNamesSize! > bytes.length) {
    return { root, collections, boneNames: [], poseNames: [], clips: [], problems: ['manager block runs past the end'] };
  }
  const boneNames = names(bytes, boneNamesAt, boneNamesSize!, boneCount!);
  const animNames = names(bytes, animNamesAt, animNamesSize!, animNameCount!);
  const poseNames = names(bytes, poseNamesAt, poseNamesSize!, poseCount!);
  if (animNames.length !== animCount) problems.push(`${animCount} clips but ${animNames.length} names`);

  const clips: AnmClip[] = [];
  for (let i = 0; i < animCount!; i++) {
    const h = headers + i * 0x40;
    const mask = u32(h + 8);
    const stateOffset = view.getInt32(h + 0x10, true);
    const quatOffset = view.getInt32(h + 0x14, true);
    const groundOffset = view.getInt32(h + 0x18, true);

    // Bone ids: an explicit list (count, then u32 ids) or the quat track's own table (u8 count, u16 ids).
    let boneIds: number[] = [];
    try {
      if (mask & CLIP_BONE_LIST && stateOffset >= 0) {
        const at = dataBlock + stateOffset;
        const count = u32(at);
        if (count < 256) boneIds = Array.from({ length: count }, (_, k) => u32(at + 4 + k * 4));
      } else if (mask & CLIP_QUATS && quatOffset >= 0) {
        const at = dataBlock + quatOffset;
        const count = bytes[at]!;
        boneIds = Array.from({ length: count }, (_, k) => view.getUint16(at + 1 + k * 2, true));
      }
      if (groundOffset >= 0 && !boneIds.includes(ROOT_TRACK_BONE)) boneIds.push(ROOT_TRACK_BONE);
    } catch {
      problems.push(`clip ${i}: bone list runs past the end`);
    }

    clips.push({
      index: i,
      name: animNames[i] ?? '',
      states: view.getInt16(h, true),
      frames: view.getInt16(h + 4, true),
      fps: view.getInt16(h + 6, true),
      mask,
      blendFrames: view.getFloat32(h + 0x24, true),
      boneIds,
      soundIndex: view.getInt32(h + 0x38, true),
    });
  }
  return { root, collections, boneNames, poseNames, clips, problems };
}
