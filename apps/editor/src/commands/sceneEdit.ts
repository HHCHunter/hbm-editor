import { castDraft, produce, type Draft } from 'immer';
import type { SceneObject } from '../scene/types';
import { useEditor, type EditorState } from '../state/store';
import type { Command } from './Command';

/**
 * Swap the whole object list between two snapshots. Immer shares every untouched object between
 * the two lists, so keeping both only costs the objects that actually changed.
 */
export function sceneEdit(
  label: string,
  before: readonly SceneObject[],
  after: readonly SceneObject[],
): Command {
  const swapTo = (s: Draft<EditorState>, objects: readonly SceneObject[]) => {
    s.objects = castDraft(objects as SceneObject[]);
    const alive = new Set(objects.map((o) => o.id));
    s.sel = s.sel.filter((id) => alive.has(id));
  };
  return {
    label,
    apply: (s) => swapTo(s, after),
    revert: (s) => swapTo(s, before),
  };
}

/** Apply `recipe` to the object list as one undoable step. Returns false if nothing changed. */
export function editObjects(label: string, recipe: (objects: Draft<SceneObject[]>) => void): boolean {
  const { objects, run } = useEditor.getState();
  const next = produce(objects, recipe);
  if (next === objects) return false;
  run(sceneEdit(label, objects, next));
  return true;
}
