import { describe, expect, it } from 'vitest';
import { FormatError, readGeomHead, readPrpHeader, readPrpTree, readRecordTokens } from '../src';
import { PrpBuilder } from './fixtures/builders';

/** A scene with one property, a root with a controller, two children and a grandchild. */
function sampleScene(): Uint8Array {
  const b = new PrpBuilder();
  b.container(1).string('CameraFar').u32(9).u32(1).floats([100000]);
  b.beginNode().endNode(); // root: no geom head
  b.container(1).string('TimeOutDelete').beginNode().u32(5).endNode();
  b.container(2);
  b.beginNode().geomHead(7, [1, 2, 3]).endNode().container(0).container(0);
  b.beginNode().geomHead(0).endNode().container(0).container(1);
  b.beginNode().geomHead(3).endNode().container(0).container(0);
  return b.build({ refSlots: 5 });
}

describe('readPrpHeader', () => {
  it('reads the flags and the N+1-entry string table', () => {
    const header = readPrpHeader(sampleScene());
    expect(header.magicOk).toBe(true);
    expect(header.flags).toBe(0x0d);
    expect(header.strings).toHaveLength(3);
    expect(header.refSlots).toBe(5);
  });

  it('reads a byte-swapped header', () => {
    const bytes = new Uint8Array(27);
    bytes.set(new TextEncoder().encode('IOPacked v0.1'));
    bytes[14] = 1;
    const v = new DataView(bytes.buffer);
    v.setUint32(15, 0x1, false);
    v.setUint32(23, 42, false);
    const header = readPrpHeader(bytes);
    expect(header.endianSwap).toBe(true);
    expect(header.refSlots).toBe(42);
  });

  it('refuses streams with a token dictionary', () => {
    const b = new PrpBuilder();
    b.container(0);
    expect(() => readPrpHeader(b.build({ refSlots: 0, flags: 0x0f }))).toThrow(/token dictionary/);
  });
});

describe('readPrpTree', () => {
  const data = sampleScene();
  const tree = readPrpTree(data);

  it('reads the scene properties', () => {
    expect(tree.sceneProperties).toEqual([{ name: 'CameraFar', type: 9, values: [100000] }]);
  });

  it('reads nodes in depth-first pre-order', () => {
    expect(tree.nodes.map((n) => n.depth)).toEqual([0, 1, 1, 2]);
    expect(tree.nodes.map((n) => n.parent)).toEqual([-1, 0, 0, 2]);
    expect(tree.nodes[0]!.controllers.map((c) => c.name)).toEqual(['TimeOutDelete']);
  });

  it('meets the counts the engine relies on', () => {
    expect(tree.nodes.length + tree.controllerCount).toBe(tree.header.refSlots);
    expect(tree.trailingBytes).toBe(3);
  });

  it("decodes a geom record's 15-property head", () => {
    const head = readGeomHead(data, tree, tree.nodes[1]!.record);
    expect(head).toEqual({
      boundingBox: 'STATIC',
      matrix: [0, 0, 1, 0, 1, 0, 1, 0, 0],
      position: [1, 2, 3],
      inactive: false,
      prim: 7,
    });
  });

  it('returns null for a record without a geom head', () => {
    expect(readGeomHead(data, tree, tree.nodes[0]!.record)).toBeNull();
  });

  it("lists a record's tokens", () => {
    const tokens = readRecordTokens(data, tree, tree.nodes[0]!.controllers[0]!.record);
    expect(tokens.map((t) => [t.kind, t.value])).toEqual([['u32', 5]]);
  });

  it('rejects an unknown marker, naming its offset', () => {
    const b = new PrpBuilder();
    b.container(0).beginNode().marker(0x55).endNode();
    try {
      readPrpTree(b.build({ refSlots: 1 }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FormatError);
      expect((err as FormatError).message).toMatch(/unknown marker 0x55/);
    }
  });

  it('rejects nested node records', () => {
    const b = new PrpBuilder();
    b.container(0).beginNode().beginNode().endNode().endNode().container(0).container(0);
    expect(() => readPrpTree(b.build({ refSlots: 1 }))).toThrow(/do not nest/);
  });
});
