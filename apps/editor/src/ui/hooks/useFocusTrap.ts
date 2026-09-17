import { useEffect, type RefObject } from 'react';

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[hidden], [inert]'));
}

/**
 * Keep Tab inside `ref` while active: focus moves in when it starts (to an [autofocus] or
 * [data-autofocus] element, the first tabbable one, or the container) and returns to whatever had
 * focus before when it ends.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active = true): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const before = document.activeElement as HTMLElement | null;

    if (!root.contains(document.activeElement)) {
      const first =
        root.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? tabbables(root)[0] ?? root;
      first.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = tabbables(root);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !root.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !root.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (before && document.contains(before)) before.focus();
    };
  }, [ref, active]);
}
