import { create } from 'zustand';

const KEY = 'hbm-editor:recent-scenes';
/** The key the editor used before it kept a list; read once so the last scene isn't lost. */
const OLD_KEY = 'hbm-editor:last-scene';
const MAX = 10;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Scene ids, most recently opened first. */
export function loadRecentScenes(store: Pick<Storage, 'getItem'> | null = storage()): string[] {
  try {
    const saved = JSON.parse(store?.getItem(KEY) ?? 'null') as { v?: number; data?: unknown } | null;
    if (saved?.v === 1 && Array.isArray(saved.data)) return saved.data.filter((id): id is string => typeof id === 'string').slice(0, MAX);
    const old = store?.getItem(OLD_KEY);
    return old ? [old] : [];
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), data: ids }));
  } catch {
    // Storage can be unavailable; the list just won't survive a reload.
  }
}

interface RecentScenes {
  ids: string[];
  remember: (id: string) => void;
  forget: (id: string) => void;
}

export const useRecentScenes = create<RecentScenes>()((set, get) => ({
  ids: loadRecentScenes(),
  remember: (id) => {
    const ids = [id, ...get().ids.filter((x) => x !== id)].slice(0, MAX);
    set({ ids });
    save(ids);
  },
  forget: (id) => {
    const ids = get().ids.filter((x) => x !== id);
    set({ ids });
    save(ids);
  },
}));
