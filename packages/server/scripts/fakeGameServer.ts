import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app';
import { makeFakeGame } from '../test/fakeGame';

// Serves the built editor over a generated game, for the browser tests. No game is chosen at
// start, so the page opens on the game picker. The browser tests find the install at
// <temp>/hbm-e2e-<port>/game.

const port = Number(process.env.HBM_E2E_PORT ?? 4791);
const here = path.dirname(fileURLToPath(import.meta.url));

const dir = path.join(tmpdir(), `hbm-e2e-${port}`);
await rm(dir, { recursive: true, force: true });
const fake = await makeFakeGame(path.join(dir, 'game'));
const app = await buildApp({
  port,
  token: 'e2e',
  staticDir: path.resolve(here, '../../../apps/editor/dist'),
  dataDir: path.join(dir, 'data'),
});
await app.listen({ port, host: '127.0.0.1' });
console.log(`fake game at ${fake.root}`);

const shutdown = () => {
  void app
    .close()
    .then(() => rm(dir, { recursive: true, force: true }))
    .finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
