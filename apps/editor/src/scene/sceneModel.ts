import type { SceneGraphDTO, SceneNodeDTO } from '@hbm/protocol';
import { leafName } from '@hbm/scene';

export const TRANSFORM = 12;

/** Child indices by parent index + 1, in scene order. */
export function childIndex(graph: SceneGraphDTO): number[][] {
  const children: number[][] = Array.from({ length: graph.nodes.length + 1 }, () => []);
  for (const node of graph.nodes) children[node.parent + 1]!.push(node.index);
  return children;
}

/** The short name shown in lists: the last '!' segment, or the class for unnamed nodes. */
export function nodeLabel(node: SceneNodeDTO): string {
  return leafName(node.name) || `(${node.className ?? node.kind})`;
}

export function nodePosition(transforms: Float32Array, index: number): [number, number, number] {
  const o = index * TRANSFORM;
  return [transforms[o + 9]!, transforms[o + 10]!, transforms[o + 11]!];
}

/**
 * Whether each node is hidden once its ancestors are taken into account. Nodes are stored in
 * pre-order, so a parent is always decided before its children.
 */
export function effectiveFlags(nodes: readonly SceneNodeDTO[], flags: Readonly<Record<number, boolean>>): Uint8Array {
  const out = new Uint8Array(nodes.length);
  for (const node of nodes) {
    out[node.index] = flags[node.index] || (node.parent >= 0 && out[node.parent]) ? 1 : 0;
  }
  return out;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Bounds of the given nodes' positions, or null when there are none. */
export function positionBounds(transforms: Float32Array, indices: Iterable<number>): Bounds | null {
  let found = false;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const i of indices) {
    const p = nodePosition(transforms, i);
    if (!p.every(Number.isFinite)) continue;
    found = true;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  }
  return found ? { min, max } : null;
}

/** Positions of placed models, which describe where a level actually is better than markers do. */
export function meshNodeIndices(graph: SceneGraphDTO): number[] {
  const meshes = graph.nodes.filter((n) => n.meshRoot).map((n) => n.index);
  return meshes.length ? meshes : graph.nodes.map((n) => n.index);
}
