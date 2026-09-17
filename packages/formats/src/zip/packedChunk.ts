import { u32At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import type { Codec } from '../io';

export interface PackedChunk {
  uncompressedSize: number;
  /** As recorded in the header; normally the whole member, header included. */
  compressedSize: number;
  stored: boolean;
  data: Uint8Array;
  problems: string[];
}

const HEADER = 9;

/**
 * Unwrap a ZPackedDataChunk, as ZPackedDataChunk::unzip 0x0002BC40 does (.GMS members use it):
 *
 *   +0x00 u32 uncompressed size   +0x04 u32 compressed size   +0x08 u8 stored (1 = copy)
 *   +0x09 payload, raw DEFLATE unless stored. A stray Adler-32 follows the stream.
 */
export function unpackChunk(member: Uint8Array, codec: Codec): PackedChunk {
  if (member.length < HEADER) {
    throw new FormatError('packed chunk is shorter than its 9-byte header', 0);
  }
  const uncompressedSize = u32At(member, 0);
  const compressedSize = u32At(member, 4);
  const stored = member[8] === 1;
  const problems: string[] = [];
  if (compressedSize !== member.length) {
    problems.push(`header gives a size of ${compressedSize} bytes but the member holds ${member.length}`);
  }

  let data: Uint8Array;
  if (stored) {
    data = member.slice(HEADER, HEADER + uncompressedSize);
    if (data.length < uncompressedSize) {
      problems.push(`stored payload holds ${data.length} of ${uncompressedSize} bytes`);
    }
  } else {
    data = codec.inflateRaw(member.subarray(HEADER), uncompressedSize);
  }
  return { uncompressedSize, compressedSize, stored, data, problems };
}
