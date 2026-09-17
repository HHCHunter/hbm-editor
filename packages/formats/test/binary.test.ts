import { describe, expect, it } from 'vitest';
import { ByteReader, FormatError, crc32, decodeText, latin1Bytes } from '../src';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(latin1Bytes('123456789'))).toBe(0xcbf43926);
  });
});

describe('ByteReader', () => {
  it('reads little- and big-endian values', () => {
    const r = new ByteReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04]));
    expect(r.u32()).toBe(0x04030201);
    r.littleEndian = false;
    expect(r.u32()).toBe(0x01020304);
  });

  it('reports the offset where it ran out of data', () => {
    const r = new ByteReader(new Uint8Array([1, 2, 3]));
    r.u8();
    try {
      r.u32();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FormatError);
      expect((err as FormatError).offset).toBe(1);
    }
  });
});

describe('text', () => {
  it('decodes single-byte game text', () => {
    expect(decodeText(new Uint8Array([0x93, 0x48, 0x69, 0x94]))).toBe('“Hi”');
  });

  it("refuses characters that don't fit in a byte", () => {
    expect(() => latin1Bytes('☃')).toThrow(RangeError);
  });
});
