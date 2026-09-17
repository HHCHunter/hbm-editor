import { create } from 'zustand';

export const UI_SCALES = [0.9, 1, 1.15, 1.25, 1.5, 1.75, 2] as const;
export type Density = 'comfortable' | 'compact';

export interface Settings {
  /** Multiplies every size in the interface. */
  uiScale: number;
  density: Density;
}

export const DEFAULT_SETTINGS: Settings = { uiScale: 1, density: 'comfortable' };

const KEY = 'hbm-editor:settings';
const VERSION = 1;

/** Settings from storage, falling back to defaults for anything missing or unreadable. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as { v?: number; data?: Partial<Settings> };
    const data = saved.v === VERSION ? (saved.data ?? {}) : {};
    return {
      uiScale: UI_SCALES.includes(data.uiScale as (typeof UI_SCALES)[number]) ? data.uiScale! : DEFAULT_SETTINGS.uiScale,
      density: data.density === 'compact' ? 'compact' : DEFAULT_SETTINGS.density,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function save(settings: Settings): void {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: new Date().toISOString(), data: settings }));
  } catch {
    // Storage can be unavailable or full; the settings still apply for this session.
  }
}

/** Put the settings on the document, where the design tokens read them. */
export function applySettings(settings: Settings, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ui-scale', String(settings.uiScale));
  root.dataset.density = settings.density;
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...loadSettings(),
  set: (patch) => {
    set(patch);
    const { uiScale, density } = get();
    const next = { uiScale, density };
    applySettings(next);
    save(next);
  },
  reset: () => get().set({ ...DEFAULT_SETTINGS }),
}));
