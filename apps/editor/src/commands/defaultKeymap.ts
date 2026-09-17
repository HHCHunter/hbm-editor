/**
 * The default keyboard shortcuts, by action. Menus show these and the key handler matches them,
 * so a shortcut can't be listed one way and bound another. Browser-reserved chords (Ctrl+1..9,
 * Ctrl+W, Ctrl+T, F5…) are avoided because a page can't reliably take them over.
 */
export const DEFAULT_KEYMAP = {
  'file.openScene': 'Ctrl+O',
  'file.settings': 'Ctrl+,',
  'edit.undo': 'Ctrl+Z',
  'edit.redo': 'Ctrl+Y',
  'edit.hide': 'H',
  'view.wireframe': 'W',
  'view.grid': 'G',
  'view.frameAll': 'Shift+F',
  'view.frameSelected': 'F',
  'window.scene': 'Alt+1',
  'window.textures': 'Alt+2',
  'window.localisation': 'Alt+3',
  'window.scripts': 'Alt+4',
  'window.animations': 'Alt+5',
} as const;

export type ActionId = keyof typeof DEFAULT_KEYMAP;

/** Whether a key event is the chord, written like "Ctrl+Shift+F". Letters and digits match by physical key. */
export function matchesChord(e: KeyboardEvent, chord: string): boolean {
  const parts = chord.split('+');
  const key = parts.pop()!;
  const mods = new Set(parts);
  if ((e.ctrlKey || e.metaKey) !== mods.has('Ctrl')) return false;
  if (e.shiftKey !== mods.has('Shift')) return false;
  if (e.altKey !== mods.has('Alt')) return false;
  if (/^[A-Z]$/.test(key)) return e.code === `Key${key}`;
  if (/^[0-9]$/.test(key)) return e.code === `Digit${key}` || e.code === `Numpad${key}`;
  return e.key === key;
}
