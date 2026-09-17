import { describe, expect, it } from 'vitest';
import {
  PRIM_TYPE,
  PrmFile,
  VERTEX_LAYOUTS,
  decodeVertices,
  layoutForMaterialClass,
  strideCandidates,
  unpackNormal,
} from '../src';
import { PrmBuilder } from './fixtures/assetBuilders';

/** One root holding one 40-byte mesh object with a single triangle. */
function sampleMesh() {
  const b = new PrmBuilder();
  const vertices = b.add(3 * 40, (a, at) => {
    for (let i = 0; i < 3; i++) {
      const v = at + i * 40;
      a.f32(v, i);
      a.f32(v + 4, 10 * i);
      a.f32(v + 8, -i);
      a.u32(v + 12, 0x00ff7f00); // packed normal: x 0xFF, y 0x7F, z 0x00
      a.u32(v + 16, 0x80112233); // D3DCOLOR 0xAARRGGBB
      a.f32(v + 20, 0.25);
      a.f32(v + 24, 0.75);
    }
  });
  const indices = b.add(16, (a, at) => {
    a.u16(at, 1);
    a.u16(at + 2, 3);
    a.u16(at + 4, 0);
    a.u16(at + 6, 1);
    a.u16(at + 8, 2);
  });
  const subMeshes = b.add(16, (a, at) => {
    a.u32(at, 3);
    a.u32(at + 4, vertices);
    a.u32(at + 8, 3);
    a.u32(at + 12, indices);
  });
  const table = b.add(8, (a, at) => a.u32(at, subMeshes));
  const mesh = b.add(0x38, (a, at) => {
    a.u16(at + 2, PRIM_TYPE.MESH);
    a.bytes[at + 0x0c] = 0; // subtype
    a.bytes[at + 0x0e] = 0x01; // LOD 0 only
    a.bytes[at + 0x0f] = 5; // variant
    a.u16(at + 0x12, 7); // material slot
    a.u32(at + 0x1c, 0x00800000); // draw mode
    a.u32(at + 0x28, table);
    a.u32(at + 0x2c, 1);
  });
  const objects = b.add(4, (a, at) => a.u32(at, mesh));
  const root = b.add(0x3c, (a, at) => {
    a.u16(at + 2, PRIM_TYPE.OBJECT_HEADER);
    a.u32(at + 0x14, 1);
    a.u32(at + 0x18, objects);
  });
  return { prm: new PrmFile(b.build()), root, vertices };
}

describe('PrmFile', () => {
  const { prm, root, vertices } = sampleMesh();

  it('finds the root and walks object, mesh and submesh', () => {
    expect(prm.problems).toEqual([]);
    expect(prm.findRoots()).toEqual([root]);
    const [object] = prm.objects(prm.objectHeader(root)!);
    expect(object).toMatchObject({ type: PRIM_TYPE.MESH, lodMask: 1, variantId: 5, materialId: 7, drawMode: 0x00800000 });
    const mesh = prm.mesh(object!)!;
    const [sub] = prm.subMeshes(mesh);
    expect(sub).toMatchObject({ numVertices: 3, vertices, numIndices: 3 });
    expect(Array.from(prm.triangleIndices(sub!))).toEqual([0, 1, 2]);
  });

  it('solves the vertex size from the block size', () => {
    expect(strideCandidates(3, 1, 128)).toEqual([40]);
    expect(strideCandidates(1, 1, 16)).toEqual([4, 8, 12, 16]);
  });

  it('decodes a 40-byte vertex the way the accessors lay it out', () => {
    const [object] = prm.objects(prm.objectHeader(root)!);
    const sub = prm.subMeshes(prm.mesh(object!)!)[0]!;
    const v = decodeVertices(prm.vertexBytes(sub, 40), 3, VERTEX_LAYOUTS[40]);
    expect(Array.from(v.positions.subarray(3, 6))).toEqual([1, 10, -1]);
    expect(Array.from(v.uvs!.subarray(0, 2))).toEqual([0.25, 0.75]);
    expect(Array.from(v.colors.subarray(0, 4))).toEqual([0x11, 0x22, 0x33, 0x80]);
    // 255 × float(2/255) − 1 is 1.0000001 in single precision, as in the engine.
    expect(v.normals![0]).toBeCloseTo(1, 6);
    expect(v.normals![2]).toBe(-1);
  });
});

describe('vertex layouts', () => {
  it("decodes byte 0x7F to about -0.0039, not zero, as the engine's codec does", () => {
    const out = new Float32Array(3);
    unpackNormal(0x007f00ff, out, 0);
    expect(out[0]).toBeCloseTo(-0.0039215, 6);
    expect(out[1]).toBe(-1);
    expect(out[2]).toBeCloseTo(1, 6);
  });

  it('picks the layout from the material class', () => {
    expect(layoutForMaterialClass('Standard', false)?.stride).toBe(40);
    expect(layoutForMaterialClass('Standard', true)?.stride).toBe(52);
    expect(layoutForMaterialClass('Old', false)?.stride).toBe(36);
    expect(layoutForMaterialClass('StaticShadow', false)?.stride).toBe(16);
    expect(layoutForMaterialClass('Sprites', false)).toBeNull();
  });
});
