import { editObjects } from '../commands/sceneEdit';
import { childrenOf, descendantIds, isDefined, sceneIndex } from '../scene/sceneIndex';
import { ROOT_ID, type Vec3 } from '../scene/types';
import {
  DEFAULT_CAMERA,
  VIEW_FLAG_TITLES,
  useEditor,
  type CameraState,
  type ViewFlag,
} from './store';

const store = () => useEditor.getState();

/** The property grid shows positions and sizes ×10, as the original editor did. */
export const DISPLAY_SCALE = 10;

export function formatNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function formatVec(v: Vec3): string {
  return [v.x, v.y, v.z].map((n) => formatNumber(n * DISPLAY_SCALE)).join(', ');
}

export function setStatus(msg: string): void {
  store().status(msg);
}

// ---------------------------------------------------------------- selection

export function selectObject(id: string, additive: boolean): void {
  const { sel, objects, update } = store();
  const obj = sceneIndex(objects).byId.get(id);
  if (!obj) return;
  const next = additive ? (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]) : [id];
  update((s) => {
    s.sel = next;
    s.statusMsg = `Selected ${obj.name}`;
  });
}

export function clearSelection(message = 'Select none'): void {
  store().update((s) => {
    s.sel = [];
    s.statusMsg = message;
  });
}

export function selectAll(): void {
  store().update((s) => {
    s.sel = s.objects.filter((o) => o.id !== ROOT_ID).map((o) => o.id);
    s.statusMsg = 'Select all';
  });
}

export function invertSelection(): void {
  store().update((s) => {
    const current = new Set(s.sel);
    s.sel = s.objects.filter((o) => o.id !== ROOT_ID && !current.has(o.id)).map((o) => o.id);
    s.statusMsg = 'Invert selection';
  });
}

/** Select the row after the current selection, in outliner order. */
export function selectNext(orderedIds: readonly string[]): void {
  if (!orderedIds.length) return;
  const i = orderedIds.indexOf(store().sel[0] ?? '');
  selectObject(orderedIds[(i + 1) % orderedIds.length]!, false);
}

export function pickFromViewport(hitId: string | null, additive: boolean): void {
  if (!hitId) {
    clearSelection('Selection cleared');
    return;
  }
  const { objects, selMode } = store();
  const index = sceneIndex(objects);
  let obj = index.byId.get(hitId);
  if (selMode === 'Group') {
    // Climb to the outermost group in an unbroken chain of groups.
    for (let parent = obj && index.byId.get(obj.parent); parent?.cls === 'ZGROUP'; parent = index.byId.get(parent.parent)) {
      obj = parent;
    }
  }
  if (obj) selectObject(obj.id, additive);
}

// ---------------------------------------------------------------- camera and view

export function setCamera(cam: CameraState): void {
  store().update((s) => {
    s.cam = cam;
  });
}

export function resetCamera(message: string): void {
  store().update((s) => {
    s.cam = { ...DEFAULT_CAMERA };
    s.statusMsg = message;
  });
}

export function zoomSelected(): void {
  const { sel, objects, update } = store();
  const index = sceneIndex(objects);
  const picked = sel.map((id) => index.byId.get(id)).filter(isDefined);
  if (!picked.length) {
    setStatus('Nothing selected');
    return;
  }
  const n = picked.length;
  const centre = picked.reduce((c, o) => ({ x: c.x + o.pos.x / n, y: c.y + o.pos.y / n, z: c.z + o.pos.z / n }), {
    x: 0,
    y: 0,
    z: 0,
  });
  const span = picked.reduce((m, o) => Math.max(m, o.size ? Math.max(o.size.x, o.size.y, o.size.z) : 4), 4);
  update((s) => {
    s.cam = { ...s.cam, tx: centre.x, ty: centre.y, tz: centre.z, dist: Math.max(8, span * 4) };
    s.statusMsg = 'Zoom to selection';
  });
}

const VIEW_PRESETS: Partial<Record<ViewFlag, Pick<CameraState, 'yaw' | 'pitch'>>> = {
  T: { pitch: 1.4, yaw: 0.01 },
  B: { pitch: -1.4, yaw: 0.01 },
  L: { pitch: 0.05, yaw: -1.57 },
  R: { pitch: 0.05, yaw: 1.57 },
};

export function toggleViewFlag(flag: ViewFlag): void {
  const title = VIEW_FLAG_TITLES[flag];
  store().update((s) => {
    const on = !s.view[flag];
    s.view[flag] = on;
    const preset = VIEW_PRESETS[flag];
    if (preset && on) {
      s.cam = { ...s.cam, ...preset };
      for (const other of ['T', 'B', 'L', 'R'] as const) {
        if (other !== flag) s.view[other] = false;
      }
      s.statusMsg = `${title} view`;
      return;
    }
    s.statusMsg = `${title} ${on ? 'on' : 'off'}`;
  });
}

// ---------------------------------------------------------------- outliner

export function toggleExpanded(id: string): void {
  store().update((s) => {
    if (s.collapsed[id]) delete s.collapsed[id];
    else s.collapsed[id] = true;
  });
}

export function setAllExpanded(expanded: boolean): void {
  const index = sceneIndex(store().objects);
  store().update((s) => {
    s.collapsed = {};
    if (!expanded) {
      for (const o of s.objects) {
        if (o.id !== ROOT_ID && childrenOf(index, o.id).length) s.collapsed[o.id] = true;
      }
    }
    s.statusMsg = expanded ? 'Expand all' : 'Collapse all';
  });
}

// ---------------------------------------------------------------- undoable edits

export function toggleHideSelection(): void {
  const ids = new Set(store().sel);
  if (!ids.size) return setStatus('Nothing selected');
  editObjects(`Toggle hide (${ids.size})`, (objects) => {
    for (const o of objects) if (ids.has(o.id)) o.hidden = !o.hidden;
  });
}

export function toggleFreezeSelection(): void {
  const ids = new Set(store().sel);
  if (!ids.size) return setStatus('Nothing selected');
  editObjects(`Toggle freeze (${ids.size})`, (objects) => {
    for (const o of objects) if (ids.has(o.id)) o.frozen = !o.frozen;
  });
}

export function renameObject(id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    setStatus("A name can't be empty");
    return false;
  }
  editObjects(`Rename to ${trimmed}`, (objects) => {
    const o = objects.find((x) => x.id === id);
    if (o) o.name = trimmed;
  });
  return true;
}

export function setPositionFromText(id: string, text: string): boolean {
  const parts = text.split(',').map((p) => Number.parseFloat(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    setStatus('Position needs three numbers: x, y, z');
    return false;
  }
  const [x, y, z] = parts.map((n) => n / DISPLAY_SCALE) as [number, number, number];
  editObjects('Move', (objects) => {
    const o = objects.find((obj) => obj.id === id);
    if (o && (o.pos.x !== x || o.pos.y !== y || o.pos.z !== z)) o.pos = { x, y, z };
  });
  return true;
}

export function setLightValue(id: string, key: 'intensity' | 'radius', text: string): boolean {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value)) {
    setStatus(`Light ${key} needs a number`);
    return false;
  }
  const clamped = key === 'intensity' ? Math.max(0, value) : Math.max(0.5, value);
  editObjects(`Light ${key}`, (objects) => {
    const light = objects.find((o) => o.id === id)?.light;
    if (light) light[key] = clamped;
  });
  return true;
}

export function setBoundingBox(id: string, value: string): void {
  editObjects(`BoundingBox ${value}`, (objects) => {
    const o = objects.find((x) => x.id === id);
    if (o) o.frozen = value === 'FROZEN';
  });
}

export function toggleInactive(id: string): void {
  editObjects('bInactive', (objects) => {
    const o = objects.find((x) => x.id === id);
    if (o) o.inactive = !o.inactive;
  });
}

export function deleteSelection(): void {
  const { sel, objects } = store();
  const ids = sel.filter((id) => id !== ROOT_ID);
  if (!ids.length) return setStatus('Nothing selected');
  const index = sceneIndex(objects);
  const doomed = new Set<string>();
  for (const id of ids) {
    doomed.add(id);
    for (const d of descendantIds(index, id)) doomed.add(d);
  }
  editObjects(`Delete ${doomed.size} object(s)`, (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (doomed.has(list[i]!.id)) list.splice(i, 1);
    }
  });
}

export function groupSelection(): void {
  const { sel, objects, update } = store();
  const ids = sel.filter((id) => id !== ROOT_ID);
  if (ids.length < 2) return setStatus('Select at least two objects to group');
  const index = sceneIndex(objects);
  const first = index.byId.get(ids[0]!);
  if (!first) return;

  // Grouping an object together with one of its own ancestors would detach that subtree.
  const selected = new Set(ids);
  const nested = ids.some((id) => {
    for (let p = index.byId.get(id)?.parent; p; p = index.byId.get(p)?.parent) {
      if (selected.has(p)) return true;
    }
    return false;
  });
  if (nested) return setStatus("Can't group an object together with one of its parents");

  const groupId = `group-${Date.now()}`;
  const changed = editObjects(`Group ${ids.length} object(s)`, (list) => {
    for (const o of list) if (selected.has(o.id)) o.parent = groupId;
    list.push({
      id: groupId,
      name: `NewGroup_${objects.length}`,
      cls: 'ZGROUP',
      parent: first.parent,
      pos: { ...first.pos },
      size: null,
      tint: '#888888',
      wire: null,
      light: null,
      hidden: false,
      frozen: false,
      inactive: false,
    });
  });
  if (changed) {
    update((s) => {
      s.sel = [groupId];
    });
  }
}

// ---------------------------------------------------------------- menus

const UNAVAILABLE_MESSAGES: Record<string, string> = {
  'Open Scene…': 'Opening game scenes arrives in M1. This is the mock scene.',
  'Save Scene': "Saving scenes isn't supported yet. Mock scene edits stay in memory.",
  Exit: 'Close this tab and the launcher window to exit.',
};

export function runMenuCommand(name: string): void {
  const s = store();
  switch (name) {
    case 'Undo':
      return s.undo();
    case 'Redo':
      return s.redo();
    case 'Wireframe':
      return toggleViewFlag('W');
    case 'Lighting':
      return toggleViewFlag('Li');
    case 'Fog':
      return toggleViewFlag('F');
    case 'Grid':
      return toggleViewFlag('G');
    case 'Zoom Extents':
      return resetCamera('Zoom extents: all');
    case 'Delete Selection':
      return deleteSelection();
    case 'Group Selection':
      return groupSelection();
    default:
      setStatus(UNAVAILABLE_MESSAGES[name] ?? `${name.replace(/…$/, '')} isn't available yet`);
  }
}
