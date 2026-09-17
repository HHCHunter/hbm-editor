import { cstringAt, f32At, u32At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';

// The material table (mat.md). The body is a pool of 16-byte nodes; the engine walks it with
// ZRenderMaterialBinderParser::CreatePropertyBinders 0x00071D70 and its child finders.
//
//   header   +0x00 class table   +0x04 instance table   +0x08 ?   +0x0C ref-count table
//   node     { u32 tag, u32 value, u32 count, u32 type }   type 0 float, 1 string, 2 int, 3 list
//            value is inline when count == 1 and an offset otherwise (strings and lists always)
//   entry    0x30 bytes: +0x00 class name, +0x04 class slot, +0x1C root node, +0x20 root count
//
// A tag reads as a big-endian-looking constant: 'BIND' is the dword 0x42494E44.

export const MAT_FLOAT = 0;
export const MAT_STRING = 1;
export const MAT_INT = 2;
export const MAT_LIST = 3;

export interface MatNode {
  offset: number;
  tag: string;
  value: number;
  count: number;
  type: number;
}

export interface MatEntry {
  /** Slot in the class or instance table. SPrimObject.lMaterialId is an instance slot. */
  slot: number;
  className: string;
  classSlot: number;
  root: MatNode;
  name: string | null;
}

export interface MatMaterial extends MatEntry {
  refCount: number;
}

export class MatFile {
  readonly data: Uint8Array;
  readonly classes: MatEntry[] = [];
  readonly materials: MatMaterial[] = [];
  readonly bySlot = new Map<number, MatMaterial>();
  readonly problems: string[] = [];
  private readonly nodeAreaEnd: number;

  constructor(data: Uint8Array) {
    this.data = data;
    const classTable = u32At(data, 0);
    const instanceTable = u32At(data, 4);
    const refTable = u32At(data, 12);
    if (!(0 < classTable && classTable <= instanceTable && instanceTable <= refTable && refTable <= data.length)) {
      throw new FormatError('table offsets are out of order', 0);
    }
    this.nodeAreaEnd = classTable;

    const slots = (from: number, to: number) => {
      const out: number[] = [];
      for (let at = from; at + 4 <= to; at += 4) out.push(u32At(data, at));
      return out;
    };
    const classSlots = slots(classTable, instanceTable);
    const instanceSlots = slots(instanceTable, refTable);
    const refCounts = slots(refTable, data.length);
    if (instanceSlots.length !== refCounts.length) {
      this.problems.push(`${instanceSlots.length} instance slots but ${refCounts.length} reference counts`);
    }

    classSlots.forEach((offset, slot) => {
      if (!offset) return;
      const entry = this.entry(slot, offset, 'CLAS');
      if (entry) this.classes.push(entry);
    });
    instanceSlots.forEach((offset, slot) => {
      if (!offset) return;
      const entry = this.entry(slot, offset, 'INST');
      if (!entry) return;
      if (!classSlots[entry.classSlot]) this.problems.push(`material ${slot} names class slot ${entry.classSlot}, which is empty`);
      const material = { ...entry, refCount: refCounts[slot] ?? 0 };
      this.materials.push(material);
      this.bySlot.set(slot, material);
    });
  }

  private entry(slot: number, offset: number, rootTag: string): MatEntry | null {
    try {
      const root = this.node(u32At(this.data, offset + 0x1c));
      if (root.tag !== rootTag) this.problems.push(`slot ${slot}: root is ${root.tag}, expected ${rootTag}`);
      if (root.count !== u32At(this.data, offset + 0x20)) this.problems.push(`slot ${slot}: entry and root disagree on the child count`);
      const nameNode = root.type === MAT_LIST ? this.child(root, 'NAME') : null;
      return {
        slot,
        className: decodeText(cstringAt(this.data, u32At(this.data, offset))),
        classSlot: u32At(this.data, offset + 4),
        root,
        name: nameNode ? this.text(nameNode) : null,
      };
    } catch (err) {
      if (!(err instanceof FormatError)) throw err;
      this.problems.push(`slot ${slot}: ${err.message}`);
      return null;
    }
  }

  node(offset: number): MatNode {
    if (offset < 0x10 || offset + 16 > this.nodeAreaEnd) throw new FormatError('node is outside the node area', offset);
    const t = u32At(this.data, offset);
    return {
      offset,
      tag: String.fromCharCode(t >>> 24, (t >>> 16) & 0xff, (t >>> 8) & 0xff, t & 0xff),
      value: u32At(this.data, offset + 4),
      count: u32At(this.data, offset + 8),
      type: u32At(this.data, offset + 12),
    };
  }

  children(node: MatNode): MatNode[] {
    if (node.type !== MAT_LIST) throw new FormatError(`${node.tag} is not a list`, node.offset);
    const out: MatNode[] = [];
    for (let i = 0; i < node.count; i++) out.push(this.node(node.value + i * 16));
    return out;
  }

  /** The first child with `tag`, as the engine's optional finder 0x000717B0 returns it. */
  child(node: MatNode, tag: string): MatNode | null {
    return this.children(node).find((c) => c.tag === tag) ?? null;
  }

  text(node: MatNode): string {
    if (node.type !== MAT_STRING) throw new FormatError(`${node.tag} is not a string`, node.offset);
    return decodeText(cstringAt(this.data, node.value));
  }

  ints(node: MatNode): number[] {
    if (node.type !== MAT_INT) throw new FormatError(`${node.tag} is not an int`, node.offset);
    if (node.count === 1) return [node.value];
    return Array.from({ length: node.count }, (_, i) => u32At(this.data, node.value + i * 4));
  }

  floats(node: MatNode): number[] {
    if (node.type !== MAT_FLOAT) throw new FormatError(`${node.tag} is not a float`, node.offset);
    if (node.count === 1) return [f32At(this.data, node.offset + 4)];
    return Array.from({ length: node.count }, (_, i) => f32At(this.data, node.value + i * 4));
  }
}
