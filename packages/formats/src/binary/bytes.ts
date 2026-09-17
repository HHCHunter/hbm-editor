import { FormatError } from './FormatError';

// Bounds-checked little-endian reads at absolute offsets, for formats that are walked by pointer
// arithmetic rather than read front to back (the .LOC trie, .GMS image offsets).

function check(data: Uint8Array, offset: number, size: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset + size > data.length) {
    throw new FormatError(`needed ${size} byte(s) outside the data (length ${data.length})`, offset);
  }
}

export function u8At(data: Uint8Array, offset: number): number {
  check(data, offset, 1);
  return data[offset]!;
}

export function u16At(data: Uint8Array, offset: number): number {
  check(data, offset, 2);
  return data[offset]! | (data[offset + 1]! << 8);
}

export function u32At(data: Uint8Array, offset: number): number {
  check(data, offset, 4);
  return (
    (data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)) >>> 0
  );
}

export function i32At(data: Uint8Array, offset: number): number {
  return u32At(data, offset) | 0;
}

const scratch = new DataView(new ArrayBuffer(4));

export function f32At(data: Uint8Array, offset: number): number {
  scratch.setUint32(0, u32At(data, offset), true);
  return scratch.getFloat32(0, true);
}

/** The bytes of a NUL-terminated string starting at `offset`, without the NUL. */
export function cstringAt(data: Uint8Array, offset: number): Uint8Array {
  check(data, offset, 1);
  const end = data.indexOf(0, offset);
  if (end < 0) throw new FormatError('string runs past the end of the data', offset);
  return data.subarray(offset, end);
}

export function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase()}`;
}
