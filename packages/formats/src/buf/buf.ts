import { decodeText } from '../binary/text';

// The .BUF static pool has no directory: names and other regions are addressed by byte offset
// from the start of the member (buf.md). SCompiledGeom+0x00 is one such offset.

/** The NUL-terminated string at `offset`, or null if the offset is outside the pool. */
export function bufString(buf: Uint8Array, offset: number): string | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= buf.length) return null;
  const end = buf.indexOf(0, offset);
  return end < 0 ? null : decodeText(buf.subarray(offset, end));
}
