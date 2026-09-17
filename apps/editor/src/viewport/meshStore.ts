import type { MeshPackPart } from '@hbm/scene';
import { getMeshPack } from '../api/endpoints';

/** One decoded submesh, ready to become a three.js geometry. Positions are engine coordinates. */
export interface MeshPartData {
  root: number;
  object: number;
  materialSlot: number;
  lodMask: number;
  variantId: number;
  drawMode: number;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  colors: Uint8Array;
  indices: Uint16Array;
}

const BATCH = 64;
const CONCURRENCY = 3;

let current: { sceneId: string; byRoot: Map<number, MeshPartData[]> } | null = null;

export function meshPartsOf(sceneId: string, root: number): MeshPartData[] | null {
  return current?.sceneId === sceneId ? (current.byRoot.get(root) ?? null) : null;
}

/**
 * Put indices in the order where each triangle's corners turn counter-clockwise about its stored
 * normals, by majority. The engine's own winding convention isn't recovered yet; the normals are.
 */
export function orientTriangles(positions: Float32Array, normals: Float32Array | null, indices: Uint16Array): Uint16Array {
  if (!normals || indices.length < 3) return indices;
  let agree = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]! * 3;
    const b = indices[t + 1]! * 3;
    const c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = normals[a]! + normals[b]! + normals[c]!;
    const ny = normals[a + 1]! + normals[b + 1]! + normals[c + 1]!;
    const nz = normals[a + 2]! + normals[b + 2]! + normals[c + 2]!;
    const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (d > 0) agree++;
    else if (d < 0) agree--;
  }
  if (agree >= 0) return indices;
  const flipped = new Uint16Array(indices.length);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    flipped[t] = indices[t]!;
    flipped[t + 1] = indices[t + 2]!;
    flipped[t + 2] = indices[t + 1]!;
  }
  return flipped;
}

function partData(part: MeshPackPart, body: Uint8Array): MeshPartData {
  const buffer = body.buffer;
  const base = body.byteOffset;
  const f32 = ([offset, count]: [number, number], size: number) => new Float32Array(buffer, base + offset, count * size);
  const positions = f32(part.position, 3);
  const normals = part.normal ? f32(part.normal, 3) : null;
  return {
    root: part.root,
    object: part.object,
    materialSlot: part.materialSlot,
    lodMask: part.lodMask,
    variantId: part.variantId,
    drawMode: part.drawMode,
    positions,
    normals,
    uvs: part.uv ? f32(part.uv, 2) : null,
    colors: new Uint8Array(buffer, base + part.color[0], part.color[1] * 4),
    indices: orientTriangles(positions, normals, new Uint16Array(buffer, base + part.index[0], part.index[1])),
  };
}

export interface MeshLoad {
  cancel(): void;
}

/**
 * Fetch every model root the scene places, a batch at a time. `onBatch` receives each batch's
 * roots once their parts are stored; `onBatchError` receives a batch that couldn't be read, whose
 * roots stay without parts. Both report how many roots are done, read or not, so progress always
 * reaches the total and one bad batch doesn't stop the others.
 */
export function loadSceneMeshes(
  sceneId: string,
  roots: readonly number[],
  onBatch: (roots: number[], done: number) => void,
  onBatchError: (roots: number[], err: unknown, done: number) => void,
): MeshLoad {
  const byRoot = new Map<number, MeshPartData[]>();
  current = { sceneId, byRoot };
  const abort = new AbortController();

  const batches: number[][] = [];
  for (let i = 0; i < roots.length; i += BATCH) batches.push(roots.slice(i, i + BATCH));
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < batches.length && !abort.signal.aborted) {
      const batch = batches[next++]!;
      let failure: { err: unknown } | null = null;
      try {
        const pack = await getMeshPack(sceneId, batch, abort.signal);
        const parts = new Map<number, MeshPartData[]>(batch.map((root) => [root, []]));
        for (const part of pack.parts) parts.get(part.root)?.push(partData(part, pack.body));
        if (!abort.signal.aborted) for (const [root, list] of parts) byRoot.set(root, list);
      } catch (err) {
        failure = { err };
      }
      if (abort.signal.aborted) return;
      done += batch.length;
      if (failure) onBatchError(batch, failure.err, done);
      else onBatch(batch, done);
    }
  };
  for (let i = 0; i < CONCURRENCY; i++) void worker();

  return { cancel: () => abort.abort() };
}
