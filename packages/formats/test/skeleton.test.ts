import { describe, expect, it } from 'vitest';
import { PrmFile, VERTEX_LAYOUTS, composeTransforms, decodeVertices, readSkeleton } from '../src';
import { PrmBuilder } from './fixtures/assetBuilders';

/** The file stores a rotation R as transpose(R) with its rows reversed, like GMS placements. */
function stored(r: number[], t: number[]): number[] {
  return [r[2]!, r[5]!, r[8]!, r[1]!, r[4]!, r[7]!, r[0]!, r[3]!, r[6]!, ...t];
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const YAW_90 = [0, 0, 1, 0, 1, 0, -1, 0, 0];

/** A root with a two-bone skeleton (ROOT at the origin, CHILD 10 up and turned) and one weighted mesh. */
function skinnedModel() {
  const b = new PrmBuilder();
  const bone = (a: { f32: (at: number, v: number) => void; u32: (at: number, v: number) => void; bytes: Uint8Array }, at: number, name: string, parent: number, id: number) => {
    a.u32(at + 0x0c, parent);
    a.bytes.set(new TextEncoder().encode(name), at + 0x1c);
    a.bytes[at + 0x3e] = id;
  };
  const defs = b.add(0x80, (a, at) => {
    bone(a, at, 'ROOT', 0xffffffff, 1);
    bone(a, at + 0x40, 'CHILD', 0, 2);
  });
  const matrices = (list: number[][]) =>
    b.add(48 * list.length, (a, at) => list.flat().forEach((v, i) => a.f32(at + i * 4, v)));
  const global = matrices([stored(IDENTITY, [0, 0, 0]), stored(YAW_90, [0, 10, 0])]);
  const local = matrices([stored(IDENTITY, [0, 0, 0]), stored(YAW_90, [0, 10, 0])]);
  const decl = b.add(0x50, (a, at) => {
    a.u32(at, 2);
    a.u32(at + 4, defs);
    a.u32(at + 8, global);
    a.u32(at + 12, local);
  });
  const properties = b.add(16, (a, at) => a.u32(at + 4, decl));
  const runs = b.add(8, (a, at) => {
    a.u32(at, 2 * 12);
    a.u32(at + 4, 0);
  });
  const mesh = b.add(0x40, (a, at) => {
    a.u16(at + 2, 8);
    a.bytes[at + 0x0c] = 3;
    a.u32(at + 0x38, 1);
    a.u32(at + 0x3c, runs);
  });
  const objects = b.add(4, (a, at) => a.u32(at, mesh));
  const root = b.add(0x3c, (a, at) => {
    a.u16(at + 2, 7);
    a.u32(at + 0x0c, 1);
    a.u32(at + 0x10, properties);
    a.u32(at + 0x14, 1);
    a.u32(at + 0x18, objects);
  });
  return { prm: new PrmFile(b.build()), root, mesh };
}

describe('skeletons', () => {
  const { prm, root, mesh } = skinnedModel();

  it('reads bones, parents and decoded bind transforms', () => {
    const skeleton = readSkeleton(prm, root)!;
    expect(skeleton.bones.map((b) => [b.name, b.parent, b.id])).toEqual([
      ['ROOT', -1, 1],
      ['CHILD', 0, 2],
    ]);
    expect(skeleton.bones[1]!.global).toEqual([...YAW_90, 0, 10, 0]);
    expect(composeTransforms(skeleton.bones[0]!.global, skeleton.bones[1]!.local)).toEqual(skeleton.bones[1]!.global);
  });

  it('expands a weighted mesh palette from its runs', () => {
    const object = prm.objects(prm.objectHeader(root)!)[0]!;
    expect(object.index).toBe(mesh);
    expect(prm.bonePalette(prm.mesh(object)!)).toEqual([0, 1]);
  });

  it('decodes blend weights with the implied fourth and index bytes as palette slots', () => {
    const block = new Uint8Array(52);
    const view = new DataView(block.buffer);
    view.setFloat32(12, 0.5, true);
    view.setFloat32(16, 0.25, true);
    block.set([3, 0, 6, 0], 24);
    const v = decodeVertices(block, 1, VERTEX_LAYOUTS[52]);
    expect(Array.from(v.blendWeights!)).toEqual([0.5, 0.25, 0, 0.25]);
    expect(Array.from(v.blendIndices!)).toEqual([1, 0, 2, 0]);
  });

  it('has no skeleton without the property flag', () => {
    const plain = new PrmBuilder();
    const r = plain.add(0x3c, (a, at) => a.u16(at + 2, 7));
    expect(readSkeleton(new PrmFile(plain.build()), r)).toBeNull();
  });
});
