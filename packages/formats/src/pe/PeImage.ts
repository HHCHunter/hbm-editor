import { cstringAt, u16At, u32At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';

export interface PeSection {
  name: string;
  virtualAddress: number;
  virtualSize: number;
  rawOffset: number;
  rawSize: number;
}

/** Just enough of a 32-bit Windows executable to read data by virtual address. */
export class PeImage {
  readonly data: Uint8Array;
  readonly imageBase: number;
  readonly sections: PeSection[];

  constructor(data: Uint8Array) {
    this.data = data;
    if (data.length < 0x40 || u16At(data, 0) !== 0x5a4d) {
      throw new FormatError('not a Windows executable (no MZ header)', 0);
    }
    const pe = u32At(data, 0x3c);
    if (u32At(data, pe) !== 0x00004550) throw new FormatError('not a Windows executable (no PE header)', pe);

    const sectionCount = u16At(data, pe + 6);
    const optionalSize = u16At(data, pe + 20);
    const optional = pe + 24;
    if (u16At(data, optional) !== 0x10b) throw new FormatError('not a 32-bit executable', optional);
    this.imageBase = u32At(data, optional + 28);

    this.sections = [];
    for (let i = 0, s = optional + optionalSize; i < sectionCount; i++, s += 40) {
      const nameBytes = data.subarray(s, s + 8);
      const nul = nameBytes.indexOf(0);
      this.sections.push({
        name: decodeText(nul < 0 ? nameBytes : nameBytes.subarray(0, nul)),
        virtualSize: u32At(data, s + 8),
        virtualAddress: u32At(data, s + 12),
        rawSize: u32At(data, s + 16),
        rawOffset: u32At(data, s + 20),
      });
    }
  }

  /** File offset for a relative virtual address, or null if no section stores bytes there. */
  rvaToOffset(rva: number): number | null {
    for (const s of this.sections) {
      const into = rva - s.virtualAddress;
      if (into >= 0 && into < Math.max(s.virtualSize, s.rawSize)) {
        return into < s.rawSize ? s.rawOffset + into : null;
      }
    }
    return null;
  }

  vaToOffset(va: number): number | null {
    return this.rvaToOffset(va - this.imageBase);
  }

  section(name: string): PeSection | null {
    return this.sections.find((s) => s.name === name) ?? null;
  }

  /** The dword at a virtual address, or null if no file bytes back it. */
  u32AtVa(va: number): number | null {
    const offset = this.vaToOffset(va);
    return offset === null || offset + 4 > this.data.length ? null : u32At(this.data, offset);
  }

  /** `length` file bytes at a virtual address, or null if they aren't all stored in one section. */
  bytesAtVa(va: number, length: number): Uint8Array | null {
    const offset = this.vaToOffset(va);
    const end = offset === null ? null : this.vaToOffset(va + length - 1);
    if (offset === null || end === null || end !== offset + length - 1) return null;
    return this.data.subarray(offset, offset + length);
  }

  /** Exported functions by ordinal, as relative virtual addresses. */
  exportsByOrdinal(): Map<number, number> {
    const exports = new Map<number, number>();
    const pe = u32At(this.data, 0x3c);
    const optional = pe + 24;
    // Data directory 0 (exports) sits at optional-header offset 96 in a PE32 image.
    if (u32At(this.data, optional + 92) < 1) return exports;
    const dir = this.rvaToOffset(u32At(this.data, optional + 96));
    if (dir === null) return exports;
    const base = u32At(this.data, dir + 16);
    const count = u32At(this.data, dir + 20);
    const functions = this.rvaToOffset(u32At(this.data, dir + 28));
    if (functions === null) return exports;
    for (let i = 0; i < count; i++) {
      const rva = u32At(this.data, functions + i * 4);
      if (rva) exports.set(base + i, rva);
    }
    return exports;
  }

  /** The NUL-terminated bytes at a virtual address, or null if unmapped or longer than `maxLength`. */
  cstringAtVa(va: number, maxLength = 256): Uint8Array | null {
    const offset = this.vaToOffset(va);
    if (offset === null || offset >= this.data.length) return null;
    try {
      const bytes = cstringAt(this.data, offset);
      return bytes.length <= maxLength ? bytes : null;
    } catch (err) {
      if (err instanceof FormatError) return null;
      throw err;
    }
  }
}
