import { describe, expect, it } from 'vitest';
import {
  FormatError,
  HARVESTED_REGISTRATIONS,
  PeImage,
  decodeText,
  geomFamily,
  isA,
  readGeomCount,
  resolveClassRegistry,
} from '../src';
import { makePe } from './fixtures/builders';

const { bytes, vaOf } = makePe(['ZGEOM', 'ZGROUP', 'ZROOM', 'not a name']);
const exe = new PeImage(bytes);

describe('PeImage', () => {
  it('reads strings by virtual address', () => {
    expect(decodeText(exe.cstringAtVa(vaOf('ZROOM'))!)).toBe('ZROOM');
    expect(exe.cstringAtVa(0x10)).toBeNull();
  });

  it('rejects files that are not 32-bit executables', () => {
    expect(() => new PeImage(new Uint8Array(0x100))).toThrow(FormatError);
  });
});

describe('resolveClassRegistry', () => {
  const registry = resolveClassRegistry(exe, [
    { typeId: 0x00000001, nameVa: vaOf('ZGEOM'), parentVa: 0, size: 0x10 },
    { typeId: 0x00100001, nameVa: vaOf('ZGROUP'), parentVa: vaOf('ZGEOM'), size: 0x4c },
    { typeId: 0x00100021, nameVa: vaOf('ZROOM'), parentVa: vaOf('ZGROUP'), size: 0x144 },
    { typeId: 0x00200002, nameVa: vaOf('not a name'), parentVa: vaOf('ZGEOM'), size: 0x10 },
  ]);

  it('names classes from the executable and follows inheritance', () => {
    expect(registry.byTypeId.get(0x00100021)?.name).toBe('ZROOM');
    expect(isA(registry, 0x00100021, 'ZGROUP')).toBe(true);
    expect(isA(registry, 0x00100021, 'ZGEOM')).toBe(true);
    expect(isA(registry, 0x00100001, 'ZROOM')).toBe(false);
  });

  it("keeps registrations whose name isn't an identifier out", () => {
    expect(registry.unresolved.map((r) => r.typeId)).toEqual([0x00200002]);
  });

  it('buckets ids by family from their high bits', () => {
    expect(geomFamily(0x00800123)).toBe('light');
    expect(geomFamily(0x00100021)).toBe('group');
    expect(geomFamily(0x12345678)).toBe('unknown');
  });

  it('ships the harvested registration table', () => {
    expect(HARVESTED_REGISTRATIONS.length).toBeGreaterThan(100);
  });
});

describe('readGeomCount', () => {
  it('reads the count at the head of the geom entry table', () => {
    const image = new Uint8Array(16);
    const v = new DataView(image.buffer);
    v.setUint32(0, 8, true);
    v.setUint32(8, 5, true);
    expect(readGeomCount(image)).toBe(5);
  });
});
