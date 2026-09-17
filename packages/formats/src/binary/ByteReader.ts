import { FormatError } from './FormatError';

/** A bounds-checked cursor over binary data. Endianness can change mid-stream (IOPacked headers do). */
export class ByteReader {
  readonly data: Uint8Array;
  private readonly view: DataView;
  littleEndian: boolean;
  pos: number;

  constructor(data: Uint8Array, pos = 0, littleEndian = true) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = pos;
    this.littleEndian = littleEndian;
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  /** Throw unless `n` more bytes are available. */
  need(n: number): void {
    if (this.pos < 0 || n < 0 || n > this.data.length - this.pos) {
      throw new FormatError(`needed ${n} byte(s) but only ${Math.max(0, this.remaining)} remain`, this.pos);
    }
  }

  u8(): number {
    this.need(1);
    return this.data[this.pos++]!;
  }

  u16(): number {
    this.need(2);
    const value = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  i32(): number {
    this.need(4);
    const value = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  f32(): number {
    this.need(4);
    const value = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  f64(): number {
    this.need(8);
    const value = this.view.getFloat64(this.pos, this.littleEndian);
    this.pos += 8;
    return value;
  }

  /** The next `n` bytes, as a view into the data. */
  take(n: number): Uint8Array {
    this.need(n);
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
}
