import { ByteReader } from '../binary/ByteReader';
import { FormatError } from '../binary/FormatError';

// The IOPacked stream header, as ZPackedInput::CheckSignature 0x000587F0 reads it
// (engine/serializerlib/packed_stream.cpp), with the string table from ZFastDictionary::Load
// 0x000564B0 (dictionary.cpp).

export const PRP_PAYLOAD = 0x1;
/** A token dictionary is present, so property names are on the wire. PS2 dev builds only. */
export const PRP_DICTIONARY = 0x2;
/** Strings and enums travel as text rather than bare numbers. */
export const PRP_TEXT = 0x4;
/** Strings are indices into the header's string table. */
export const PRP_STRING_TABLE = 0x8;

const MAGIC = 'IOPacked v0.1';

export interface PrpHeader {
  /** False when the first 14 bytes aren't "IOPacked v0.1\0". The engine never compares them. */
  magicOk: boolean;
  endianSwap: boolean;
  flags: number;
  unknown08: number;
  /** The interned strings when flags has PRP_STRING_TABLE. A stored count of N means N+1 strings. */
  strings: Uint8Array[] | null;
  refSlots: number;
  bodyOffset: number;
}

export function readPrpHeader(data: Uint8Array): PrpHeader {
  const r = new ByteReader(data);
  const magic = r.take(14);
  const magicOk = magic.every((b, i) => b === (i < MAGIC.length ? MAGIC.charCodeAt(i) : 0));
  const endianSwap = r.u8() !== 0;
  r.littleEndian = !endianSwap;
  const flags = r.u32();
  const unknown08 = r.u32();

  if (flags & PRP_DICTIONARY) {
    throw new FormatError(
      "streams with a token dictionary aren't supported; retail PC scenes don't use them",
      15,
    );
  }

  let strings: Uint8Array[] | null = null;
  if (flags & PRP_STRING_TABLE) {
    const count = r.i32();
    const blobBytes = r.u32();
    const blobStart = r.pos;
    const blob = r.take(blobBytes);
    strings = [];
    for (let i = 0, p = 0; i <= count; i++) {
      const end = blob.indexOf(0, p);
      if (end < 0) {
        throw new FormatError(`string table holds fewer than the ${count + 1} strings it declares`, blobStart + p);
      }
      strings.push(blob.subarray(p, end));
      p = end + 1;
    }
  }

  const refSlots = r.u32();
  return { magicOk, endianSwap, flags, unknown08, strings, refSlots, bodyOffset: r.pos };
}
