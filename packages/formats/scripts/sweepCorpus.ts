import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LocDatabase,
  MatFile,
  PeImage,
  PrmFile,
  bufString,
  cacheFileName,
  checkLocalHeader,
  computePlacements,
  crc32,
  decodeTexLevel,
  decodeVertices,
  findMember,
  firstLevelWithData,
  layoutForMaterialClass,
  PRIM_SUBTYPE_WEIGHTED,
  readGeomHead,
  readGms,
  readMember,
  readPrpTree,
  readTex,
  readZipDirectory,
  resolveClassRegistry,
  strideCandidates,
  unpackChunk,
  type ZipEntry,
} from '../src';
import { nodeCodec, openFileSource } from './nodeIo';

// Reads every scene archive in an install and checks the counts the format docs publish.

/** Published corpus figures (scene-archives.md, loc.md, prp.md, tex.md, prm.md, mat.md). */
export const EXPECTED = {
  archives: 68,
  // loc.md says 48 databases, but its 267,348-node total is what all 54 shipped .LOC members hold,
  // one per scene archive except the 14 Loader_Sequence scenes.
  locDatabases: 54,
  locNodes: 267_348,
  prpTrailingBytes: 3,
  texRecords: 27_669,
  texLevels: 161_955,
  prmDescriptors: 491_614,
  prmSubMeshes: 69_464,
  prmRoots: 32_351,
  /** Submeshes per vertex size; the 16-byte count includes 23 that only the material resolves. */
  strides: { 40: 58_804, 52: 5_069, 36: 3_574, 16: 2_017 } as Record<string, number>,
  materials: 14_176,
  materialClasses: 345,
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
  trailingBytes: number;
  geomHeads: number;
  sceneProperties: number;
}

export interface GmsSummary {
  geoms: number;
  names: number;
  /** Geoms whose depth matches their PRP node's (nodes[k + 1] is geom k). */
  depthMatches: number;
  /** Geoms whose stored rotation and translation equal their PRP node's head. */
  transformMatches: number;
}

export interface PrmSummary {
  descriptors: number;
  roots: number;
  placedRoots: number;
  subMeshes: number;
  strides: Record<string, number>;
  /** Submeshes whose material-selected vertex size doesn't fit the vertex block. */
  strideMismatches: number;
  unresolvedMaterials: number;
  indexOutOfRange: number;
  indexCountNotTriangles: number;
  normals: number;
  nonUnitNormals: number;
}

export interface ArchiveSummary {
  scene: string;
  members: number;
  missingExtensions: string[];
  prp: PrpSummary | null;
  gms: GmsSummary | null;
  tex: { records: number; levels: number; decoded: number; unreferencedBytes: number } | null;
  prm: PrmSummary | null;
  mat: { materials: number; classes: number } | null;
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
  witnesses: string[];
  failures: string[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const same = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a));

async function sweepArchive(
  file: string,
  scenesDir: string,
  methods: Record<string, number>,
  locFlagBits: Record<string, number>,
  witnesses: string[],
): Promise<ArchiveSummary> {
  const relative = path.relative(scenesDir, file);
  const summary: ArchiveSummary = {
    scene: relative.replace(/\\/g, '/').replace(/\.zip$/i, ''),
    members: 0,
    missingExtensions: [],
    prp: null,
    gms: null,
    tex: null,
    prm: null,
    mat: null,
    locDatabases: 0,
    locNodes: 0,
    problems: [],
  };
  const { problems } = summary;
  const section = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      problems.push(`${label}: ${message(err)}`);
    }
  };
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

    const read = async (entry: ZipEntry | undefined) => {
      if (!entry) throw new Error('member is missing');
      const data = await readMember(src, entry, nodeCodec);
      if (crc32(data) !== entry.crc32) problems.push(`${entry.name}: CRC-32 doesn't match`);
      return data;
    };

    let buf: Uint8Array | null = null;
    await section('BUF', async () => {
      buf = await read(member('buf'));
    });

    let gms: ReturnType<typeof readGms> | null = null;
    await section('GMS', async () => {
      const chunk = unpackChunk(await read(member('gms')), nodeCodec);
      problems.push(...chunk.problems.map((p) => `GMS: ${p}`));
      gms = readGms(chunk.data);
      problems.push(...gms.problems.map((p) => `GMS: ${p}`));
      const placements = computePlacements(gms);
      problems.push(...placements.problems.map((p) => `GMS: ${p}`));
      const names = buf ? gms.geoms.filter((g) => bufString(buf!, g.nameOffset) !== null).length : 0;
      summary.gms = { geoms: gms.geoms.length, names, depthMatches: 0, transformMatches: 0 };
    });

    await section('PRP', async () => {
      const prp = await read(member('prp'));
      const tree = readPrpTree(prp);
      let geomHeads = 0;
      let depthMatches = 0;
      let transformMatches = 0;
      const image = gms?.image;
      for (let i = 1; i < tree.nodes.length; i++) {
        const head = readGeomHead(prp, tree, tree.nodes[i]!.record);
        if (head) geomHeads++;
        const geom = gms?.geoms[i - 1];
        if (!geom || !image) continue;
        if (tree.nodes[i]!.depth === geom.depth + 1) depthMatches++;
        if (head) {
          const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
          const matrixSame = head.matrix.every((v, k) => same(v, view.getFloat32(geom.rotationOffset + 4 * k, true)));
          const positionSame = head.position.every((v, k) => same(v, view.getFloat32(geom.translationOffset + 4 * k, true)));
          if (matrixSame && positionSame) transformMatches++;
        }
      }
      summary.prp = {
        nodes: tree.nodes.length,
        controllers: tree.controllerCount,
        refSlots: tree.header.refSlots,
        trailingBytes: tree.trailingBytes,
        geomHeads,
        sceneProperties: tree.sceneProperties.length,
      };
      if (summary.gms) {
        summary.gms.depthMatches = depthMatches;
        summary.gms.transformMatches = transformMatches;
      }
    });

    let mat: MatFile | null = null;
    await section('MAT', async () => {
      mat = new MatFile(await read(member('mat')));
      problems.push(...mat.problems.map((p) => `MAT: ${p}`));
      summary.mat = { materials: mat.materials.length, classes: mat.classes.length };
    });

    await section('TEX', async () => {
      const tex = readTex(await read(member('tex')));
      problems.push(...tex.problems.map((p) => `TEX: ${p}`));
      let decoded = 0;
      for (const record of tex.records) {
        // The smallest level with data exercises every decoder cheaply.
        let smallest = record.levels.length - 1;
        while (smallest >= 0 && record.levels[smallest]!.size === 0) smallest--;
        if (smallest < 0) continue;
        try {
          decodeTexLevel(tex, record, smallest);
          decoded++;
        } catch (err) {
          problems.push(`TEX: id ${record.id} ${record.format}: ${message(err)}`);
        }
      }
      summary.tex = { records: tex.records.length, levels: tex.levelCount, decoded, unreferencedBytes: tex.unreferencedBytes };

      // Two textures whose true colours are known (tex.md): 47's face, and the red LOADING caption.
      if (summary.scene === 'M03/M03_main') {
        const face = tex.byId.get(548);
        if (face) {
          const image = decodeTexLevel(tex, face, firstLevelWithData(face));
          witnesses.push(`M03_main id 548 "${face.name}" texel 0 = RGB(${image.rgba[0]}, ${image.rgba[1]}, ${image.rgba[2]}); expected skin, (162, 99, 83)`);
          if (image.rgba[0] !== 162 || image.rgba[1] !== 99 || image.rgba[2] !== 83) {
            problems.push('TEX: 47\'s face texel 0 is not RGB(162, 99, 83)');
          }
        }
      }
      if (summary.scene.endsWith('Loader_Sequence')) {
        const caption = tex.byId.get(131);
        if (caption) {
          const image = decodeTexLevel(tex, caption, firstLevelWithData(caption));
          let r = 0;
          let b = 0;
          let alpha = 0;
          for (let i = 0; i < image.rgba.length; i += 4) {
            const a = image.rgba[i + 3]!;
            r += image.rgba[i]! * a;
            b += image.rgba[i + 2]! * a;
            alpha += a;
          }
          // One archive's copy decodes fully transparent, so it has no colour to judge.
          if (alpha === 0) witnesses.push(`${summary.scene} id 131 decodes fully transparent`);
          else if (!(r > 2 * b)) problems.push(`TEX: the LOADING caption (id 131) isn't red`);
          else if (witnesses.every((w) => !w.startsWith('Loader_Sequence'))) {
            witnesses.push(`Loader_Sequence id 131 (${caption.format} ${caption.width}×${caption.height}): red outweighs blue ${(r / Math.max(1, b)).toFixed(0)}:1`);
          }
        }
      }
    });

    await section('PRM', async () => {
      const prm = new PrmFile(await read(member('prm')));
      problems.push(...prm.problems.map((p) => `PRM: ${p}`));
      const roots = prm.findRoots();
      const placed = new Set((gms?.geoms ?? []).map((g) => g.prim));
      const s: PrmSummary = {
        descriptors: prm.count,
        roots: roots.length,
        placedRoots: roots.filter((r) => placed.has(r)).length,
        subMeshes: 0,
        strides: {},
        strideMismatches: 0,
        unresolvedMaterials: 0,
        indexOutOfRange: 0,
        indexCountNotTriangles: 0,
        normals: 0,
        nonUnitNormals: 0,
      };
      // Roots share objects (LOD chains, character variants), so count each submesh record once.
      const seen = new Set<string>();
      for (const rootIndex of roots) {
        const root = prm.objectHeader(rootIndex)!;
        for (const object of prm.objects(root)) {
          const mesh = prm.mesh(object);
          if (!mesh) continue;
          const material = mat?.bySlot.get(object.materialId);
          for (const sub of prm.subMeshes(mesh)) {
            const key = `${sub.array}:${sub.slot}`;
            if (seen.has(key)) continue;
            seen.add(key);
            s.subMeshes++;
            const indices = prm.triangleIndices(sub);
            if (indices.length % 3) s.indexCountNotTriangles++;
            if (indices.some((i) => i >= sub.numVertices)) s.indexOutOfRange++;

            if (!material) {
              s.unresolvedMaterials++;
              continue;
            }
            const layout = layoutForMaterialClass(material.className, object.subType === PRIM_SUBTYPE_WEIGHTED);
            const block = prm.descriptor(sub.vertices);
            const fits = layout && block && strideCandidates(sub.numVertices, mesh.numFrames, block.size).includes(layout.stride);
            if (!layout || !fits) {
              s.strideMismatches++;
              if (s.strideMismatches <= 3) {
                const candidates = block ? strideCandidates(sub.numVertices, mesh.numFrames, block.size) : [];
                problems.push(`PRM: object ${object.index} (${material.className}, subtype ${object.subType}) fits vertex sizes [${candidates}], not ${layout?.stride}`);
              }
              continue;
            }
            s.strides[layout.stride] = (s.strides[layout.stride] ?? 0) + 1;
            if (layout.normal) {
              const vertices = decodeVertices(prm.vertexBytes(sub, layout.stride), sub.numVertices, layout);
              const n = vertices.normals!;
              for (let i = 0; i < n.length; i += 3) {
                s.normals++;
                if (Math.abs(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) - 1) > 0.02) s.nonUnitNormals++;
              }
            }
          }
        }
      }
      summary.prm = s;
    });

    for (const entry of directory.entries) {
      if (!/\.loc$/i.test(entry.name)) continue;
      await section(entry.name, async () => {
        const walk = new LocDatabase(await read(entry)).walk();
        summary.locDatabases++;
        summary.locNodes += walk.nodes;
        for (const [bit, n] of Object.entries(walk.otherFlagBits)) locFlagBits[bit] = (locFlagBits[bit] ?? 0) + n;
        problems.push(...walk.problems.map((p) => `${entry.name}: ${p}`));
      });
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
  const witnesses: string[] = [];
  const archives: ArchiveSummary[] = [];
  for (const zip of zips) {
    const a = await sweepArchive(zip, scenesDir, methods, locFlagBits, witnesses);
    archives.push(a);
    log(
      `${a.scene.padEnd(28)} ${String(a.gms?.geoms ?? '-').padStart(6)} geoms ${String(a.tex?.records ?? '-').padStart(5)} textures ${String(a.prm?.subMeshes ?? '-').padStart(5)} submeshes ${String(a.mat?.materials ?? '-').padStart(4)} materials  ${a.problems.length ? `${a.problems.length} problem(s)` : ''}`,
    );
  }

  let classes: SweepReport['classes'] = null;
  const exe = path.join(gameDir, 'HitmanBloodMoney.exe');
  if (existsSync(exe)) {
    const registry = resolveClassRegistry(new PeImage(new Uint8Array(await readFile(exe))));
    classes = { registrations: registry.byTypeId.size + registry.unresolved.length, unresolved: registry.unresolved.length };
  }

  const failures: string[] = [];
  const total = (pick: (a: ArchiveSummary) => number) => archives.reduce((n, a) => n + pick(a), 0);
  const expect = (label: string, actual: number, expected: number) => {
    if (actual !== expected) failures.push(`${label}: ${actual}, expected ${expected}`);
  };

  expect('scene archives', archives.length, EXPECTED.archives);
  for (const a of archives) {
    if (a.problems.length) failures.push(`${a.scene}: ${a.problems.length} problem(s), the first: ${a.problems[0]}`);
    if (a.missingExtensions.length) failures.push(`${a.scene}: no member for ${a.missingExtensions.join(', ')}`);
    const { prp, gms, prm } = a;
    if (!prp || !gms) {
      failures.push(`${a.scene}: PRP or GMS wasn't read`);
      continue;
    }
    if (prp.nodes - 1 !== gms.geoms) failures.push(`${a.scene}: ${prp.nodes} PRP nodes but ${gms.geoms} GMS geoms`);
    if (prp.nodes + prp.controllers !== prp.refSlots) failures.push(`${a.scene}: nodes + controllers != REF slots`);
    if (prp.trailingBytes !== EXPECTED.prpTrailingBytes) failures.push(`${a.scene}: PRP parse ended ${prp.trailingBytes} bytes early`);
    if (gms.depthMatches !== gms.geoms) failures.push(`${a.scene}: ${gms.geoms - gms.depthMatches} geoms' tree depth disagrees with PRP`);
    if (gms.names !== gms.geoms) failures.push(`${a.scene}: ${gms.geoms - gms.names} geom names don't resolve in the BUF`);
    if (prm) {
      if (prm.unresolvedMaterials) failures.push(`${a.scene}: ${prm.unresolvedMaterials} submeshes name a missing material`);
      if (prm.strideMismatches) failures.push(`${a.scene}: ${prm.strideMismatches} submeshes don't fit their material's vertex size`);
      if (prm.indexOutOfRange) failures.push(`${a.scene}: ${prm.indexOutOfRange} submeshes index past their vertices`);
      if (prm.indexCountNotTriangles) failures.push(`${a.scene}: ${prm.indexCountNotTriangles} submeshes' index counts aren't multiples of 3`);
    }
  }
  expect('LOC databases', total((a) => a.locDatabases), EXPECTED.locDatabases);
  expect('LOC nodes', total((a) => a.locNodes), EXPECTED.locNodes);
  expect('TEX records', total((a) => a.tex?.records ?? 0), EXPECTED.texRecords);
  expect('TEX mip levels', total((a) => a.tex?.levels ?? 0), EXPECTED.texLevels);
  expect('PRM descriptors', total((a) => a.prm?.descriptors ?? 0), EXPECTED.prmDescriptors);
  expect('PRM object-header roots', total((a) => a.prm?.roots ?? 0), EXPECTED.prmRoots);
  expect('PRM submeshes', total((a) => a.prm?.subMeshes ?? 0), EXPECTED.prmSubMeshes);
  for (const [stride, count] of Object.entries(EXPECTED.strides)) {
    expect(`${stride}-byte submeshes`, total((a) => a.prm?.strides[stride] ?? 0), count);
  }
  expect('materials', total((a) => a.mat?.materials ?? 0), EXPECTED.materials);
  expect('material classes', total((a) => a.mat?.classes ?? 0), EXPECTED.materialClasses);
  if (!witnesses.some((w) => w.startsWith('M03_main'))) failures.push("47's face texture (M03_main id 548) wasn't checked");
  if (!witnesses.some((w) => w.startsWith('Loader_Sequence'))) failures.push('the LOADING caption (Loader_Sequence id 131) wasn\'t checked');
  if (!classes) failures.push('HitmanBloodMoney.exe not found, so class names were not checked');
  else if (classes.unresolved) failures.push(`${classes.unresolved} class registration name(s) didn't resolve in the executable`);

  return { gameDir, seconds: (Date.now() - started) / 1000, archives, compressionMethods: methods, locFlagBits, classes, witnesses, failures };
}
