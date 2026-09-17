import type { SceneObject } from './types';

export interface SceneIndex {
  byId: ReadonlyMap<string, SceneObject>;
  children: ReadonlyMap<string, readonly SceneObject[]>;
}

const EMPTY: readonly SceneObject[] = [];
const cache = new WeakMap<readonly SceneObject[], SceneIndex>();

/** Id and parent→children lookups. The object list is immutable, so the index is cached per list. */
export function sceneIndex(objects: readonly SceneObject[]): SceneIndex {
  const hit = cache.get(objects);
  if (hit) return hit;
  const byId = new Map<string, SceneObject>();
  const children = new Map<string, SceneObject[]>();
  for (const o of objects) {
    byId.set(o.id, o);
    const list = children.get(o.parent);
    if (list) list.push(o);
    else children.set(o.parent, [o]);
  }
  const index: SceneIndex = { byId, children };
  cache.set(objects, index);
  return index;
}

export function childrenOf(index: SceneIndex, id: string): readonly SceneObject[] {
  return index.children.get(id) ?? EMPTY;
}

export function descendantIds(index: SceneIndex, id: string): string[] {
  const out: string[] = [];
  const stack = [...childrenOf(index, id)];
  while (stack.length) {
    const o = stack.pop()!;
    out.push(o.id);
    stack.push(...childrenOf(index, o.id));
  }
  return out;
}

/** False if the object or any of its ancestors is hidden. */
export function isVisible(index: SceneIndex, obj: SceneObject): boolean {
  for (let cur: SceneObject | undefined = obj; cur; cur = index.byId.get(cur.parent)) {
    if (cur.hidden) return false;
  }
  return true;
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value != null;
}
