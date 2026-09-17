import { describe, expect, it } from 'vitest';
import { FormatError, MatFile, PrmFile } from '@hbm/formats';
import { PrmBuilder, makeMat } from '@hbm/formats/testing';
import { decodeMeshPack, encodeMeshPack, lodLevels, meshParts } from '../src';

/** One root with a single-triangle 36-byte ("Old") mesh bound to material slot 1. */
function oldMeshScene() {
  const b = new PrmBuilder();
  const vertices = b.add(3 * 36, (a, at) => {
    for (let i = 0; i < 3; i++) {
      const v = at + i * 36;
      a.f32(v, i);
      a.f32(v + 4, 2 * i);
      a.f32(v + 8, 3 * i);
      a.f32(v + 12, 0);
      a.f32(v + 16, 1);
      a.f32(v + 20, 0);
      a.u32(v + 24, 0xff0000ff); // opaque blue
      a.f32(v + 28, i / 2);
      a.f32(v + 32, 1);
    }
  });
  const indices = b.add(16, (a, at) => {
    a.u16(at, 1);
    a.u16(at + 2, 3);
    a.u16(at + 4, 2);
    a.u16(at + 6, 1);
    a.u16(at + 8, 0);
  });
  const subs = b.add(16, (a, at) => {
    a.u32(at, 3);
    a.u32(at + 4, vertices);
    a.u32(at + 8, 3);
    a.u32(at + 12, indices);
  });
  const table = b.add(8, (a, at) => a.u32(at, subs));
  const mesh = b.add(0x38, (a, at) => {
    a.u16(at + 2, 8);
    a.bytes[at + 0x0e] = 0x7c;
    a.u16(at + 0x12, 1);
    a.u32(at + 0x28, table);
    a.u32(at + 0x2c, 1);
  });
  const objects = b.add(4, (a, at) => a.u32(at, mesh));
  const root = b.add(0x3c, (a, at) => {
    a.u16(at + 2, 7);
    a.u32(at + 0x14, 1);
    a.u32(at + 0x18, objects);
  });
  const mat = new MatFile(
    makeMat(
      [{ name: 'Old', root: { tag: 'CLAS', children: [{ tag: 'NAME', text: 'Old' }] } }],
      [{ className: 'Old', classSlot: 1, refCount: 1, root: { tag: 'INST', children: [{ tag: 'NAME', text: 'Legacy' }] } }],
    ),
  );
  return { prm: new PrmFile(b.build()), mat, root };
}

describe('meshParts', () => {
  it("takes the vertex size from the material's class", () => {
    const { prm, mat, root } = oldMeshScene();
    const [part] = meshParts(prm, mat, root);
    expect(part).toMatchObject({ stride: 36, vertexCount: 3, triangleCount: 1, lodMask: 0x7c, materialSlot: 1 });
    expect(lodLevels(part!.lodMask)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('mesh packs', () => {
  it('round-trips positions, colours and indices on 4-byte boundaries', () => {
    const { prm, mat, root } = oldMeshScene();
    const pack = decodeMeshPack(encodeMeshPack(prm, meshParts(prm, mat, root)));
    const [part] = pack.parts;
    expect(part).toMatchObject({ vertexCount: 3, indexCount: 3, materialSlot: 1 });

    const { body } = pack;
    const at = (range: [number, number]) => {
      expect(range[0] % 4).toBe(0);
      return body.byteOffset + range[0];
    };
    expect(Array.from(new Float32Array(body.buffer, at(part!.position), 9))).toEqual([0, 0, 0, 1, 2, 3, 2, 4, 6]);
    expect(Array.from(new Uint8Array(body.buffer, at(part!.color), 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(new Uint16Array(body.buffer, at(part!.index), 3))).toEqual([2, 1, 0]);
    expect(Array.from(new Float32Array(body.buffer, at(part!.uv!), 2))).toEqual([0, 1]);
  });

  it('rejects bytes that are not a mesh pack', () => {
    expect(() => decodeMeshPack(new Uint8Array(16))).toThrow(FormatError);
  });
});
