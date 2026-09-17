import { useEffect } from 'react';
import {
  deleteSelection,
  groupSelection,
  resetCamera,
  toggleViewFlag,
} from '../state/actions';
import { useEditor } from '../state/store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

/** The keyboard shortcuts listed in the menus. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const { undo, redo, update } = useEditor.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'z' && !e.shiftKey) undo();
      else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) redo();
      else if (ctrl && key === 'g') groupSelection();
      else if (ctrl) return;
      else if (e.key === 'Delete') deleteSelection();
      else if (key === 'w') toggleViewFlag('W');
      else if (key === 'l') toggleViewFlag('Li');
      else if (key === 'f') toggleViewFlag('F');
      else if (key === 'g') toggleViewFlag('G');
      else if (key === 'z') resetCamera('Zoom extents: all');
      else if (e.key === 'Escape') {
        update((s) => {
          s.menuOpen = null;
        });
      } else return;

      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
