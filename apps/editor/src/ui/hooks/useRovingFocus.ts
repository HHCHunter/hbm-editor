import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const ITEMS = 'button, input, select, [role="combobox"], [data-roving]';

export interface RovingOptions {
  orientation: 'horizontal' | 'vertical';
  /** Wrap from the last item to the first. */
  loop?: boolean;
}

function items(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ITEMS)].filter(
    (el) =>
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      // Only this container's own items, not a nested toolbar's or popup's.
      el.parentElement?.closest('[data-roving-container]') === container,
  );
}

/**
 * One tab stop for a group of controls; arrow keys, Home and End move between them (the WAI-ARIA
 * toolbar and tablist pattern). The last focused item keeps the tab stop.
 */
export function useRovingFocus<T extends HTMLElement>({ orientation, loop = true }: RovingOptions): {
  ref: RefObject<T>;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
} {
  const ref = useRef<T>(null);
  const current = useRef<HTMLElement | null>(null);

  // Every render may add or remove items, so give out the tab stop again.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.setAttribute('data-roving-container', '');
    const list = items(container);
    if (!list.length) return;
    const keep =
      (current.current && list.includes(current.current) && current.current) ||
      list.find((el) => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true') ||
      list[0]!;
    for (const el of list) el.tabIndex = el === keep ? 0 : -1;
  });

  const onFocus = useCallback((e: React.FocusEvent) => {
    const container = ref.current;
    if (!container) return;
    const list = items(container);
    const target = e.target as HTMLElement;
    if (!list.includes(target)) return;
    current.current = target;
    for (const el of list) el.tabIndex = el === target ? 0 : -1;
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const container = ref.current;
      if (!container || e.altKey || e.ctrlKey || e.metaKey) return;
      const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
      if (![prev, next, 'Home', 'End'].includes(e.key)) return;
      const target = e.target as HTMLElement;
      // Text fields need their own arrow, Home and End keys; checkboxes and radios don't.
      if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(target.type)) return;
      const list = items(container);
      const at = list.indexOf(target);
      if (at < 0) return;
      let to = at;
      if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = list.length - 1;
      else if (e.key === next) to = at + 1 < list.length ? at + 1 : loop ? 0 : at;
      else to = at > 0 ? at - 1 : loop ? list.length - 1 : at;
      e.preventDefault();
      list[to]?.focus();
    },
    [orientation, loop],
  );

  return { ref, onKeyDown, onFocus };
}
