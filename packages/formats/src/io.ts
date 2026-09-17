/** Random-access reads from a file or buffer. The server backs this with a file handle. */
export interface RandomAccess {
  readonly size: number;
  /** Up to `length` bytes from `offset`; fewer only at the end of the data. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Decompression, supplied by the host: node:zlib on the server, a JS inflater in the browser. */
export interface Codec {
  /**
   * Inflate a raw DEFLATE stream (no zlib header). Returns the first `size` bytes of output and
   * ignores input after the end of the stream; throws if the stream is corrupt or ends early.
   */
  inflateRaw(data: Uint8Array, size: number): Uint8Array;
}

export function bytesSource(data: Uint8Array): RandomAccess {
  return {
    size: data.length,
    read: async (offset, length) => data.subarray(offset, Math.min(data.length, offset + length)),
  };
}
