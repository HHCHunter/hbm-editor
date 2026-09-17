import { latin1Bytes } from '../../src/binary/text';
import type { TexFormat } from '../../src/tex/tex';

// Hand-built GMS images, TEX, PRM and MAT files for unit tests. Nothing here comes from the game.

/** A little-endian bump allocator over a fixed buffer. */
class Arena {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  top: number;

  constructor(size: number, start: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
    this.top = start;
  }

  alloc(size: number, align = 4): number {
    this.top = Math.ceil(this.top / align) * align;
    const at = this.top;
    this.top += size;
    return at;
  }

  u32(at: number, v: number): void {
    this.view.setUint32(at, v >>> 0, true);
  }
  u16(at: number, v: number): void {
    this.view.setUint16(at, v, true);
  }
  f32(at: number, v: number): void {
    this.view.setFloat32(at, v, true);
  }
  cstring(text: string, align = 1): number {
    const b = latin1Bytes(text);
    const at = this.alloc(b.length + 1, align);
    this.bytes.set(b, at);
    return at;
  }
  finish(end = this.top): Uint8Array {
    return this.bytes.slice(0, end);
  }
}

// ---------------------------------------------------------------- GMS image

export interface GeomSpec {
  /** Levels to ascend before placing this geom. */
  ascend: number;
  hasChildren: boolean;
  /** The 9 floats as stored (rows reversed relative to the rotation). */
  stored: number[];
  translation: number[];
  prim?: number;
  typeId?: number;
  refId?: number;
}

export function makeGmsImage(geoms: GeomSpec[], refSlots = geoms.length + 1): Uint8Array {
  const a = new Arena(0x10000, 0x48);
  const table = a.alloc(4 + geoms.length * 8);
  a.u32(0, table);
  a.u32(0x3c, refSlots);
  a.u32(table, geoms.length);
  geoms.forEach((g, i) => {
    const rotation = a.alloc(36);
    g.stored.forEach((v, k) => a.f32(rotation + 4 * k, v));
    const translation = a.alloc(12);
    g.translation.forEach((v, k) => a.f32(translation + 4 * k, v));
    const record = a.alloc(0x40);
    a.u32(record + 0x04, rotation);
    a.u32(record + 0x08, translation);
    a.u32(record + 0x0c, g.prim ?? 0);
    a.u32(record + 0x14, g.typeId ?? 0x00200001);
    a.u32(record + 0x30, g.refId ?? i + 1);
    const dw0 = ((record / 4) | (g.hasChildren ? 0x01000000 : 0) | (g.ascend << 25)) >>> 0;
    a.u32(table + 4 + i * 8, dw0);
  });
  return a.finish();
}

// ---------------------------------------------------------------- TEX

const TAGS: Record<TexFormat, number> = {
  DXT1: 0x44585431,
  DXT3: 0x44585433,
  RGBA: 0x52474241,
  I8: 0x49382020,
  U8V8: 0x55385638,
  PALN: 0x50414c4e,
  PALO: 0x50414c4f,
};

export interface TexSpec {
  id: number;
  format: TexFormat;
  width: number;
  height: number;
  levels: Uint8Array[];
  flags?: number;
  name?: string;
  /** RGBA quads, for PALN. */
  palette?: Uint8Array;
}

export function makeTex(
  records: TexSpec[],
  options: { idLists?: { owner: number; ids: number[] }[]; orphanBlocks?: number[][] } = {},
): Uint8Array {
  const a = new Arena(0x40000, 0x10);
  const t0 = new Map<number, number>();
  const t1 = new Map<number, number>();

  for (const r of records) {
    const at = a.alloc(0, 16);
    const name = latin1Bytes(r.name ?? '');
    let size = 0x24 + name.length + 1;
    for (const l of r.levels) size += 4 + l.length;
    if (r.palette) size += 4 + r.palette.length;
    a.alloc(size, 1);
    a.u32(at, size);
    a.u32(at + 4, TAGS[r.format]);
    a.u32(at + 8, TAGS[r.format]);
    a.u32(at + 0x0c, r.id);
    a.u16(at + 0x10, r.height);
    a.u16(at + 0x12, r.width);
    a.u32(at + 0x14, r.levels.length);
    a.u32(at + 0x18, r.flags ?? 0);
    a.f32(at + 0x1c, 1);
    a.bytes.set(name, at + 0x24);
    let cursor = at + 0x24 + name.length + 1;
    for (const l of r.levels) {
      a.u32(cursor, l.length);
      a.bytes.set(l, cursor + 4);
      cursor += 4 + l.length;
    }
    if (r.palette) {
      a.u32(cursor, r.palette.length / 4);
      a.bytes.set(r.palette, cursor + 4);
    }
    t0.set(r.id, at);
  }

  const writeBlock = (ids: number[]) => {
    const at = a.alloc(4 + ids.length * 4, 16);
    a.u32(at, ids.length);
    ids.forEach((id, i) => a.u32(at + 4 + i * 4, id));
    return at;
  };
  for (const list of options.idLists ?? []) t1.set(list.owner, writeBlock(list.ids));
  for (const orphan of options.orphanBlocks ?? []) writeBlock(orphan);

  const off0 = a.alloc(2048 * 4, 16);
  const off4 = a.alloc(2048 * 4, 4);
  a.u32(0, off0);
  a.u32(4, off4);
  a.u32(12, 4);
  for (const [id, at] of t0) a.u32(off0 + id * 4, at);
  for (const [id, at] of t1) a.u32(off4 + id * 4, at);
  return a.finish();
}

// ---------------------------------------------------------------- PRM

export class PrmBuilder {
  private readonly heap = new Arena(0x10000, 0x10);
  private readonly descriptors: { offset: number; size: number }[] = [{ offset: 0, size: 16 }];

  /** Store `size` bytes and return the descriptor index; `fill` writes into them. */
  add(size: number, fill: (a: Arena, at: number) => void): number {
    const at = this.heap.alloc(size, 16);
    fill(this.heap, at);
    this.descriptors.push({ offset: at, size });
    return this.descriptors.length - 1;
  }

  build(): Uint8Array {
    const tableAt = Math.ceil(this.heap.top / 16) * 16;
    const out = new Uint8Array(tableAt + this.descriptors.length * 16);
    out.set(this.heap.bytes.subarray(0, tableAt));
    const v = new DataView(out.buffer);
    v.setUint32(0, tableAt, true);
    v.setUint32(4, this.descriptors.length, true);
    v.setUint32(8, tableAt, true);
    this.descriptors.forEach((d, i) => {
      v.setUint32(tableAt + i * 16, d.offset, true);
      v.setUint32(tableAt + i * 16 + 4, d.size, true);
      v.setUint32(tableAt + i * 16 + 8, 1, true);
    });
    return out;
  }
}

// ---------------------------------------------------------------- MAT

export interface MatSpec {
  tag: string;
  text?: string;
  ints?: number[];
  floats?: number[];
  children?: MatSpec[];
}

export function makeMat(
  classes: { name: string; root: MatSpec }[],
  materials: { className: string; classSlot: number; root: MatSpec; refCount: number }[],
): Uint8Array {
  const a = new Arena(0x40000, 0x10);

  const writeNode = (at: number, spec: MatSpec) => {
    const tag = spec.tag.split('').reduce((v, c) => (v << 8) | c.charCodeAt(0), 0);
    a.u32(at, tag);
    if (spec.children) {
      const array = a.alloc(spec.children.length * 16);
      spec.children.forEach((child, i) => writeNode(array + i * 16, child));
      a.u32(at + 4, array);
      a.u32(at + 8, spec.children.length);
      a.u32(at + 12, 3);
    } else if (spec.text !== undefined) {
      a.u32(at + 4, a.cstring(spec.text));
      a.u32(at + 8, spec.text.length + 1);
      a.u32(at + 12, 1);
    } else {
      const values = spec.ints ?? spec.floats ?? [];
      const isFloat = spec.floats !== undefined;
      const put = (p: number, v: number) => (isFloat ? a.f32(p, v) : a.u32(p, v));
      if (values.length === 1) {
        put(at + 4, values[0]!);
      } else {
        const array = a.alloc(values.length * 4);
        values.forEach((v, i) => put(array + i * 4, v));
        a.u32(at + 4, array);
      }
      a.u32(at + 8, values.length);
      a.u32(at + 12, isFloat ? 0 : 2);
    }
  };

  const entry = (className: string, classSlot: number, root: MatSpec) => {
    const at = a.alloc(0x30);
    a.u32(at, a.cstring(className));
    a.u32(at + 4, classSlot);
    const node = a.alloc(16);
    writeNode(node, root);
    a.u32(at + 0x1c, node);
    a.u32(at + 0x20, root.children?.length ?? 1);
    return at;
  };

  const classEntries = classes.map((c) => entry(c.name, 0, c.root));
  const materialEntries = materials.map((m) => entry(m.className, m.classSlot, m.root));

  const classTable = a.alloc((classEntries.length + 1) * 4);
  classEntries.forEach((at, i) => a.u32(classTable + (i + 1) * 4, at));
  const instanceTable = a.alloc((materialEntries.length + 1) * 4);
  materialEntries.forEach((at, i) => a.u32(instanceTable + (i + 1) * 4, at));
  const refTable = a.alloc((materialEntries.length + 1) * 4);
  materials.forEach((m, i) => a.u32(refTable + (i + 1) * 4, m.refCount));
  a.u32(0, classTable);
  a.u32(4, instanceTable);
  a.u32(12, refTable);
  return a.finish();
}
