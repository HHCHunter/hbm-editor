import { describe, expect, it } from 'vitest';
import { PrmFile, readGms, readPrpTree } from '@hbm/formats';
import { PrmBuilder, PrpBuilder, makeGmsImage, text } from '@hbm/formats/testing';
import { buildSceneGraph, leafName } from '../src';

const IDENTITY_STORED = [0, 0, 1, 0, 1, 0, 1, 0, 0];

function sampleScene() {
  const prmBuilder = new PrmBuilder();
  const root = prmBuilder.add(0x3c, (a, at) => a.u16(at + 2, 7));
  const prm = new PrmFile(prmBuilder.build());

  // BUF: the pool starts with its 16-byte marker, then names at 16-byte boundaries.
  const buf = new Uint8Array(80);
  buf.set(text('0123456789abcdef'), 0);
  buf.set(text('Lobby'), 16);
  buf.set(text('Lobby!Tables!TableA_01'), 32);
  buf.set(text('Omni01'), 64);

  // Room (with one child mesh), then a light back under the scene root.
  const gms = readGms(
    makeGmsImage([
      { ascend: 0, hasChildren: true, stored: IDENTITY_STORED, translation: [0, 0, 0], typeId: 0x00100021, nameOffset: 16 },
      { ascend: 0, hasChildren: false, stored: IDENTITY_STORED, translation: [1, 2, 3], typeId: 0x00200002, prim: root, nameOffset: 32 },
      { ascend: 1, hasChildren: false, stored: IDENTITY_STORED, translation: [0, 9, 0], typeId: 0x00800001, nameOffset: 64 },
    ]),
  );

  const p = new PrpBuilder();
  p.container(0);
  p.beginNode().endNode().container(0).container(2); // scene root: room and light
  p.beginNode().geomHead(0).endNode().container(0).container(1); // room
  p.beginNode().geomHead(root).endNode().container(1).string('TimeOutDelete').beginNode().endNode().container(0); // mesh
  p.beginNode().geomHead(0).endNode().container(0).container(0); // light
  const data = p.build({ refSlots: 5 });

  return buildSceneGraph({ gms, buf, prm, prp: { data, tree: readPrpTree(data) } });
}

describe('buildSceneGraph', () => {
  const graph = sampleScene();

  it('joins GMS geoms with their PRP nodes and BUF names', () => {
    expect(graph.problems).toEqual([]);
    expect(graph.nodes.map((n) => [n.name, n.parent, n.depth])).toEqual([
      ['Lobby', -1, 0],
      ['Lobby!Tables!TableA_01', 0, 1],
      ['Omni01', -1, 0],
    ]);
    expect(graph.nodes[1]).toMatchObject({ controllers: ['TimeOutDelete'], boundingBox: 'STATIC', inactive: false });
  });

  it('classifies nodes from type-id families when no executable is available', () => {
    expect(graph.nodes.map((n) => n.kind)).toEqual(['room', 'mesh', 'light']);
    expect(graph.nodes[1]!.meshRoot).toBeGreaterThan(0);
  });

  it('composes world transforms down the tree', () => {
    expect(Array.from(graph.transforms.subarray(12 + 9, 24))).toEqual([1, 2, 3]);
  });

  it('shortens scene paths to their last segment', () => {
    expect(leafName('Lobby!Tables!TableA_01')).toBe('TableA_01');
    expect(leafName('Lobby')).toBe('Lobby');
  });
});
