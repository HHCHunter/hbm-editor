import { useEffect } from 'react';
import { DEFAULT_KEYMAP, matchesChord, type ActionId } from '../commands/defaultKeymap';
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

interface Binding {
  run: () => void;
  /** Only while the scene view is showing, so keys never change a viewport the user can't see. */
  sceneOnly?: boolean;
}

const BINDINGS: Record<ActionId, Binding> = {
  'file.openScene': { run: () => openDialog('sceneOpen') },
  'edit.undo': { run: () => useEditor.getState().undo() },
  'edit.redo': { run: () => useEditor.getState().redo() },
  'edit.hide': { run: toggleHideSelection, sceneOnly: true },
  'view.wireframe': { run: () => toggleViewFlag('W'), sceneOnly: true },
  'view.grid': { run: () => toggleViewFlag('G'), sceneOnly: true },
  'view.frameAll': { run: zoomExtents, sceneOnly: true },
  'view.frameSelected': { run: zoomSelected, sceneOnly: true },
  'window.scene': { run: () => setTab('scene') },
  'window.textures': { run: () => setTab('textures') },
  'window.localisation': { run: () => setTab('localisation') },
  'window.scripts': { run: () => setTab('scripts') },
  'window.animations': { run: () => setTab('animations') },
};

/** The keyboard shortcuts listed in the menus. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { update, dialog, tab } = useEditor.getState();
      if (e.key === 'Escape') {
        update((s) => {
          s.menuOpen = null;
          if (s.scene || s.dialog === 'sceneOpen') s.dialog = null;
        });
        return;
      }
      // Ctrl+Z and Ctrl+Y belong to the text field while typing.
      if (isTyping(e.target) || dialog) return;

      for (const [action, chord] of Object.entries(DEFAULT_KEYMAP) as [ActionId, string][]) {
        if (!matchesChord(e, chord)) continue;
        const binding = BINDINGS[action];
        if (binding.sceneOnly && tab !== 'scene') return;
        e.preventDefault();
        binding.run();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
