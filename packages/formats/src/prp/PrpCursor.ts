import { ByteReader } from '../binary/ByteReader';
import { hex } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { PRP_STRING_TABLE, PRP_TEXT, type PrpHeader } from './header';

// Body markers. The engine's writers map a property type to one marker byte
// (sub_000571A0 in packed_stream.cpp); the readers then consume a fixed-width value.
//
//   type  marker  kind          type  marker  kind
//    0    0x0D    raw blob        9   0x0A    f32
//    1    0x05    char           10   0x0B    f64
//    2    0x06    bool           11   0x0C    string
//   3,4   0x07    u8             12   0x0E    enum
//   5,6   0x08    u16            13   0x0F    (count + that many u32s; width from prp.md)
//   7,8   0x09    u32 / REF      14   0x02    node open, closed by 0x7E
//                                15   0x03    (u32; width from prp.md)
//                                16   0x04    container: u32 count
//   BeginArray writes 0x01 + u32 count, EndArray writes 0x7C, and ZPackedOutput::Skip 0x00058690
//   writes a lone 0x7D ('}') for a skipped property.

export type PrpTokenKind =
  | 'beginNode'
  | 'endNode'
  | 'beginArray'
  | 'endArray'
  | 'skip'
  | 'container'
  | 'char'
  | 'bool'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'f32'
  | 'f64'
  | 'string'
  | 'enum'
  | 'raw'
  | 'type13'
  | 'type15';

export interface PrpToken {
  offset: number;
  marker: number;
  kind: PrpTokenKind;
  /** The count for arrays and containers, the scalar value, or a string-table index. */
  value: number;
  /** Inline text or raw bytes. */
  bytes: Uint8Array | null;
  /** True when `value` indexes the header's string table. */
  interned: boolean;
}

export class PrpCursor {
  private readonly reader: ByteReader;
  private readonly flags: number;
  private readonly stringCount: number;

  constructor(data: Uint8Array, header: PrpHeader, pos = header.bodyOffset) {
    this.reader = new ByteReader(data, pos, !header.endianSwap);
    this.flags = header.flags;
    this.stringCount = header.strings?.length ?? 0;
  }

  get pos(): number {
    return this.reader.pos;
  }

  peekMarker(): number {
    this.reader.need(1);
    return this.reader.data[this.reader.pos]!;
  }

  next(): PrpToken {
    const r = this.reader;
    const offset = r.pos;
    const marker = r.u8();
    const token = (kind: PrpTokenKind, value = 0, bytes: Uint8Array | null = null): PrpToken => ({
      offset,
      marker,
      kind,
      value,
      bytes,
      interned: false,
    });

    switch (marker) {
      case 0x01:
        return token('beginArray', r.u32());
      case 0x02:
        return token('beginNode');
      case 0x03:
        return token('type15', r.u32());
      case 0x04:
        return token('container', r.u32());
      case 0x05:
        return token('char', r.u8());
      case 0x06:
        return token('bool', r.u8() !== 0 ? 1 : 0);
      case 0x07:
        return token('u8', r.u8());
      case 0x08:
        return token('u16', r.u16());
      case 0x09:
        return token('u32', r.u32());
      case 0x0a:
        return token('f32', r.f32());
      case 0x0b:
        return token('f64', r.f64());
      case 0x0c:
        return this.text(offset, marker, 'string');
      case 0x0d: {
        const length = r.u32();
        return token('raw', length, r.take(length));
      }
      case 0x0e:
        // Enums travel by name when the stream carries text (the enum reader 0x00057930).
        return this.flags & PRP_TEXT ? this.text(offset, marker, 'enum') : token('enum', r.u32());
      case 0x0f: {
        // A bitfield: a count, then that many u32 string-table indices of the set flags' names.
        const count = r.u32();
        return token('type13', count, r.take(count * 4));
      }
      case 0x7c:
        return token('endArray');
      case 0x7d:
        return token('skip');
      case 0x7e:
        return token('endNode');
      default:
        throw new FormatError(`unknown marker ${hex(marker)}`, offset);
    }
  }

  /** A string: a u32 string-table index in interned streams, otherwise a u32 length and the bytes. */
  private text(offset: number, marker: number, kind: 'string' | 'enum'): PrpToken {
    const r = this.reader;
    if (this.flags & PRP_STRING_TABLE) {
      const index = r.i32();
      if (index < 0 || index >= this.stringCount) {
        throw new FormatError(`string index ${index} is outside the ${this.stringCount}-entry table`, offset);
      }
      return { offset, marker, kind, value: index, bytes: null, interned: true };
    }
    const length = r.u32();
    return { offset, marker, kind, value: length, bytes: r.take(length), interned: false };
  }
}
