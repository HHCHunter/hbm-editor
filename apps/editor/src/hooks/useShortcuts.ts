import { useEffect } from 'react';
import {
  openDialog,
  setTab,
  toggleHideSelection,
  toggleViewFlag,
  zoomExtents,
  zoomSelected,
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
      const { undo, redo, update, dialog } = useEditor.getState();
      if (e.key === 'Escape') {
        update((s) => {
          s.menuOpen = null;
          if (s.scene || s.dialog === 'sceneOpen') s.dialog = null;
        });
        return;
      }
      if (isTyping(e.target) || e.altKey || dialog) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'z' && !e.shiftKey) undo();
      else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) redo();
      else if (ctrl && key === 'o') openDialog('sceneOpen');
      else if (ctrl && key === '1') setTab('scene');
      else if (ctrl && key === '2') setTab('textures');
      else if (ctrl && key === '3') setTab('localisation');
      else if (ctrl && key === '4') setTab('scripts');
      else if (ctrl && key === '5') setTab('animations');
      else if (ctrl) return;
      else if (key === 'w') toggleViewFlag('W');
      else if (key === 'l') toggleViewFlag('Li');
      else if (key === 'f') toggleViewFlag('F');
      else if (key === 'g') toggleViewFlag('G');
      else if (key === 'h') toggleHideSelection();
      else if (key === 'z' && e.shiftKey) zoomSelected();
      else if (key === 'z') zoomExtents();
      else return;

      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
