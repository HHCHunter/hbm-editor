import { childrenOf, sceneIndex } from '../../scene/sceneIndex';
import { ROOT_ID, type ObjectClass, type SceneObject } from '../../scene/types';

export interface TreeRow {
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  cls: ObjectClass;
  hidden: boolean;
  frozen: boolean;
  selected: boolean;
  isRoot: boolean;
}

/**
 * The outliner's visible rows, in display order. With a search, only objects whose name or
 * subtree matches are listed, and groups are opened so every match is reachable.
 */
export function buildTreeRows(
  objects: readonly SceneObject[],
  sel: readonly string[],
  collapsed: Readonly<Record<string, boolean>>,
  search: string,
  sorting: 'Alpha' | 'None',
): TreeRow[] {
  const index = sceneIndex(objects);
  const query = search.trim().toLowerCase();
  const selected = new Set(sel);

  const subtreeMatch = new Map<string, boolean>();
  const matches = (o: SceneObject): boolean => {
    const cached = subtreeMatch.get(o.id);
    if (cached !== undefined) return cached;
    const hit =
      o.name.toLowerCase().includes(query) || childrenOf(index, o.id).some((c) => matches(c));
    subtreeMatch.set(o.id, hit);
    return hit;
  };

  const rows: TreeRow[] = [
    {
      id: ROOT_ID,
      name: index.byId.get(ROOT_ID)?.name ?? 'Objects',
      depth: 0,
      hasChildren: true,
      expanded: true,
      cls: '',
      hidden: false,
      frozen: false,
      selected: false,
      isRoot: true,
    },
  ];

  const walk = (parentId: string, depth: number) => {
    let kids = childrenOf(index, parentId);
    if (sorting === 'Alpha') kids = [...kids].sort((a, b) => a.name.localeCompare(b.name));
    for (const o of kids) {
      if (query && !matches(o)) continue;
      const hasChildren = childrenOf(index, o.id).length > 0;
      const expanded = !collapsed[o.id];
      rows.push({
        id: o.id,
        name: o.name,
        depth,
        hasChildren,
        expanded,
        cls: o.cls,
        hidden: o.hidden,
        frozen: o.frozen,
        selected: selected.has(o.id),
        isRoot: false,
      });
      if (hasChildren && (expanded || query)) walk(o.id, depth + 1);
    }
  };
  walk(ROOT_ID, 1);

  return rows;
}
