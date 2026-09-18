import { create } from 'zustand';
import { parseChord, type Chord } from './keybindings';

/**
 * Default shortcuts by command id, Unreal-style where there's a convention. Browser-reserved
 * chords (Ctrl+1..9, Ctrl+W, Ctrl+T, F5…) are avoided, and F1 is always a second way to the
 * command palette in case Ctrl+Shift+P is taken.
 */
export const DEFAULT_KEYMAP: Readonly<Record<string, readonly Chord[]>> = {
  'help.commandPalette': ['Ctrl+Shift+P', 'F1'],
  'help.findObject': ['Ctrl+P'],
  'help.keyboardShortcuts': ['Shift+/'],
  'file.openScene': ['Ctrl+O'],
  'file.settings': ['Ctrl+,'],
  'edit.undo': ['Ctrl+Z'],
  'edit.redo': ['Ctrl+Y', 'Ctrl+Shift+Z'],
  'edit.hide': ['H'],
  'edit.unhideAll': ['Alt+H'],
  'edit.freeze': ['L'],
  'edit.unfreezeAll': ['Alt+L'],
  'selection.all': ['Ctrl+A'],
  'selection.none': ['Escape'],
  'selection.invert': ['Ctrl+I'],
  'view.wireframe': ['W'],
  'view.grid': ['G'],
  'camera.frameSelected': ['F'],
  'camera.frameAll': ['Shift+F'],
  'window.scene': ['Alt+1'],
  'window.textures': ['Alt+2'],
  'window.materials': ['Alt+3'],
  'window.localisation': ['Alt+4'],
  'window.scripts': ['Alt+5'],
  'window.animations': ['Alt+6'],
  'window.maximiseBrowser': ['Shift+Space'],
};

const KEY = 'hbm-editor:keymap';
const VERSION = 1;

type Overrides = Record<string, Chord[]>;

function load(): Overrides {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { v?: number; data?: Overrides } | null;
    if (!saved || saved.v !== VERSION || typeof saved.data !== 'object' || !saved.data) return {};
    const out: Overrides = {};
    for (const [id, chords] of Object.entries(saved.data)) {
      if (!Array.isArray(chords)) continue;
      out[id] = chords.map((c) => (typeof c === 'string' ? parseChord(c) : null)).filter((c): c is Chord => !!c);
    }
    return out;
  } catch {
    return {};
  }
}

function save(overrides: Overrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: new Date().toISOString(), data: overrides }));
  } catch {
    // Storage can be unavailable; the bindings still apply until reload.
  }
}

interface KeymapStore {
  /** Only what differs from the defaults, so new default bindings still reach users. */
  overrides: Overrides;
  setBindings: (id: string, chords: Chord[]) => void;
  reset: (id: string) => void;
  resetAll: () => void;
}

export const useKeymap = create<KeymapStore>()((set, get) => ({
  overrides: load(),
  setBindings: (id, chords) => {
    const overrides = { ...get().overrides, [id]: chords };
    set({ overrides });
    save(overrides);
  },
  reset: (id) => {
    const overrides = Object.fromEntries(Object.entries(get().overrides).filter(([key]) => key !== id));
    set({ overrides });
    save(overrides);
  },
  resetAll: () => {
    set({ overrides: {} });
    save({});
  },
}));

/** A command's chords, with the user's changes. */
export function bindingsOf(id: string, overrides: Overrides = useKeymap.getState().overrides): readonly Chord[] {
  return overrides[id] ?? DEFAULT_KEYMAP[id] ?? [];
}

/** The first chord, as menus and tooltips show it. */
export function shortcutOf(id: string, overrides?: Overrides): Chord | undefined {
  return bindingsOf(id, overrides)[0];
}

/** Every command bound to a chord. */
export function commandsForChord(chord: Chord, overrides: Overrides = useKeymap.getState().overrides): string[] {
  const ids = new Set([...Object.keys(DEFAULT_KEYMAP), ...Object.keys(overrides)]);
  return [...ids].filter((id) => bindingsOf(id, overrides).includes(chord));
}

/** The first chord of a command, kept current as bindings change. */
export function useShortcut(id: string): Chord | undefined {
  return useKeymap((s) => shortcutOf(id, s.overrides));
}
