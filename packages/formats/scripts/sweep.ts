import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveGameDir } from './nodeIo';
import { sweepCorpus, type ArchiveSummary } from './sweepCorpus';

// pnpm sweep --game "<install folder, Scenes folder or HitmanBloodMoney.exe>"   (or set HBM_GAME_DIR)

const { values } = parseArgs({ options: { game: { type: 'string' } } });
const gameDir = resolveGameDir(values.game ?? process.env.HBM_GAME_DIR);
if (!gameDir) {
  console.error('Point the sweep at your game: pnpm sweep --game "D:\\Games\\Hitman Blood Money" (or set HBM_GAME_DIR).');
  process.exit(2);
}

const report = await sweepCorpus(gameDir, (line) => console.log(line));
const sum = (pick: (a: ArchiveSummary) => number) => report.archives.reduce((n, a) => n + pick(a), 0);
const strides: Record<string, number> = {};
for (const a of report.archives) {
  for (const [s, n] of Object.entries(a.prm?.strides ?? {})) strides[s] = (strides[s] ?? 0) + n;
}

console.log('');
console.log(`archives        ${report.archives.length}; members ${sum((a) => a.members)} (methods ${JSON.stringify(report.compressionMethods)})`);
console.log(`GMS             ${sum((a) => a.gms?.geoms ?? 0)} geoms; depth agrees with PRP on ${sum((a) => a.gms?.depthMatches ?? 0)}; transform equals PRP head on ${sum((a) => a.gms?.transformMatches ?? 0)}`);
console.log(`PRP             ${sum((a) => a.prp?.nodes ?? 0)} nodes, ${sum((a) => a.prp?.controllers ?? 0)} controllers, ${sum((a) => a.prp?.geomHeads ?? 0)} geom heads`);
console.log(`TEX             ${sum((a) => a.tex?.records ?? 0)} records, ${sum((a) => a.tex?.levels ?? 0)} mip levels, ${sum((a) => a.tex?.decoded ?? 0)} decoded; ${sum((a) => a.tex?.unreferencedBytes ?? 0)} stream bytes no table reaches`);
console.log(`PRM             ${sum((a) => a.prm?.descriptors ?? 0)} descriptors, ${sum((a) => a.prm?.roots ?? 0)} roots (${sum((a) => a.prm?.placedRoots ?? 0)} placed), ${sum((a) => a.prm?.subMeshes ?? 0)} submeshes`);
console.log(`                vertex sizes ${JSON.stringify(strides)}; normals not unit length ${sum((a) => a.prm?.nonUnitNormals ?? 0)} of ${sum((a) => a.prm?.normals ?? 0)}`);
console.log(`MAT             ${sum((a) => a.mat?.materials ?? 0)} materials, ${sum((a) => a.mat?.classes ?? 0)} classes`);
console.log(`LOC             ${sum((a) => a.locDatabases)} databases, ${sum((a) => a.locNodes)} nodes (records with other flag bits ${JSON.stringify(report.locFlagBits)})`);
console.log(`classes         ${report.classes ? `${report.classes.registrations} registered, ${report.classes.unresolved} unresolved` : 'executable not found'}`);
for (const w of report.witnesses) console.log(`witness         ${w}`);
console.log(`time            ${report.seconds.toFixed(1)} s`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = path.join(root, '.cache', 'sweep-report.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 1));
console.log(`report          ${path.relative(root, out)}`);

if (report.failures.length) {
  console.log(`\n${report.failures.length} check(s) failed:`);
  for (const f of report.failures.slice(0, 40)) console.log(`  - ${f}`);
  if (report.failures.length > 40) console.log(`  … and ${report.failures.length - 40} more (see the report)`);
  process.exit(1);
}
console.log('\nAll checks passed.');
