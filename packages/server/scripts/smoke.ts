import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveGameDir } from '@hbm/formats/node';
import type { SceneGraphDTO, SceneListItemDTO, TextureDTO } from '@hbm/protocol';
import { buildApp } from '../src/app';

// Asks the server for every real scene's graph, surfaces, textures, a mesh batch, a texture image
// and its localisation root, and reports anything that isn't a 200.
//
//   pnpm --filter @hbm/server smoke --game "<install folder or HitmanBloodMoney.exe>"

const { values } = parseArgs({ options: { game: { type: 'string' } } });
const gameDir = resolveGameDir(values.game ?? process.env.HBM_GAME_DIR);
if (!gameDir) {
  console.error('Point the smoke test at your game: --game "D:\\Games\\Hitman Blood Money" (or set HBM_GAME_DIR).');
  process.exit(2);
}

const PORT = 4757;
const dataDir = await mkdtemp(path.join(tmpdir(), 'hbm-smoke-'));
const app = await buildApp({ port: PORT, token: 'smoke', dataDir, game: gameDir });
const failures: string[] = [];
let requests = 0;

async function get(url: string) {
  requests++;
  const res = await app.inject({ method: 'GET', url, headers: { host: `127.0.0.1:${PORT}` } });
  if (res.statusCode !== 200) failures.push(`${url} -> ${res.statusCode} ${res.body.slice(0, 200)}`);
  return res;
}

try {
  const scenes = (await get('/api/scenes')).json<SceneListItemDTO[]>();
  for (const { id } of scenes) {
    const started = performance.now();
    const q = `scene=${encodeURIComponent(id)}`;
    const graphRes = await get(`/api/scene/graph?${q}`);
    await get(`/api/scene/transforms?${q}`);
    await get(`/api/scene/surfaces?${q}`);
    const textures = (await get(`/api/scene/textures?${q}`)).json<TextureDTO[]>();
    if (textures[0]) await get(`/api/scene/texture?${q}&id=${textures[0].id}`);

    let parts = 0;
    if (graphRes.statusCode === 200) {
      const graph = graphRes.json<SceneGraphDTO>();
      if (graph.nodes.length) await get(`/api/scene/node?${q}&index=${graph.nodes.length - 1}`);
      const roots = graph.roots.slice(0, 64).map((r) => r.root);
      if (roots.length) {
        await get(`/api/scene/meshes?${q}&roots=${roots.join(',')}`);
        parts = graph.roots.reduce((n, r) => n + r.parts, 0);
      }
    }

    const loc = await app.inject({ method: 'GET', url: `/api/scene/loc/children?${q}`, headers: { host: `127.0.0.1:${PORT}` } });
    requests++;
    // Loader_Sequence scenes have no localisation database, which is a 404 by design.
    if (loc.statusCode !== 200 && !(loc.statusCode === 404 && id.endsWith('Loader_Sequence'))) {
      failures.push(`loc/children for ${id} -> ${loc.statusCode}`);
    }
    console.log(`${id.padEnd(28)} ${String(textures.length).padStart(5)} textures ${String(parts).padStart(6)} parts  ${((performance.now() - started) / 1000).toFixed(2)} s`);
  }
} finally {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}

console.log(`\n${requests} requests`);
if (failures.length) {
  console.log(`${failures.length} failed:`);
  for (const f of failures.slice(0, 30)) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('Every request succeeded.');
