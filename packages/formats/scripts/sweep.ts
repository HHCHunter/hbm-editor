import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveGameDir } from './nodeIo';
import { sweepCorpus } from './sweepCorpus';

// pnpm sweep --game "<install folder, Scenes folder or HitmanBloodMoney.exe>"   (or set HBM_GAME_DIR)

const { values } = parseArgs({ options: { game: { type: 'string' } } });
const gameDir = resolveGameDir(values.game ?? process.env.HBM_GAME_DIR);
if (!gameDir) {
  console.error('Point the sweep at your game: pnpm sweep --game "D:\\Games\\Hitman Blood Money" (or set HBM_GAME_DIR).');
  process.exit(2);
}

const report = await sweepCorpus(gameDir, (line) => console.log(line));
const sum = (pick: (a: (typeof report.archives)[number]) => number) => report.archives.reduce((n, a) => n + pick(a), 0);

console.log('');
console.log(`archives           ${report.archives.length}`);
console.log(`members            ${sum((a) => a.members)}  (methods ${JSON.stringify(report.compressionMethods)})`);
console.log(`PRP nodes          ${sum((a) => a.prp?.nodes ?? 0)}  controllers ${sum((a) => a.prp?.controllers ?? 0)}`);
console.log(`GMS geoms          ${sum((a) => a.prp?.geoms ?? 0)}  with a decodable geom head ${sum((a) => a.prp?.geomHeads ?? 0)}`);
console.log(`LOC databases      ${sum((a) => a.locDatabases)}  nodes ${sum((a) => a.locNodes)}  (records with other flag bits ${JSON.stringify(report.locFlagBits)})`);
console.log(`classes            ${report.classes ? `${report.classes.registrations} registered, ${report.classes.unresolved} unresolved` : 'executable not found'}`);
console.log(`time               ${report.seconds.toFixed(1)} s`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = path.join(root, '.cache', 'sweep-report.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 1));
console.log(`report             ${path.relative(root, out)}`);

if (report.failures.length) {
  console.log(`\n${report.failures.length} check(s) failed:`);
  for (const f of report.failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
