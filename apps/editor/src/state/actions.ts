import type { HiddenReasonDTO } from '@hbm/protocol';
import { meshNodeIndices, positionBounds } from '../scene/sceneModel';
import { frame } from '../viewport/camera';
import { DEFAULT_CAMERA, VIEW_FLAG_TITLES, useEditor, type CameraState, type DialogName, type Tab, type ViewFlag } from './store';

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
    s.menuOpen = null;
  });
}

export function setTab(tab: Tab): void {
  store().update((s) => {
    s.tab = tab;
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

/** Select the row after the current selection, in outliner order. */
export function selectNext(orderedIndices: readonly number[]): void {
  if (!orderedIndices.length) return;
  const i = orderedIndices.indexOf(store().sel[0] ?? -1);
  selectNode(orderedIndices[(i + 1) % orderedIndices.length]!, false);
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
    s.statusMsg = 'Zoom extents: all';
  });
}

export function zoomSelected(): void {
  const { scene, sel, cam } = store();
  const bounds = scene && positionBounds(scene.transforms, sel);
  if (!bounds) return setStatus('Nothing selected');
  store().update((s) => {
    s.cam = frame(cam, bounds, 300);
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
    if (flag === 'K') s.filters.show.collision = on;
    const preset = VIEW_PRESETS[flag];
    if (preset && on) {
      s.cam = { ...s.cam, ...preset };
      for (const other of ['T', 'B', 'L', 'R'] as const) if (other !== flag) s.view[other] = false;
      s.statusMsg = `${title} view`;
      return;
    }
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
    if (reason === 'collision') s.view.K = on;
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

// ---------------------------------------------------------------- menus

const MESSAGES: Record<string, string> = {
  Exit: 'Close this tab and the launcher window to exit.',
  About: 'Hitman: Blood Money Editor · reads your game files through the local server',
};

export function runMenuCommand(name: string): void {
  const s = store();
  switch (name) {
    case 'Choose Game…':
      return openDialog('gamePicker');
    case 'Open Scene…':
      return openDialog('sceneOpen');
    case 'Undo':
      return s.undo();
    case 'Redo':
      return s.redo();
    case 'Hide Selection':
      return toggleHideSelection();
    case 'Freeze Selection':
      return toggleFreezeSelection();
    case 'Wireframe':
      return toggleViewFlag('W');
    case 'Lighting':
      return toggleViewFlag('Li');
    case 'Fog':
      return toggleViewFlag('F');
    case 'Grid':
      return toggleViewFlag('G');
    case 'Zoom Extents':
      return zoomExtents();
    case 'Zoom Selected':
      return zoomSelected();
    case 'Scene View':
      return setTab('scene');
    case 'Texture Browser':
      return setTab('textures');
    case 'Localisation Browser':
      return setTab('localisation');
    case 'Script Browser':
      return setTab('scripts');
    default:
      setStatus(MESSAGES[name] ?? `${name.replace(/…$/, '')} isn't available yet`);
  }
}
