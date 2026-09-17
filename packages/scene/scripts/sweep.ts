import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  CLIP_HUMAN_STATE,
  PRIM_SUBTYPE_RIGID,
  ROOT_TRACK_BONE,
  PeImage,
  VERTEX_LAYOUTS,
  composeTransforms,
  decodeVertices,
  readSkeleton,
  resolveClassRegistry,
  resolveSchemas,
  type ClassRegistry,
} from '@hbm/formats';
import { nodeCodec, openFileSource, resolveGameDir } from '@hbm/formats/node';
import {
  SceneArchive,
  bindNodeProperties,
  buildSceneGraph,
  decodeMeshPack,
  describeSurface,
  encodeMeshPack,
  meshParts,
  partHiddenReason,
  type HiddenReason,
  type NodeKind,
  type Surface,
} from '../src';

// Builds the scene join for every archive: graph, parts for every placed root, surfaces, and a
// mesh pack for one scene. Also times the largest scene against the plan's 8-second budget.
//
//   pnpm --filter @hbm/scene sweep --game "<install folder or HitmanBloodMoney.exe>"

const BUDGET_SCENE = 'M06/M06_main';
const BUDGET_SECONDS = 8;
const PACKED_SCENE = 'M03/M03_main';

const { values } = parseArgs({ options: { game: { type: 'string' } } });
const gameDir = resolveGameDir(values.game ?? process.env.HBM_GAME_DIR);
if (!gameDir) {
  console.error('Point the sweep at your game: --game "D:\\Games\\Hitman Blood Money" (or set HBM_GAME_DIR).');
  process.exit(2);
}

const exe = path.join(gameDir, 'HitmanBloodMoney.exe');
const exeImage = existsSync(exe) ? new PeImage(new Uint8Array(await readFile(exe))) : null;
const registry: ClassRegistry | undefined = exeImage ? resolveClassRegistry(exeImage) : undefined;
const schemas = exeImage ? resolveSchemas(exeImage) : null;
const binding = { bound: 0, withTail: 0, mismatched: 0, noSchema: 0 };
const tailClasses = new Set<string>();
const noSchemaClasses = new Set<string>();

const scenesDir = path.join(gameDir, 'Scenes');
const zips = (await readdir(scenesDir, { recursive: true })).filter((f) => /\.zip$/i.test(f)).sort();

const failures: string[] = [];
const kinds: Record<NodeKind, number> = { room: 0, group: 0, light: 0, camera: 0, mesh: 0, other: 0 };
const hidden: Record<HiddenReason | 'visible', number> = { placeholder: 0, collision: 0, bounds: 0, shadow: 0, helper: 0, visible: 0 };
let nodes = 0;
let placedRoots = 0;
let parts = 0;
let triangles = 0;
let unshaded = 0;
const animations = { files: 0, clips: 0, humanState: 0 };
const skin = { skeletons: 0, composed: 0, notComposed: 0, badPalettes: 0, vertices: 0, outsidePalette: 0, distance: 0 };

for (const relative of zips) {
  const scene = relative.replace(/\\/g, '/').replace(/\.zip$/i, '');
  const source = await openFileSource(path.join(scenesDir, relative));
  const started = performance.now();
  try {
    const archive = await SceneArchive.open({
      source,
      sceneFileName: `Scenes\\${relative.replace(/\//g, '\\')}`,
      codec: nodeCodec,
    });
    const [gms, buf, prp, prm, mat] = await Promise.all([archive.gms(), archive.buf(), archive.prp(), archive.prm(), archive.mat()]);
    const graph = buildSceneGraph({ gms, buf, prp, prm, registry });
    const graphSeconds = (performance.now() - started) / 1000;
    if (graph.problems.length) failures.push(`${scene}: ${graph.problems[0]}`);
    if (scene === BUDGET_SCENE) {
      console.log(`${scene}: graph and placements for ${graph.nodes.length} geoms in ${graphSeconds.toFixed(2)} s`);
      if (graphSeconds > BUDGET_SECONDS) failures.push(`${scene} took ${graphSeconds.toFixed(1)} s, over the ${BUDGET_SECONDS} s budget`);
    }

    nodes += graph.nodes.length;
    for (const n of graph.nodes) kinds[n.kind]++;

    const anm = await archive.anm();
    if (anm) {
      animations.files++;
      animations.clips += anm.clips.length;
      animations.humanState += anm.clips.filter((c) => c.mask & CLIP_HUMAN_STATE).length;
      for (const p of anm.problems) failures.push(`${scene} animations: ${p}`);
      if (anm.clips.some((c) => c.boneIds.some((id) => id !== ROOT_TRACK_BONE && id >= anm.boneNames.length))) {
        failures.push(`${scene} animations: a clip names a bone past the bone name table`);
      }
      if (scene === PACKED_SCENE) {
        const first = anm.clips[0];
        console.log(`${scene}: ${anm.clips.length} clips, ${anm.boneNames.length} bones, ${anm.poseNames.length} poses; clip 0 ${first?.name} (${first?.frames} frames)`);
        if (anm.clips.length !== 905 || anm.boneNames.length !== 223 || anm.poseNames.length !== 66) failures.push(`${scene}: animation counts differ from anm.md`);
      }
    }

    // Every geom and controller record binds to its class's property chain from the executable.
    if (schemas && prp.tree.nodes.length - 1 === gms.geoms.length) {
      for (const n of graph.nodes) {
        const props = bindNodeProperties(prp, n.index, n.className, schemas);
        if (!props) continue;
        const records = [{ label: n.className ?? `type ${n.typeId}`, ...props.node }, ...props.controllers.map((c) => ({ label: c.name, ...c }))];
        for (const r of records) {
          if (!r.bound) {
            binding.noSchema++;
            noSchemaClasses.add(r.label);
          } else if (r.bound.mismatch) {
            binding.mismatched++;
            failures.push(`${scene} node ${n.index} ${r.label}: property ${r.bound.mismatch.index} expected ${r.bound.mismatch.expected}, found ${r.bound.mismatch.found}`);
          } else if (r.bound.tail.length) {
            binding.withTail++;
            tailClasses.add(r.label);
          } else {
            binding.bound++;
          }
        }
      }
    }

    const surfaces = new Map<number, Surface>();
    const surfaceFor = (slot: number) => {
      let s = surfaces.get(slot);
      if (!s) {
        const material = mat.bySlot.get(slot);
        if (!material) return null;
        s = describeSurface(mat, material);
        surfaces.set(slot, s);
      }
      return s;
    };

    const roots = [...new Set(graph.nodes.map((n) => n.meshRoot).filter(Boolean))];
    placedRoots += roots.length;
    const scenePartsByRoot = new Map<number, ReturnType<typeof meshParts>>();
    for (const root of roots) {
      const rootParts = meshParts(prm, mat, root);
      scenePartsByRoot.set(root, rootParts);

      // Skinned models: a skeleton whose bind matrices compose, and blend data that addresses it.
      const skinned = rootParts.filter((p) => p.weighted || p.subMesh.mesh.object.subType === PRIM_SUBTYPE_RIGID);
      if (skinned.length) {
        const skeleton = readSkeleton(prm, root);
        if (!skeleton) {
          failures.push(`${scene} root ${root}: skinned parts but no skeleton`);
        } else {
          skin.skeletons++;
          for (const bone of skeleton.bones) {
            const parent = skeleton.bones[bone.parent];
            if (!parent || !bone.local.length) continue;
            const composed = composeTransforms(parent.global, bone.local);
            if (composed.every((x, i) => Math.abs(x - bone.global[i]!) < 2e-2)) skin.composed++;
            else skin.notComposed++;
          }
          for (const part of skinned) {
            const palette = prm.bonePalette(part.subMesh.mesh);
            if (palette.some((b) => !Number.isInteger(b) || b >= skeleton.bones.length)) skin.badPalettes++;
            if (part.stride !== 52) continue;
            const v = decodeVertices(prm.vertexBytes(part.subMesh, 52), part.vertexCount, VERTEX_LAYOUTS[52]);
            for (let i = 0; i < part.vertexCount; i++) {
              skin.vertices++;
              let best = 0;
              for (let k = 1; k < 4; k++) if (v.blendWeights![i * 4 + k]! > v.blendWeights![i * 4 + best]!) best = k;
              const bone = skeleton.bones[palette[v.blendIndices![i * 4 + best]!] ?? -1];
              if (!bone) {
                skin.outsidePalette++;
                continue;
              }
              skin.distance += Math.hypot(
                v.positions[i * 3]! - bone.global[9]!,
                v.positions[i * 3 + 1]! - bone.global[10]!,
                v.positions[i * 3 + 2]! - bone.global[11]!,
              );
            }
          }
        }
      }
      for (const part of rootParts) {
        parts++;
        triangles += part.triangleCount;
        const surface = surfaceFor(part.materialSlot);
        if (!surface || part.stride === null) {
          unshaded++;
          continue;
        }
        hidden[partHiddenReason(surface, part.drawMode) ?? 'visible']++;
      }
    }

    if (scene === PACKED_SCENE) {
      const all = [...scenePartsByRoot.values()].flat();
      const packStarted = performance.now();
      const bytes = encodeMeshPack(prm, all);
      const pack = decodeMeshPack(bytes);
      const vertices = pack.parts.reduce((n, p) => n + p.vertexCount, 0);
      console.log(
        `${scene}: mesh pack of ${pack.parts.length} parts, ${vertices} vertices, ${(bytes.length / 1048576).toFixed(1)} MB in ${((performance.now() - packStarted) / 1000).toFixed(2)} s`,
      );
      if (pack.parts.length !== all.filter((p) => p.stride !== null).length) failures.push(`${scene}: mesh pack lost parts`);
      const last = pack.parts[pack.parts.length - 1];
      if (last && last.index[0] + last.index[1] * 2 > pack.body.length) failures.push(`${scene}: mesh pack body is truncated`);
    }
  } catch (err) {
    failures.push(`${scene}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await source.close();
  }
}

console.log('');
console.log(`scenes          ${zips.length}`);
console.log(`nodes           ${nodes}  ${JSON.stringify(kinds)}${registry ? '' : ' (no executable: kinds from type-id families)'}`);
console.log(`placed roots    ${placedRoots}; parts ${parts}; triangles ${triangles}`);
console.log(`parts by hidden reason ${JSON.stringify(hidden)}; without a known layout or material ${unshaded}`);
console.log(
  `skeletons       ${skin.skeletons} for placed skinned roots; bind matrices compose on ${skin.composed} bones (${skin.notComposed} don't); ` +
    `${skin.vertices} skinned vertices, mean ${(skin.distance / Math.max(1, skin.vertices)).toFixed(1)} from their main bone`,
);
console.log(`animations      ${animations.files} files, ${animations.clips} clips (${animations.humanState} human-state)`);
if (skin.notComposed) failures.push(`${skin.notComposed} bones' bind matrices don't compose with their parents'`);
if (skin.badPalettes) failures.push(`${skin.badPalettes} bone palettes name bones the skeleton doesn't have`);
if (skin.outsidePalette) failures.push(`${skin.outsidePalette} skinned vertices point outside their palette`);
if (schemas) {
  console.log(
    `PRP records     ${binding.bound} bound; ${binding.withTail} with class-specific tails (${[...tailClasses].join(', ')}); ` +
      `${binding.mismatched} mismatched; ${binding.noSchema} without a schema${noSchemaClasses.size ? ` (${[...noSchemaClasses].join(', ')})` : ''}`,
  );
  // Only ScriptC is known to append its own data after the reflected properties.
  for (const c of tailClasses) if (c !== 'ScriptC') failures.push(`${c} records have unexplained trailing tokens`);
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed:`);
  for (const f of failures.slice(0, 30)) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
