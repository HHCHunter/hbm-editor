import { create } from 'zustand';

/**
 * Sizes of the resizable panes, in CSS px, by pane id. Only panes the user has dragged are here;
 * the rest use their default. Kept for the session only: every launch starts from the default.
 */
interface LayoutStore {
  sizes: Record<string, number>;
  /** Null goes back to the default. */
  setSize: (id: string, px: number | null) => void;
  reset: () => void;
}

export const useLayout = create<LayoutStore>((set) => ({
  sizes: {},
  setSize: (id, px) =>
    set((s) => {
      const sizes = { ...s.sizes };
      if (px === null) delete sizes[id];
      else sizes[id] = px;
      return { sizes };
    }),
  reset: () => set({ sizes: {} }),
}));

/** The browser panel under the viewport; shortcuts for the 3D view stay out of it. */
export const BROWSER_AREA = 'browser';
/** Prefix of the browser panel's tab ids. */
export const BROWSER_TAB_PREFIX = 'browser';

/** Props that tie a SplitPane's size to the layout store. */
export function usePaneSize(id: string): {
  size: number | null;
  onSize: (px: number | null) => void;
} {
  const size = useLayout((s) => s.sizes[id] ?? null);
  return { size, onSize: (px) => useLayout.getState().setSize(id, px) };
}
