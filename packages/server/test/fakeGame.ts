import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PrmBuilder,
  PrpBuilder,
  makeGmsImage,
  makeLoc,
  makeMat,
  makePe,
  makeTex,
  makeZip,
  text,
} from '@hbm/formats/testing';

// A tiny but complete install: one scene with one textured triangle mesh, a controller and a
// localisation database. Everything is generated; nothing comes from the game.

export interface FakeGame {
  root: string;
  exe: string;
  scene: string;
  meshRoot: number;
}

function meshPool(): { bytes: Uint8Array; root: number } {
  const b = new PrmBuilder();
  const vertices = b.add(3 * 40, (a, at) => {
    for (let i = 0; i < 3; i++) {
      const v = at + i * 40;
      a.f32(v, i);
      a.f32(v + 4, 1);
      a.f32(v + 8, 0);
      a.u32(v + 12, 0x007fff7f);
      a.u32(v + 16, 0xffffffff);
    }
  });
  const indices = b.add(16, (a, at) => {
    a.u16(at, 1);
    a.u16(at + 2, 3);
    a.u16(at + 6, 1);
    a.u16(at + 8, 2);
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
    a.bytes[at + 0x0e] = 0xff;
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
  return { bytes: b.build(), root };
}

/** A ZPackedDataChunk holding `image` uncompressed. */
function storedChunk(image: Uint8Array): Uint8Array {
  const out = new Uint8Array(9 + image.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, image.length, true);
  v.setUint32(4, out.length, true);
  out[8] = 1;
  out.set(image, 9);
  return out;
}

export async function makeFakeGame(root: string): Promise<FakeGame> {
  const prm = meshPool();

  const gms = makeGmsImage([
    { ascend: 0, hasChildren: false, stored: [0, 0, 1, 0, 1, 0, 1, 0, 0], translation: [1, 2, 3], typeId: 0x00200002, prim: prm.root, nameOffset: 16 },
  ]);

  const buf = new Uint8Array(32);
  buf.set(text('0123456789abcdef'), 0);
  buf.set(text('Lobby!Table_01'), 16);

  const prp = new PrpBuilder();
  prp.container(0);
  prp.beginNode().endNode().container(0).container(1);
  prp.beginNode().geomHead(prm.root, [1, 2, 3]).endNode();
  prp.container(1).string('TimeOutDelete').beginNode().u32(5).endNode();
  prp.container(0);

  const property = (tag: string, name: string, extra: { tag: string; ints?: number[] }[]) => ({
    tag,
    children: [{ tag: 'NAME', text: name }, { tag: 'ENAB', ints: [1] }, ...extra],
  });
  const mat = makeMat(
    [{ name: 'Standard', root: { tag: 'CLAS', children: [{ tag: 'NAME', text: 'Standard' }] } }],
    [
      {
        className: 'Standard',
        classSlot: 1,
        refCount: 1,
        root: {
          tag: 'INST',
          children: [
            { tag: 'NAME', text: 'Furniture/Table' },
            { tag: 'BIND', children: [property('TEXT', 'mapDiffuse', [{ tag: 'TXID', ints: [128] }])] },
          ],
        },
      },
    ],
  );

  const tex = makeTex([
    { id: 128, format: 'RGBA', width: 2, height: 2, name: 'Furniture/Table_Wood', levels: [new Uint8Array(16).fill(200), new Uint8Array([10, 20, 30, 255])] },
  ]);

  const loc = makeLoc([
    { name: 'AllLevels', children: [{ name: 'Actions', children: [{ name: 'Pickup', text: 'Pick up', sound: 7 }] }] },
  ]);

  const member = (ext: string) => `Scenes/M01/M01_main.${ext}`;
  const zip = makeZip([
    { name: member('GMS'), data: storedChunk(gms) },
    { name: member('BUF'), data: buf },
    { name: member('PRP'), data: prp.build({ refSlots: 3 }) },
    { name: member('PRM'), data: prm.bytes },
    { name: member('MAT'), data: mat },
    { name: member('TEX'), data: tex, method: 0 },
    { name: member('LOC'), data: loc },
  ]);

  await mkdir(path.join(root, 'Scenes', 'M01'), { recursive: true });
  await writeFile(path.join(root, 'Scenes', 'M01', 'M01_main.ZIP'), zip);
  const exe = path.join(root, 'HitmanBloodMoney.exe');
  await writeFile(exe, makePe(['ZSTDOBJ']).bytes);
  return { root, exe, scene: 'M01/M01_main', meshRoot: prm.root };
}
