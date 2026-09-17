import { hex, u32At, u8At } from '../binary/bytes';

// The compiled geom image inside a .GMS member, after unpackChunk. Layout from gms.md;
// ZEngineDataBase::CreateGeoms 0x0005F2D0 reaches each record as image + (dw0 & 0xFFFFFF) * 4.
//
//   image+0x00  offset of the geom entry table: u32 count, then { u32 dw0, u32 dw1 } per geom
//               dw0 >> 25        levels to ascend before placing this geom
//               dw0 & 0x01000000 this geom has children
//   image+0x3C  REF slot count

export interface GmsGeom {
  index: number;
  /** Parent geom index, or -1 when the scene root is the parent. */
  parent: number;
  /** 0 for children of the scene root. */
  depth: number;
  hasChildren: boolean;
  recordOffset: number;
  /** Byte offset of the geom's name in the sibling .BUF. */
  nameOffset: number;
  /** Image offset of the 9-float rotation, stored with its rows reversed. */
  rotationOffset: number;
  /** Image offset of the parent-local translation. */
  translationOffset: number;
  /** .PRM descriptor index of the geom's mesh root; 0 for none. Not a prim on every class. */
  prim: number;
  typeId: number;
  controlFlags: number;
  /** Byte offset of raw data in the sibling .BUF; 0 for none. */
  rawDataOffset: number;
  auxCount: number;
  /** 1-based REF slot id. */
  refId: number;
  poolGroup: number;
}

export interface GmsImage {
  image: Uint8Array;
  geoms: GmsGeom[];
  refSlots: number;
  problems: string[];
}

/** The geom count alone: the u32 at the head of the geom entry table. */
export function readGeomCount(image: Uint8Array): number {
  return u32At(image, u32At(image, 0));
}

export function readGms(image: Uint8Array): GmsImage {
  const table = u32At(image, 0);
  const count = u32At(image, table);
  const problems: string[] = [];
  const geoms: GmsGeom[] = [];
  const open: number[] = [];

  for (let i = 0; i < count; i++) {
    const dw0 = u32At(image, table + 4 + i * 8);
    const ascend = dw0 >>> 25;
    if (ascend > open.length) {
      problems.push(`geom ${i} ascends ${ascend} levels from depth ${open.length}`);
    }
    open.length = Math.max(0, open.length - ascend);

    const r = (dw0 & 0x00ffffff) * 4;
    const hasChildren = (dw0 & 0x01000000) !== 0;
    geoms.push({
      index: i,
      parent: open.length ? open[open.length - 1]! : -1,
      depth: open.length,
      hasChildren,
      recordOffset: r,
      nameOffset: u32At(image, r),
      rotationOffset: u32At(image, r + 0x04),
      translationOffset: u32At(image, r + 0x08),
      prim: u32At(image, r + 0x0c),
      typeId: u32At(image, r + 0x14),
      controlFlags: u32At(image, r + 0x1c),
      rawDataOffset: u32At(image, r + 0x20),
      auxCount: u32At(image, r + 0x28),
      refId: u32At(image, r + 0x30),
      poolGroup: u8At(image, r + 0x35),
    });
    if (hasChildren) open.push(i);
  }

  const refSlots = u32At(image, 0x3c);
  for (const g of geoms) {
    if (g.refId === 0 || g.refId > refSlots) {
      problems.push(`geom ${g.index} has REF slot ${g.refId}, outside 1..${refSlots}`);
      break;
    }
  }
  if (count && table + 4 + count * 8 > image.length) problems.push(`geom table at ${hex(table)} overruns the image`);

  return { image, geoms, refSlots, problems };
}
