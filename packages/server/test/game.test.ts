import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOKEN_HEADER, type BrowseDTO, type ConfigDTO, type LocEntryDTO, type MaterialDetailDTO, type MaterialSummaryDTO, type LocLookupDTO, type NodeDetailDTO, type SceneGraphDTO, type SurfaceDTO, type TextureDTO } from '@hbm/protocol';
import { decodeMeshPack } from '@hbm/scene';
import { buildApp } from '../src/app';
import { ConfigStore } from '../src/config/configStore';
import { GameService } from '../src/game/GameService';
import { makeFakeGame, type FakeGame } from './fakeGame';

const PORT = 4757;
const TOKEN = 'test-token';
const headers = { host: `127.0.0.1:${PORT}` };

let temp: string;
let dataDir: string;
let fake: FakeGame;
let app: FastifyInstance;

const get = (url: string) => app.inject({ method: 'GET', url, headers });
const json = async <T>(url: string): Promise<T> => {
  const res = await get(url);
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
  return res.json() as T;
};
const scene = (route: string, extra = '') => `/api/scene/${route}?scene=M01/M01_main${extra}`;

beforeAll(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'hbm-server-test-'));
  dataDir = path.join(temp, 'data');
  fake = await makeFakeGame(path.join(temp, 'Hitman Blood Money'));
  app = await buildApp({ port: PORT, token: TOKEN, dataDir });
});

afterAll(async () => {
  await app.close();
  await rm(temp, { recursive: true, force: true });
});

describe('choosing the game', () => {
  it('starts with no game and refuses scene requests until one is chosen', async () => {
    expect((await json<ConfigDTO>('/api/config')).gameRoot).toBeNull();
    const res = await get('/api/scenes');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Choose your Hitman/);
  });

  it('rejects a folder that is not an install', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/config/game',
      headers: { ...headers, [TOKEN_HEADER]: TOKEN },
      payload: { path: temp },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts the executable, remembers the install and reads it back on restart', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/config/game',
      headers: { ...headers, [TOKEN_HEADER]: TOKEN },
      payload: { path: fake.exe },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ConfigDTO>()).toMatchObject({ gameRoot: fake.root, exePath: fake.exe });

    const saved = JSON.parse(await readFile(path.join(dataDir, 'config.json'), 'utf8'));
    expect(saved.gameRoot).toBe(fake.root);

    const restarted = await buildApp({ port: PORT, token: TOKEN, dataDir });
    const config = await restarted.inject({ method: 'GET', url: '/api/config', headers });
    expect(config.json<ConfigDTO>().gameRoot).toBe(fake.root);
    await restarted.close();
  });

  it('marks install folders and the executable while browsing', async () => {
    const parent = await json<BrowseDTO>(`/api/browse?path=${encodeURIComponent(path.dirname(fake.root))}`);
    expect(parent.entries.find((e) => e.path === fake.root)?.isGame).toBe(true);
    const inside = await json<BrowseDTO>(`/api/browse?path=${encodeURIComponent(fake.root)}`);
    expect(inside.gameRoot).toBe(fake.root);
    expect(inside.entries.find((e) => e.name === 'HitmanBloodMoney.exe')?.isGame).toBe(true);
  });
});

describe('scenes', () => {
  it('lists the scene archives', async () => {
    expect(await json('/api/scenes')).toEqual([{ id: 'M01/M01_main', group: 'M01', bytes: expect.any(Number) }]);
  });

  it('only opens scenes from the catalogue', async () => {
    expect((await get('/api/scene/graph?scene=M01/M02_main')).statusCode).toBe(404);
    expect((await get(`/api/scene/graph?scene=${encodeURIComponent('../../Windows/win')}`)).statusCode).toBe(404);
    expect((await get('/api/scene/graph')).statusCode).toBe(400);
  });

  it('returns the scene graph with its model roots', async () => {
    const graph = await json<SceneGraphDTO>(scene('graph'));
    expect(graph.problems).toEqual([]);
    expect(graph.nodes).toEqual([
      expect.objectContaining({ name: 'Lobby!Table_01', kind: 'mesh', meshRoot: fake.meshRoot, controllers: ['TimeOutDelete'] }),
    ]);
    expect(graph.roots).toEqual([expect.objectContaining({ root: fake.meshRoot, parts: 1, triangles: 1, lodMask: 0xff })]);
  });

  it('returns world transforms as 12 floats per node', async () => {
    const res = await get(scene('transforms'));
    const floats = new Float32Array(res.rawPayload.buffer.slice(res.rawPayload.byteOffset, res.rawPayload.byteOffset + res.rawPayload.byteLength));
    expect(Array.from(floats)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3]);
  });

  it("describes a node's properties and controllers", async () => {
    const detail = await json<NodeDetailDTO>(scene('node', '&index=0'));
    expect(detail.properties[0]).toMatchObject({ kind: 'enum', value: 'STATIC' });
    // The fake executable has no RTTI, so there are no property chains to type the records with.
    expect(detail.controllers).toEqual([
      {
        name: 'TimeOutDelete',
        properties: [expect.objectContaining({ kind: 'u32', value: 5 })],
        schema: { className: null, properties: [], tailTokens: 0, mismatch: null },
        scriptCreator: null,
      },
    ]);
    expect((await get(scene('node', '&index=9'))).statusCode).toBe(404);
  });

  it('packs meshes for requested roots', async () => {
    const res = await get(scene('meshes', `&roots=${fake.meshRoot}`));
    expect(res.statusCode).toBe(200);
    const pack = decodeMeshPack(new Uint8Array(res.rawPayload));
    expect(pack.parts).toEqual([expect.objectContaining({ vertexCount: 3, indexCount: 3, materialSlot: 1 })]);
    expect((await get(scene('meshes', '&roots=1'))).statusCode).toBe(404);
  });

  it('describes surfaces', async () => {
    expect(await json<SurfaceDTO[]>(scene('surfaces'))).toEqual([
      expect.objectContaining({ slot: 1, name: 'Furniture/Table', className: 'Standard', diffuseTextureId: 128, hiddenReason: null }),
    ]);
  });
});

describe('textures', () => {
  it('lists textures with the materials that use them', async () => {
    expect(await json<TextureDTO[]>(scene('textures'))).toEqual([
      expect.objectContaining({ id: 128, format: 'RGBA', width: 2, height: 2, materials: [1] }),
    ]);
  });

  it('serves a mip level as PNG, RGBA or the stored bytes', async () => {
    const png = await get(scene('texture', '&id=128'));
    expect(png.headers['content-type']).toBe('image/png');
    expect(Array.from(png.rawPayload.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const rgba = await get(scene('texture', '&id=128&level=1&as=rgba'));
    expect(Array.from(rgba.rawPayload)).toEqual([10, 20, 30, 255]);
    expect(rgba.headers['x-texture-width']).toBe('1');

    const raw = await get(scene('texture', '&id=128&as=raw'));
    expect(raw.rawPayload.length).toBe(16);
    expect((await get(scene('texture', '&id=999'))).statusCode).toBe(404);
  });
});

describe('materials', () => {
  it('lists materials with the objects that use them', async () => {
    expect(await json<MaterialSummaryDTO[]>(scene('materials'))).toEqual([
      { slot: 1, name: 'Furniture/Table', className: 'Standard', refCount: expect.any(Number), users: 1, diffuseTextureId: 128, features: [], hiddenReason: null },
    ]);
  });

  it('describes one material in full', async () => {
    const detail = await json<MaterialDetailDTO>(scene('material', '&slot=1'));
    expect(detail).toMatchObject({ slot: 1, name: 'Furniture/Table', className: 'Standard', users: [0] });
    expect(detail.properties).toEqual([{ kind: 'TEXT', name: 'mapDiffuse', enabled: true, fields: { TXID: [128] } }]);
    expect(detail.class?.name).toBe('Standard');
    expect(detail.raw).toMatchObject({ tag: 'INST', type: 'list' });
    expect((await get(scene('material', '&slot=9'))).statusCode).toBe(404);
  });
});

describe('localisation', () => {
  it('lists children by path', async () => {
    expect((await json<LocEntryDTO[]>(scene('loc/children'))).map((e) => [e.path, e.hasChildren])).toEqual([['AllLevels', true]]);
    expect(await json<LocEntryDTO[]>(scene('loc/children', '&path=AllLevels/Actions'))).toEqual([
      { name: 'Pickup', path: 'AllLevels/Actions/Pickup', flags: 0x21, text: 'Pick up', text2: null, soundId: 7, hasChildren: false },
    ]);
  });

  it('looks paths up the way the engine does', async () => {
    expect((await json<LocLookupDTO>(scene('loc/lookup', '&path=alllevels/actions/PICKUP'))).entry?.text).toBe('Pick up');
    expect((await json<LocLookupDTO>(scene('loc/lookup', '&path=AllLevels/Actions/Pick'))).shadowed).toBe(true);
    expect((await json<LocLookupDTO>(scene('loc/lookup', '&path=Nope'))).found).toBe(false);
  });

  it('searches names and text', async () => {
    expect((await json<LocEntryDTO[]>(scene('loc/search', '&q=pick%20up'))).map((e) => e.path)).toEqual(['AllLevels/Actions/Pickup']);
  });
});

describe('animations', () => {
  it('answers 404 for a scene without an .ANM member', async () => {
    expect((await get(scene('animations'))).statusCode).toBe(404);
  });
});

describe('mission scripts', () => {
  it('reports a scene without a script module or DLL as empty', async () => {
    expect(await json(scene('scripts'))).toEqual({ module: null, dll: null, creators: [], users: [] });
  });
});

describe('open scenes', () => {
  it('shares one open file between requests that arrive together', async () => {
    const service = await GameService.create(new ConfigStore(path.join(temp, 'data-concurrent')));
    await service.setGame(fake.root);
    const seen = await Promise.all([1, 2, 3].map(() => service.withScene(fake.scene, async (s) => s)));
    expect(new Set(seen).size).toBe(1);
    await service.close();
  });
});
