// Decides whether start.bat and dev.bat need to reinstall dependencies or rebuild the editor.
//
//   node check.mjs needs install|build   exit 2 = needed, 0 = up to date, 1 = error
//   node check.mjs mark install|build    record that the step just succeeded
//
// A step is needed when its inputs have changed since it last succeeded. Inputs are hashed,
// not compared by timestamp, so copying or unzipping the folder doesn't force a rebuild.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stampDir = path.join(root, '.runtime', 'stamps');
const WORKSPACES = ['packages', 'apps'];

function workspaceDirs() {
  return WORKSPACES.flatMap((group) => {
    const dir = path.join(root, group);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  });
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function hashFiles(files) {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    if (existsSync(file) && statSync(file).isFile()) hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const steps = {
  install: {
    inputs: () => [
      path.join(root, 'package.json'),
      path.join(root, 'pnpm-lock.yaml'),
      path.join(root, 'pnpm-workspace.yaml'),
      ...workspaceDirs().map((d) => path.join(d, 'package.json')),
    ],
    present: () => existsSync(path.join(root, 'node_modules', '.modules.yaml')),
  },
  build: {
    inputs: () => [
      path.join(root, 'pnpm-lock.yaml'),
      path.join(root, 'tsconfig.base.json'),
      ...workspaceDirs().flatMap((d) => [
        ...listFiles(path.join(d, 'src')),
        path.join(d, 'package.json'),
        path.join(d, 'index.html'),
        path.join(d, 'vite.config.ts'),
      ]),
    ],
    present: () => existsSync(path.join(root, 'apps', 'editor', 'dist', 'index.html')),
  },
};

function main() {
  const [command, stepName] = process.argv.slice(2);
  const step = steps[stepName];
  if (!step || (command !== 'needs' && command !== 'mark')) {
    console.error('usage: node check.mjs needs|mark install|build');
    return 1;
  }
  const stampFile = path.join(stampDir, `${stepName}.sha256`);
  const current = hashFiles(step.inputs());

  if (command === 'mark') {
    mkdirSync(stampDir, { recursive: true });
    writeFileSync(stampFile, current);
    return 0;
  }

  const recorded = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : '';
  return step.present() && recorded === current ? 0 : 2;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err);
  process.exit(1);
}
