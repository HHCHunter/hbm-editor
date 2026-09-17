import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LocDatabase,
  PeImage,
  cacheFileName,
  checkLocalHeader,
  crc32,
  findMember,
  readGeomCount,
  readGeomHead,
  readMember,
  readPrpTree,
  readZipDirectory,
  resolveClassRegistry,
  unpackChunk,
  type ZipEntry,
} from '../src';
import { nodeCodec, openFileSource } from './nodeIo';

// Reads every scene archive in an install and checks the counts the format docs publish.

/** Published corpus figures (scene-archives.md, loc.md, prp.md). */
export const EXPECTED = {
  archives: 68,
  // loc.md says 48 databases, but its 267,348-node total is what all 54 shipped .LOC members hold,
  // one per scene archive except the 14 Loader_Sequence scenes.
  locDatabases: 54,
  locNodes: 267_348,
  prpTrailingBytes: 3,
};

/**
 * Extensions every scene archive ships, of the 18 the engine asks for. `col` and `gst` ship
 * nowhere; `wav` and `whd` are loose files beside the archives.
 */
const EXTENSIONS_IN_EVERY_ARCHIVE = ['rmc', 'rmi', 'oct', 'buf', 'prm', 'gms', 'prp', 'tex', 'mat', 'snd', 'anm', 'zgf', 'sgp', 'sgd'];

export interface PrpSummary {
  nodes: number;
  controllers: number;
  refSlots: number;
  geoms: number;
  trailingBytes: number;
  geomHeads: number;
  sceneProperties: number;
}

export interface ArchiveSummary {
  scene: string;
  members: number;
  missingExtensions: string[];
  prp: PrpSummary | null;
  locDatabases: number;
  locNodes: number;
  problems: string[];
}

export interface SweepReport {
  gameDir: string;
  seconds: number;
  archives: ArchiveSummary[];
  compressionMethods: Record<string, number>;
  /** LOC records per flag bit outside the four the engine decodes. */
  locFlagBits: Record<string, number>;
  classes: { registrations: number; unresolved: number } | null;
  failures: string[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function sweepArchive(
  file: string,
  scenesDir: string,
  methods: Record<string, number>,
  locFlagBits: Record<string, number>,
): Promise<ArchiveSummary> {
  const relative = path.relative(scenesDir, file);
  const summary: ArchiveSummary = {
    scene: relative.replace(/\\/g, '/').replace(/\.zip$/i, ''),
    members: 0,
    missingExtensions: [],
    prp: null,
    locDatabases: 0,
    locNodes: 0,
    problems: [],
  };
  const { problems } = summary;
  const src = await openFileSource(file);

  try {
    const directory = await readZipDirectory(src);
    summary.members = directory.entries.length;
    problems.push(...directory.problems);
    for (const entry of directory.entries) {
      methods[entry.method] = (methods[entry.method] ?? 0) + 1;
      const problem = await checkLocalHeader(src, entry);
      if (problem) problems.push(problem);
    }

    // The member names the engine builds from the scene's own file name.
    const sceneFileName = `Scenes\\${relative.replace(/\//g, '\\')}`;
    const member = (ext: string) => findMember(directory, cacheFileName(sceneFileName, ext));
    summary.missingExtensions = EXTENSIONS_IN_EVERY_ARCHIVE.filter((ext) => !member(ext));

    const read = async (entry: ZipEntry) => {
      const data = await readMember(src, entry, nodeCodec);
      if (crc32(data) !== entry.crc32) problems.push(`${entry.name}: CRC-32 doesn't match`);
      return data;
    };

    const prpEntry = member('prp');
    const gmsEntry = member('gms');
    if (prpEntry && gmsEntry) {
      try {
        const prp = await read(prpEntry);
        const tree = readPrpTree(prp);
        const gms = unpackChunk(await read(gmsEntry), nodeCodec);
        problems.push(...gms.problems.map((p) => `${gmsEntry.name}: ${p}`));
        let geomHeads = 0;
        for (let i = 1; i < tree.nodes.length; i++) {
          if (readGeomHead(prp, tree, tree.nodes[i]!.record)) geomHeads++;
        }
        summary.prp = {
          nodes: tree.nodes.length,
          controllers: tree.controllerCount,
          refSlots: tree.header.refSlots,
          geoms: readGeomCount(gms.data),
          trailingBytes: tree.trailingBytes,
          geomHeads,
          sceneProperties: tree.sceneProperties.length,
        };
      } catch (err) {
        problems.push(`${prpEntry.name}: ${message(err)}`);
      }
    }

    for (const entry of directory.entries) {
      if (!/\.loc$/i.test(entry.name)) continue;
      try {
        const walk = new LocDatabase(await read(entry)).walk();
        summary.locDatabases++;
        summary.locNodes += walk.nodes;
        for (const [bit, n] of Object.entries(walk.otherFlagBits)) {
          locFlagBits[bit] = (locFlagBits[bit] ?? 0) + n;
        }
        problems.push(...walk.problems.map((p) => `${entry.name}: ${p}`));
      } catch (err) {
        problems.push(`${entry.name}: ${message(err)}`);
      }
    }
  } catch (err) {
    problems.push(message(err));
  } finally {
    await src.close();
  }
  return summary;
}

export async function sweepCorpus(gameDir: string, log: (line: string) => void = () => {}): Promise<SweepReport> {
  const started = Date.now();
  const scenesDir = path.join(gameDir, 'Scenes');
  const zips = (await readdir(scenesDir, { recursive: true }))
    .filter((f) => /\.zip$/i.test(f))
    .sort()
    .map((f) => path.join(scenesDir, f));

  const methods: Record<string, number> = {};
  const locFlagBits: Record<string, number> = {};
  const archives: ArchiveSummary[] = [];
  for (const zip of zips) {
    const summary = await sweepArchive(zip, scenesDir, methods, locFlagBits);
    archives.push(summary);
    const prp = summary.prp ? `${summary.prp.nodes} nodes` : 'no PRP';
    log(`${summary.scene.padEnd(28)} ${String(summary.members).padStart(4)} members  ${prp}  ${summary.problems.length ? `${summary.problems.length} problem(s)` : ''}`);
  }

  let classes: SweepReport['classes'] = null;
  const exe = path.join(gameDir, 'HitmanBloodMoney.exe');
  if (existsSync(exe)) {
    const registry = resolveClassRegistry(new PeImage(new Uint8Array(await readFile(exe))));
    classes = { registrations: registry.byTypeId.size + registry.unresolved.length, unresolved: registry.unresolved.length };
  }

  const failures: string[] = [];
  if (archives.length !== EXPECTED.archives) {
    failures.push(`found ${archives.length} scene archives; the corpus has ${EXPECTED.archives}`);
  }
  for (const a of archives) {
    if (a.problems.length) failures.push(`${a.scene}: ${a.problems.length} problem(s), the first: ${a.problems[0]}`);
    if (a.missingExtensions.length) failures.push(`${a.scene}: no member for ${a.missingExtensions.join(', ')}`);
    const prp = a.prp;
    if (!prp) {
      failures.push(`${a.scene}: PRP tree wasn't read`);
      continue;
    }
    if (prp.nodes - 1 !== prp.geoms) failures.push(`${a.scene}: ${prp.nodes} PRP nodes but ${prp.geoms} GMS geoms`);
    if (prp.nodes + prp.controllers !== prp.refSlots) {
      failures.push(`${a.scene}: ${prp.nodes} nodes + ${prp.controllers} controllers != ${prp.refSlots} REF slots`);
    }
    if (prp.trailingBytes !== EXPECTED.prpTrailingBytes) {
      failures.push(`${a.scene}: PRP parse ended ${prp.trailingBytes} bytes before the end, not ${EXPECTED.prpTrailingBytes}`);
    }
  }
  const locDatabases = archives.reduce((n, a) => n + a.locDatabases, 0);
  const locNodes = archives.reduce((n, a) => n + a.locNodes, 0);
  if (locDatabases !== EXPECTED.locDatabases) failures.push(`found ${locDatabases} LOC databases, expected ${EXPECTED.locDatabases}`);
  if (locNodes !== EXPECTED.locNodes) failures.push(`LOC databases hold ${locNodes} nodes, expected ${EXPECTED.locNodes}`);
  if (!classes) failures.push('HitmanBloodMoney.exe not found, so class names were not checked');
  else if (classes.unresolved) failures.push(`${classes.unresolved} class registration name(s) didn't resolve in the executable`);

  return {
    gameDir,
    seconds: (Date.now() - started) / 1000,
    archives,
    compressionMethods: methods,
    locFlagBits,
    classes,
    failures,
  };
}
