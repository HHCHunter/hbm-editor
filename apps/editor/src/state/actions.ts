import type { HiddenReasonDTO } from '@hbm/protocol';
import { meshNodeIndices, positionBounds } from '../scene/sceneModel';
import { frame } from '../viewport/camera';
import { DEFAULT_CAMERA, VIEW_FLAG_TITLES, useEditor, type BrowserTab, type CameraState, type DialogName, type SelMode, type ViewFlag } from './store';

const store = () => useEditor.getState();

export function setStatus(msg: string): void {
  store().status(msg);
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(6)));
}

// ---------------------------------------------------------------- dialogs and tabs

export function openDialog(dialog: DialogName | null): void {
  store().update((s) => {
    s.dialog = dialog;
  });
}

/** Show a browser in the panel under the viewport. */
export function showBrowser(tab: BrowserTab): void {
  store().update((s) => {
    s.browser = tab;
  });
}

/** Let the browser panel fill the centre, or give the viewport back. */
export function setBrowserMaximised(maximised: boolean): void {
  store().update((s) => {
    s.browserMaximised = maximised;
  });
}

/** Show a texture in the Textures tab. */
export function showTexture(id: number): void {
  store().update((s) => {
    s.textureId = id;
    s.browser = 'textures';
  });
}

/** Show a material in the Materials tab. */
export function showMaterial(slot: number): void {
  store().update((s) => {
    s.materialSlot = slot;
    s.browser = 'materials';
  });
}

// ---------------------------------------------------------------- selection

/** Open every ancestor of a node so its outliner row exists. */
function expandAncestors(s: { scene: { graph: { nodes: { parent: number }[] } } | null; expanded: Record<number, boolean> }, index: number) {
  const nodes = s.scene?.graph.nodes;
  if (!nodes) return;
  for (let p = nodes[index]?.parent ?? -1; p >= 0; p = nodes[p]!.parent) s.expanded[p] = true;
}

export function selectNode(index: number, additive: boolean, reveal = false): void {
  const { scene, sel } = store();
  const node = scene?.graph.nodes[index];
  if (!node) return;
  const next = additive ? (sel.includes(index) ? sel.filter((i) => i !== index) : [...sel, index]) : [index];
  store().update((s) => {
    s.sel = next;
    if (reveal) expandAncestors(s, index);
    s.statusMsg = `Selected ${node.name || node.className || `node ${index}`}`;
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
    s.sel = s.scene ? s.scene.graph.nodes.map((n) => n.index) : [];
    s.statusMsg = 'Select all';
  });
}

export function invertSelection(): void {
  store().update((s) => {
    const current = new Set(s.sel);
    s.sel = s.scene ? s.scene.graph.nodes.map((n) => n.index).filter((i) => !current.has(i)) : [];
    s.statusMsg = 'Invert selection';
  });
}

/** Select every row from `anchor` to `index`, in outliner order. */
export function selectRange(orderedIndices: readonly number[], anchor: number, index: number): void {
  const a = orderedIndices.indexOf(anchor);
  const b = orderedIndices.indexOf(index);
  if (a < 0 || b < 0) return selectNode(index, false);
  const range = orderedIndices.slice(Math.min(a, b), Math.max(a, b) + 1);
  store().update((s) => {
    s.sel = [anchor, ...range.filter((i) => i !== anchor)];
    s.statusMsg = `${range.length} objects selected`;
  });
}

export function pickFromViewport(index: number | null, additive: boolean): void {
  if (index === null) {
    clearSelection('Selection cleared');
    return;
  }
  const { scene, selMode } = store();
  const nodes = scene?.graph.nodes;
  if (!nodes?.[index]) return;
  let picked = index;
  if (selMode === 'Group') {
    // Climb to the outermost group or room in an unbroken chain of them.
    for (let p = nodes[picked]!.parent; p >= 0 && (nodes[p]!.kind === 'group' || nodes[p]!.kind === 'room'); p = nodes[p]!.parent) {
      picked = p;
    }
  }
  selectNode(picked, additive, true);
}

// ---------------------------------------------------------------- camera and view

export function setCamera(cam: CameraState): void {
  store().update((s) => {
    s.cam = cam;
  });
}

/** Frame the whole scene. */
export function zoomExtents(): void {
  const { scene, cam } = store();
  if (!scene) return;
  const bounds = positionBounds(scene.transforms, meshNodeIndices(scene.graph));
  store().update((s) => {
    s.cam = bounds ? frame(cam, bounds) : { ...DEFAULT_CAMERA };
    s.statusMsg = 'Frame all';
  });
}

export function zoomSelected(): void {
  const { scene, sel, cam } = store();
  const bounds = scene && positionBounds(scene.transforms, sel);
  if (!bounds) return setStatus('Nothing selected');
  store().update((s) => {
    s.cam = frame(cam, bounds, 300);
    s.statusMsg = 'Frame selected';
  });
}

export const VIEW_ANGLES = {
  Top: { pitch: 1.4, yaw: 0.01 },
  Bottom: { pitch: -1.4, yaw: 0.01 },
  Left: { pitch: 0.05, yaw: -1.57 },
  Right: { pitch: 0.05, yaw: 1.57 },
} as const satisfies Record<string, Pick<CameraState, 'yaw' | 'pitch'>>;

/** Turn the camera to look from one side, keeping what it looks at and how far away it is. */
export function viewFrom(side: keyof typeof VIEW_ANGLES): void {
  store().update((s) => {
    s.cam = { ...s.cam, ...VIEW_ANGLES[side] };
    s.statusMsg = `${side} view`;
  });
}

/** Look from the default angle again, keeping what the camera looks at and how far away it is. */
export function resetViewAngle(): void {
  store().update((s) => {
    s.cam = { ...s.cam, yaw: DEFAULT_CAMERA.yaw, pitch: DEFAULT_CAMERA.pitch };
    s.statusMsg = 'Default view angle';
  });
}

export function toggleViewFlag(flag: ViewFlag): void {
  const title = VIEW_FLAG_TITLES[flag];
  store().update((s) => {
    const on = !s.view[flag];
    s.view[flag] = on;
    s.statusMsg = `${title} ${on ? 'on' : 'off'}`;
  });
}

export function setLod(level: number): void {
  store().update((s) => {
    s.filters.lod = level;
    s.statusMsg = `Showing LOD ${level}`;
  });
}

const REASON_TITLES: Record<HiddenReasonDTO, string> = {
  collision: 'Collision geometry',
  bounds: 'Bounds and trigger volumes',
  shadow: 'Shadow geometry',
  placeholder: 'Placeholder geometry',
  helper: 'Helper geometry',
};

export function toggleShown(reason: HiddenReasonDTO): void {
  store().update((s) => {
    const on = !s.filters.show[reason];
    s.filters.show[reason] = on;
    s.statusMsg = `${REASON_TITLES[reason]} ${on ? 'shown' : 'hidden'}`;
  });
}

// ---------------------------------------------------------------- outliner

export function toggleExpanded(index: number): void {
  store().update((s) => {
    if (s.expanded[index]) delete s.expanded[index];
    else s.expanded[index] = true;
  });
}

/** Open a node and everything below it. */
export function expandSubtree(index: number): void {
  store().update((s) => {
    if (!s.scene) return;
    const stack = [index];
    while (stack.length) {
      const at = stack.pop()!;
      const kids = s.scene.children[at + 1] ?? [];
      if (kids.length) s.expanded[at] = true;
      stack.push(...kids);
    }
  });
}

export function setAllExpanded(expanded: boolean): void {
  store().update((s) => {
    s.expanded = {};
    if (expanded && s.scene) {
      for (const node of s.scene.graph.nodes) if (s.scene.children[node.index + 1]!.length) s.expanded[node.index] = true;
    }
    s.statusMsg = expanded ? 'Expand all' : 'Collapse all';
  });
}

// ---------------------------------------------------------------- undoable editor state

function toggleNodeFlag(key: 'hidden' | 'frozen', verb: string): void {
  const { sel } = store();
  if (!sel.length) return setStatus('Nothing selected');
  const flags = store()[key];
  const before = new Map(sel.map((i) => [i, !!flags[i]]));
  const turnOn = !sel.every((i) => flags[i]);
  store().run({
    label: `${turnOn ? verb : `Un${verb.toLowerCase()}`} ${sel.length} object(s)`,
    apply: (s) => {
      for (const i of before.keys()) {
        if (turnOn) s[key][i] = true;
        else delete s[key][i];
      }
    },
    revert: (s) => {
      for (const [i, was] of before) {
        if (was) s[key][i] = true;
        else delete s[key][i];
      }
    },
  });
}

export const toggleHideSelection = () => toggleNodeFlag('hidden', 'Hide');
export const toggleFreezeSelection = () => toggleNodeFlag('frozen', 'Freeze');

/** Clear a flag from every object, as one undo step. */
function clearNodeFlag(key: 'hidden' | 'frozen', verb: string): void {
  const before = Object.keys(store()[key]).map(Number);
  if (!before.length) return setStatus(`Nothing is ${key}`);
  store().run({
    label: `${verb} ${before.length} object(s)`,
    apply: (s) => {
      s[key] = {};
    },
    revert: (s) => {
      for (const i of before) s[key][i] = true;
    },
  });
}

export const unhideAll = () => clearNodeFlag('hidden', 'Unhide');
export const unfreezeAll = () => clearNodeFlag('frozen', 'Unfreeze');

/**
 * Hide everything but the selection, its ancestors (hiding one would hide the selection too) and
 * its descendants, as one undo step.
 */
export function isolateSelection(): void {
  const { scene, sel, hidden } = store();
  if (!scene || !sel.length) return setStatus('Nothing selected');
  const nodes = scene.graph.nodes;
  const keep = new Set<number>();
  for (const i of sel) {
    for (let p = i; p >= 0; p = nodes[p]!.parent) keep.add(p);
    const stack = [i];
    while (stack.length) {
      const at = stack.pop()!;
      keep.add(at);
      stack.push(...(scene.children[at + 1] ?? []));
    }
  }
  const before = { ...hidden };
  const after: Record<number, boolean> = {};
  for (const node of nodes) if (!keep.has(node.index)) after[node.index] = true;
  store().run({
    label: `Isolate ${sel.length} object(s)`,
    apply: (s) => {
      s.hidden = { ...after };
    },
    revert: (s) => {
      s.hidden = { ...before };
    },
  });
}

/** Select the children of the selected objects. */
export function selectChildren(): void {
  const { scene, sel } = store();
  if (!scene) return;
  const next = [...new Set(sel.flatMap((i) => scene.children[i + 1] ?? []))];
  if (!next.length) return setStatus('The selection has no children');
  store().update((s) => {
    s.sel = next;
    for (const i of sel) s.expanded[i] = true;
    s.statusMsg = `${next.length} children selected`;
  });
}

/** Select the parents of the selected objects. */
export function selectParents(): void {
  const { scene, sel } = store();
  if (!scene) return;
  const next = [...new Set(sel.map((i) => scene.graph.nodes[i]!.parent).filter((p) => p >= 0))];
  if (!next.length) return setStatus('The selection is at the top of the scene');
  store().update((s) => {
    s.sel = next;
    s.statusMsg = next.length === 1 ? `Selected ${scene.graph.nodes[next[0]!]!.name}` : `${next.length} parents selected`;
  });
}

/** Select every object of the same class as the selection. */
export function selectSameClass(): void {
  const { scene, sel } = store();
  if (!scene) return;
  const classes = new Set(sel.map((i) => scene.graph.nodes[i]!.className ?? `type ${scene.graph.nodes[i]!.typeId}`));
  const next = scene.graph.nodes.filter((n) => classes.has(n.className ?? `type ${n.typeId}`)).map((n) => n.index);
  store().update((s) => {
    s.sel = next;
    s.statusMsg = `${next.length} objects of class ${[...classes].join(', ')} selected`;
  });
}

export function setSelMode(mode: SelMode): void {
  store().update((s) => {
    s.selMode = mode;
    s.statusMsg = mode === 'Group' ? 'Viewport clicks select the enclosing group' : 'Viewport clicks select the object';
  });
}
