import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const OVERSCAN = 12;

/**
 * The height of one row in px, measured from the --row token so it follows the UI scale and
 * density settings. Render `probe` somewhere inside the scroll container.
 */
function useRowHeight(): { height: number; probeRef: RefObject<HTMLDivElement> } {
  const probeRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(22);
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const measure = () => {
      const h = probe.getBoundingClientRect().height;
      if (h > 0) setHeight(h);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);
  return { height, probeRef };
}

export interface VirtualRows {
  scrollRef: RefObject<HTMLDivElement>;
  probeRef: RefObject<HTMLDivElement>;
  rowHeight: number;
  start: number;
  end: number;
  totalHeight: number;
  /** Scroll just enough to show row `index`. */
  reveal: (index: number, mode?: 'nearest' | 'center') => void;
  /** How many rows fit in the visible area. */
  pageSize: number;
}

/** Window a long list: only rows near the visible area are rendered. */
export function useVirtualRows(count: number): VirtualRows {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { height: rowHeight, probeRef } = useRowHeight();
  const [view, setView] = useState({ top: 0, height: 400 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, []);

  const reveal = useCallback(
    (index: number, mode: 'nearest' | 'center' = 'nearest') => {
      const el = scrollRef.current;
      if (!el || index < 0) return;
      const y = index * rowHeight;
      // A sticky header inside the scroll area covers the first row's worth of space.
      const header = el.querySelector<HTMLElement>('[data-sticky-header]')?.offsetHeight ?? 0;
      if (mode === 'center') {
        el.scrollTop = Math.max(0, y - (el.clientHeight - header) / 2);
      } else if (y < el.scrollTop) {
        el.scrollTop = y;
      } else if (y + rowHeight > el.scrollTop + el.clientHeight - header) {
        el.scrollTop = y + rowHeight - el.clientHeight + header;
      }
    },
    [rowHeight],
  );

  const start = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN);
  const end = Math.min(count, Math.ceil((view.top + view.height) / rowHeight) + OVERSCAN);
  return {
    scrollRef,
    probeRef,
    rowHeight,
    start,
    end,
    totalHeight: count * rowHeight,
    reveal,
    pageSize: Math.max(1, Math.floor(view.height / rowHeight) - 1),
  };
}
