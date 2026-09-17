import { latin1Bytes } from './text';

/** A growable little-endian byte buffer. */
export class ByteWriter {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number): this {
    this.ensure(1);
    this.buf[this.length++] = value & 0xff;
    return this;
  }

  u16(value: number): this {
    this.ensure(2);
    this.view.setUint16(this.length, value, true);
    this.length += 2;
    return this;
  }

  u32(value: number): this {
    this.ensure(4);
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
    return this;
  }

  i32(value: number): this {
    this.ensure(4);
    this.view.setInt32(this.length, value, true);
    this.length += 4;
    return this;
  }

  f32(value: number): this {
    this.ensure(4);
    this.view.setFloat32(this.length, value, true);
    this.length += 4;
    return this;
  }

  bytes(data: ArrayLike<number>): this {
    this.ensure(data.length);
    this.buf.set(data, this.length);
    this.length += data.length;
    return this;
  }

  /** A single-byte string followed by a NUL. */
  cstring(text: string): this {
    return this.bytes(latin1Bytes(text)).u8(0);
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}
