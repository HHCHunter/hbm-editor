import { latin1Bytes } from '../../src/binary/text';

// A small 32-bit PE image with named sections placed at fixed addresses, so tests can lay out
// executable data (vtables, RTTI, property records, code) and point at it before building.

const SECTION_SPACING = 0x10000;
const FILE_ALIGN = 0x200;

export class PeSectionWriter {
  readonly name: string;
  readonly rva: number;
  private readonly imageBase: number;
  private readonly chunks: number[] = [];

  constructor(name: string, rva: number, imageBase: number) {
    this.name = name;
    this.rva = rva;
    this.imageBase = imageBase;
  }

  /** The address the next byte will get. */
  get va(): number {
    return this.imageBase + this.rva + this.chunks.length;
  }

  get size(): number {
    return this.chunks.length;
  }

  bytes(data: ArrayLike<number>): number {
    const at = this.va;
    for (let i = 0; i < data.length; i++) this.chunks.push(data[i]! & 0xff);
    return at;
  }

  u32(...values: number[]): number {
    const at = this.va;
    for (const v of values) this.bytes([v, v >>> 8, v >>> 16, v >>> 24]);
    return at;
  }

  cstring(text: string): number {
    const at = this.va;
    this.bytes(latin1Bytes(text));
    this.bytes([0]);
    return at;
  }

  align(n = 4): this {
    while (this.chunks.length % n) this.chunks.push(0);
    return this;
  }

  /** Overwrite a dword written earlier, for forward references. */
  patchU32(va: number, value: number): void {
    const i = va - this.imageBase - this.rva;
    for (let k = 0; k < 4; k++) this.chunks[i + k] = (value >>> (8 * k)) & 0xff;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export class PeBuilder {
  readonly imageBase: number;
  private readonly sections: PeSectionWriter[] = [];
  private exportsByOrdinal: Map<number, number> | null = null;

  constructor(imageBase = 0x00400000) {
    this.imageBase = imageBase;
  }

  section(name: string): PeSectionWriter {
    let s = this.sections.find((x) => x.name === name);
    if (!s) {
      s = new PeSectionWriter(name, SECTION_SPACING * (this.sections.length + 1), this.imageBase);
      this.sections.push(s);
    }
    return s;
  }

  /** Export these addresses by ordinal (placed in an ".edata" section at build time). */
  exports(byOrdinal: Map<number, number>): this {
    this.exportsByOrdinal = byOrdinal;
    return this;
  }

  build(): Uint8Array {
    if (this.exportsByOrdinal) {
      const edata = this.section('.edata');
      const ordinals = [...this.exportsByOrdinal.keys()];
      const base = Math.min(...ordinals);
      const count = Math.max(...ordinals) - base + 1;
      const dir = edata.va;
      edata.u32(0, 0, 0, 0, base, count, 0, 0, 0, 0);
      const functions = edata.va;
      for (let i = 0; i < count; i++) {
        const va = this.exportsByOrdinal.get(base + i);
        edata.u32(va === undefined ? 0 : va - this.imageBase);
      }
      edata.patchU32(dir + 28, functions - this.imageBase);
    }

    const headerSize = FILE_ALIGN * 2;
    let raw = headerSize;
    const placed = this.sections.map((s) => {
      const data = s.toBytes();
      const at = raw;
      raw += Math.ceil(Math.max(data.length, 1) / FILE_ALIGN) * FILE_ALIGN;
      return { s, data, at };
    });
    const out = new Uint8Array(raw);
    const v = new DataView(out.buffer);
    v.setUint16(0, 0x5a4d, true);
    v.setUint32(0x3c, 0x40, true);
    v.setUint32(0x40, 0x00004550, true);
    v.setUint16(0x44, 0x14c, true);
    v.setUint16(0x46, placed.length, true);
    v.setUint16(0x54, 0xe0, true);
    const optional = 0x58;
    v.setUint16(optional, 0x10b, true);
    v.setUint32(optional + 28, this.imageBase, true);
    v.setUint32(optional + 92, 16, true);
    const edata = placed.find((p) => p.s.name === '.edata');
    if (edata) {
      v.setUint32(optional + 96, edata.s.rva, true);
      v.setUint32(optional + 100, edata.data.length, true);
    }
    placed.forEach(({ s, data, at }, i) => {
      const header = optional + 0xe0 + i * 40;
      out.set(latin1Bytes(s.name.slice(0, 8)), header);
      v.setUint32(header + 8, data.length, true);
      v.setUint32(header + 12, s.rva, true);
      v.setUint32(header + 16, Math.ceil(Math.max(data.length, 1) / FILE_ALIGN) * FILE_ALIGN, true);
      v.setUint32(header + 20, at, true);
      out.set(data, at);
    });
    return out;
  }
}

/** Little-endian bytes of a dword, for splicing into code. */
export const le32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

/** `E8 rel32` (or another rel32 opcode) from `at` to `target`. */
export const rel32 = (opcode: number, at: number, target: number) => [opcode, ...le32((target - (at + 5)) | 0)];
