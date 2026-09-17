import { deflateRawSync } from 'node:zlib';
import { ByteWriter } from '../../src/binary/ByteWriter';
import { crc32 } from '../../src/binary/crc32';
import { latin1Bytes } from '../../src/binary/text';

// Small, hand-built files for unit tests. Nothing here comes from the game.

export const text = (s: string) => latin1Bytes(s);

// ---------------------------------------------------------------- ZIP

export interface ZipSpec {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  localExtra?: Uint8Array;
}

export interface ZipOptions {
  comment?: string;
  /** Append a second central directory holding only these members, and a 'Rune' record pointing at it. */
  runeDirectory?: string[];
}

export function makeZip(specs: ZipSpec[], options: ZipOptions = {}): Uint8Array {
  const w = new ByteWriter();
  const records: { name: Uint8Array; method: number; crc: number; csize: number; usize: number; offset: number }[] = [];

  for (const spec of specs) {
    const method = spec.method ?? 8;
    const payload = method === 8 ? new Uint8Array(deflateRawSync(spec.data)) : spec.data;
    const name = latin1Bytes(spec.name);
    const extra = spec.localExtra ?? new Uint8Array(0);
    const offset = w.length;
    const crc = crc32(spec.data);
    w.u32(0x04034b50).u16(20).u16(0).u16(method).u16(0).u16(0x21);
    w.u32(crc).u32(payload.length).u32(spec.data.length).u16(name.length).u16(extra.length);
    w.bytes(name).bytes(extra).bytes(payload);
    records.push({ name, method, crc, csize: payload.length, usize: spec.data.length, offset });
  }

  const writeDirectory = (include: (name: string) => boolean) => {
    const start = w.length;
    let count = 0;
    for (const r of records) {
      if (!include(String.fromCharCode(...r.name))) continue;
      w.u32(0x02014b50).u16(20).u16(20).u16(0).u16(r.method).u16(0).u16(0x21);
      w.u32(r.crc).u32(r.csize).u32(r.usize).u16(r.name.length).u16(0).u16(0).u16(0).u16(0).u32(0);
      w.u32(r.offset).bytes(r.name);
      count++;
    }
    return { start, size: w.length - start, count };
  };

  const main = writeDirectory(() => true);
  const comment = latin1Bytes(options.comment ?? '');
  w.u32(0x06054b50).u16(0).u16(0).u16(main.count).u16(main.count).u32(main.size).u32(main.start);
  w.u16(comment.length).bytes(comment);

  if (options.runeDirectory) {
    const names = new Set(options.runeDirectory);
    const alt = writeDirectory((n) => names.has(n));
    w.u32(0x52756e65).u16(0).u16(0).u16(alt.count).u16(alt.count).u32(alt.size).u32(alt.start).u16(0);
  }
  return w.toBytes();
}

// ---------------------------------------------------------------- LOC

export interface LocSpec {
  name: string;
  text?: string;
  text2?: string;
  sound?: number;
  children?: LocSpec[];
}

function encodeLocChild(spec: LocSpec): Uint8Array {
  const w = new ByteWriter().cstring(spec.name);
  let flags = 0;
  if (spec.text !== undefined) flags |= 0x01;
  if (spec.text2 !== undefined) flags |= 0x02;
  if (spec.children) flags |= 0x10;
  if (spec.sound !== undefined) flags |= 0x20;
  w.u8(flags);
  if (spec.children) writeLocTable(w, spec.children);
  if (spec.text !== undefined) w.cstring(spec.text);
  if (spec.text2 !== undefined) w.cstring(spec.text2);
  if (spec.sound !== undefined) w.u32(spec.sound);
  return w.toBytes();
}

function writeLocTable(w: ByteWriter, children: LocSpec[]): void {
  const encoded = children.map(encodeLocChild);
  w.u8(children.length);
  let offset = 0;
  for (let i = 1; i < encoded.length; i++) {
    offset += encoded[i - 1]!.length;
    w.i32(offset);
  }
  for (const child of encoded) w.bytes(child);
}

/** A .LOC whose root table holds `children`, in the order given. */
export function makeLoc(children: LocSpec[]): Uint8Array {
  const w = new ByteWriter();
  writeLocTable(w, children);
  return w.toBytes();
}

// ---------------------------------------------------------------- PRP

export class PrpBuilder {
  private readonly strings: string[] = [];
  private readonly body = new ByteWriter();

  private intern(s: string): number {
    let i = this.strings.indexOf(s);
    if (i < 0) {
      i = this.strings.length;
      this.strings.push(s);
    }
    return i;
  }

  marker(byte: number): this {
    this.body.u8(byte);
    return this;
  }
  beginNode(): this {
    return this.marker(0x02);
  }
  endNode(): this {
    return this.marker(0x7e);
  }
  container(count: number): this {
    this.body.u8(0x04).u32(count);
    return this;
  }
  string(s: string): this {
    this.body.u8(0x0c).u32(this.intern(s));
    return this;
  }
  enumName(s: string): this {
    this.body.u8(0x0e).u32(this.intern(s));
    return this;
  }
  bool(value: boolean): this {
    this.body.u8(0x06).u8(value ? 1 : 0);
    return this;
  }
  u32(value: number): this {
    this.body.u8(0x09).u32(value);
    return this;
  }
  floats(values: number[]): this {
    this.body.u8(0x01).u32(values.length);
    for (const v of values) this.body.u8(0x0a).f32(v);
    return this.marker(0x7c);
  }
  geomHead(prim: number, position = [0, 0, 0]): this {
    return this.enumName('STATIC').floats([0, 0, 1, 0, 1, 0, 1, 0, 0]).floats(position).bool(false).u32(prim);
  }

  build(options: { refSlots: number; flags?: number; trailing?: number }): Uint8Array {
    const flags = options.flags ?? 0x0d;
    const w = new ByteWriter().bytes(latin1Bytes('IOPacked v0.1')).u8(0);
    w.u8(0).u32(flags).u32(0);
    if (flags & 0x8) {
      const blob = new ByteWriter();
      for (const s of this.strings) blob.cstring(s);
      w.i32(this.strings.length - 1).u32(blob.length).bytes(blob.toBytes());
    }
    w.u32(options.refSlots).bytes(this.body.toBytes()).bytes(new Uint8Array(options.trailing ?? 3));
    return w.toBytes();
  }
}

// ---------------------------------------------------------------- PE

/** A minimal 32-bit executable whose one section holds `strings`. */
export function makePe(strings: string[]): { bytes: Uint8Array; vaOf: (s: string) => number } {
  const imageBase = 0x400000;
  const sectionRva = 0x1000;
  const rawOffset = 0x200;
  const section = new ByteWriter();
  const vas = new Map<string, number>();
  for (const s of strings) {
    vas.set(s, imageBase + sectionRva + section.length);
    section.cstring(s);
  }
  const data = section.toBytes();

  const bytes = new Uint8Array(rawOffset + data.length);
  const v = new DataView(bytes.buffer);
  v.setUint16(0, 0x5a4d, true);
  v.setUint32(0x3c, 0x40, true);
  v.setUint32(0x40, 0x00004550, true);
  v.setUint16(0x44, 0x14c, true);
  v.setUint16(0x46, 1, true);
  v.setUint16(0x54, 0xe0, true);
  const optional = 0x58;
  v.setUint16(optional, 0x10b, true);
  v.setUint32(optional + 28, imageBase, true);
  const header = optional + 0xe0;
  bytes.set(latin1Bytes('.rdata'), header);
  v.setUint32(header + 8, data.length, true);
  v.setUint32(header + 12, sectionRva, true);
  v.setUint32(header + 16, data.length, true);
  v.setUint32(header + 20, rawOffset, true);
  bytes.set(data, rawOffset);

  return { bytes, vaOf: (s) => vas.get(s)! };
}
