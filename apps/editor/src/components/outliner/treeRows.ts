import type { SceneNodeDTO } from '@hbm/protocol';
import { nodeLabel } from '../../scene/sceneModel';

export interface TreeRow {
  index: number;
  label: string;
  depth: number;
  kind: SceneNodeDTO['kind'];
  hasChildren: boolean;
  expanded: boolean;
}

export interface TreeInput {
  nodes: readonly SceneNodeDTO[];
  /** Child indices by parent index + 1. */
  children: readonly (readonly number[])[];
  expanded: Readonly<Record<number, boolean>>;
  search: string;
  sorting: 'Alpha' | 'None';
}

/**
 * The outliner's visible rows, in display order. With a search, only nodes whose name or subtree
 * matches are listed, and every ancestor of a match is opened.
 */
export function buildTreeRows({ nodes, children, expanded, search, sorting }: TreeInput): TreeRow[] {
  const query = search.trim().toLowerCase();
  const labels = nodes.map(nodeLabel);

  // Nodes are pre-order, so walking backwards decides every child before its parent.
  let matches: Uint8Array | null = null;
  if (query) {
    matches = new Uint8Array(nodes.length);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!;
      if (!matches[i] && (labels[i]!.toLowerCase().includes(query) || node.name.toLowerCase().includes(query))) matches[i] = 1;
      if (matches[i] && node.parent >= 0) matches[node.parent] = 1;
    }
  }

  const rows: TreeRow[] = [];
  const walk = (parent: number) => {
    let kids = children[parent + 1] ?? [];
    if (sorting === 'Alpha') kids = [...kids].sort((a, b) => labels[a]!.localeCompare(labels[b]!));
    for (const index of kids) {
      if (matches && !matches[index]) continue;
      const node = nodes[index]!;
      const hasChildren = (children[index + 1]?.length ?? 0) > 0;
      const open = hasChildren && (!!expanded[index] || !!matches);
      rows.push({ index, label: labels[index]!, depth: node.depth, kind: node.kind, hasChildren, expanded: open });
      if (open) walk(index);
    }
  };
  walk(-1);
  return rows;
}
