import { f32At, u32At, u8At } from '../binary/bytes';
import { decodeText } from '../binary/text';
import { PRIM_TYPE, type PrmFile } from './prm';

// A model root's skeleton (prm.md, "Skinning"). ZPrimControlWintel::GetBonesNr (0x0006DA00) finds it:
// the root must be lType 7 with lPropertyFlags bit 0, lPropertyData is a descriptor of four u32s, and
// slot 1 of that is the BoneDeclHeader, itself descriptor indices:
//   +0x00 nBones  +0x04 SBoneDefinition[]  +0x08 global bind 3x4[]  +0x0C parent-relative 3x4[]
// The byte-matched getters (zprimcontrolwintel.cpp) read the same slots. An SBoneDefinition is
//   +0x00 V3 Center  +0x0C lPrevBoneNr (0xFFFFFFFF for the root)  +0x10 V3 Size  +0x1C char Name[34]
//   +0x3E u8 Id  +0x3F u8 BodyPart

export interface Bone {
  index: number;
  name: string;
  /** Parent bone index, or -1 for the root. */
  parent: number;
  id: number;
  bodyPart: number;
  center: [number, number, number];
  size: [number, number, number];
  /** Model-space bind transform: row-major 3x3 on column vectors, then the translation. */
  global: number[];
  /** The same relative to the parent bone. */
  local: number[];
}

export interface Skeleton {
  root: number;
  bones: Bone[];
}

const BONE_DEFINITION = 0x40;
const MATRIX = 48;

export function readSkeleton(prm: PrmFile, root: number): Skeleton | null {
  const header = prm.objectHeader(root);
  if (!header || header.type !== PRIM_TYPE.OBJECT_HEADER || !(header.propertyFlags & 1)) return null;
  const properties = prm.descriptor(header.propertyData);
  if (!properties || properties.size < 8) return null;
  const decl = prm.descriptor(u32At(prm.data, properties.offset + 4));
  if (!decl || decl.size < 0x10) return null;

  const count = u32At(prm.data, decl.offset);
  const defs = prm.descriptor(u32At(prm.data, decl.offset + 4));
  const global = prm.descriptor(u32At(prm.data, decl.offset + 8));
  const local = prm.descriptor(u32At(prm.data, decl.offset + 12));
  if (!count || count > 255 || !defs || defs.size < count * BONE_DEFINITION) return null;
  if (!global || global.size < count * 12 * 4) return null;

  const floats = (at: number, n: number) => Array.from({ length: n }, (_, i) => f32At(prm.data, at + i * 4));
  // Bind matrices are stored like GMS placements: the 3x3 with its rows reversed, transposed. Decoded
  // that way, every shipped bone's global transform is its parent's global composed with its local one.
  const matrix = (at: number) => {
    const m = floats(at, 12);
    return [m[6]!, m[3]!, m[0]!, m[7]!, m[4]!, m[1]!, m[8]!, m[5]!, m[2]!, m[9]!, m[10]!, m[11]!];
  };
  const bones: Bone[] = [];
  for (let i = 0; i < count; i++) {
    const d = defs.offset + i * BONE_DEFINITION;
    const nameBytes = prm.data.subarray(d + 0x1c, d + 0x1c + 34);
    const nul = nameBytes.indexOf(0);
    const parent = u32At(prm.data, d + 0x0c);
    bones.push({
      index: i,
      name: decodeText(nul < 0 ? nameBytes : nameBytes.subarray(0, nul)),
      parent: parent === 0xffffffff || parent >= count ? -1 : parent,
      id: u8At(prm.data, d + 0x3e),
      bodyPart: u8At(prm.data, d + 0x3f),
      center: floats(d, 3) as [number, number, number],
      size: floats(d + 0x10, 3) as [number, number, number],
      global: matrix(global.offset + i * MATRIX),
      local: local && local.size >= count * MATRIX ? matrix(local.offset + i * MATRIX) : [],
    });
  }
  return { root, bones };
}

/** `a ∘ b` for 3x4 transforms stored as a row-major 3x3 on column vectors plus a translation. */
export function composeTransforms(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    out[9 + r] = a[r * 3]! * b[9]! + a[r * 3 + 1]! * b[10]! + a[r * 3 + 2]! * b[11]! + a[9 + r]!;
  }
  return out;
}
