import { useEffect } from 'react';
import { useEditor, type EditorState } from '../state/store';
import { commandsForChord } from './keymap';
import { chordFromEvent, worksWhileTyping } from './keybindings';
import { executeCommand, getCommand } from './registry';
import type { Scope } from './types';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(target.type);
  return target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Popups and dialogs handle their own keys (arrows, type-ahead, Escape); shortcuts stay out. */
function inOwnKeyboardArea(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[role=menu], [role=listbox], [aria-modal=true]');
}

const SPECIFICITY: Scope[] = ['sceneView', 'workspace', 'global'];
const REPEATABLE = ['Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z'];

export function scopeActive(scope: Scope, state: Pick<EditorState, 'dialog' | 'tab'>): boolean {
  if (scope === 'global') return true;
  if (state.dialog) return false;
  return scope === 'workspace' || state.tab === 'scene';
}

/**
 * The command a chord runs right now, or null. Of the commands bound to it, the one in the
 * narrowest scope that's active wins.
 */
export function resolveChord(chord: string, state: Pick<EditorState, 'dialog' | 'tab'>): string | null {
  const candidates = commandsForChord(chord)
    .map((id) => getCommand(id))
    .filter((c): c is NonNullable<typeof c> => !!c && scopeActive(c.scope ?? 'workspace', state));
  candidates.sort((a, b) => SPECIFICITY.indexOf(a.scope ?? 'workspace') - SPECIFICITY.indexOf(b.scope ?? 'workspace'));
  return candidates[0]?.id ?? null;
}

/**
 * Run commands from their keyboard shortcuts. Listens in the capture phase so a shortcut wins over
 * type-ahead in the outliner, but leaves text fields, menus, lists and dialogs their own keys.
 */
export function useCommandShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const chord = chordFromEvent(e);
      if (!chord) return;
      // Holding a key repeats only undo and redo.
      if (e.repeat && !REPEATABLE.includes(chord)) return;
      if (isTyping(e.target) && !worksWhileTyping(chord)) return;
      const state = useEditor.getState();
      // A dialog is modal and handles its own keys.
      if (state.dialog) return;
      const id = resolveChord(chord, state);
      if (!id) return;
      // Menus and lists keep their keys for navigation and type-ahead, except global commands.
      if (inOwnKeyboardArea(e.target) && getCommand(id)?.scope !== 'global') return;
      e.preventDefault();
      e.stopPropagation();
      executeCommand(id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
