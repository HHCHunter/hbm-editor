/**
 * Keyboard chords, written like "Ctrl+Shift+F": modifiers in the order Ctrl, Alt, Shift, then one
 * key. Letters, digits and punctuation are matched by physical key (KeyboardEvent.code), so a
 * shortcut stays in the same place on any keyboard layout and Shift doesn't change the key's name.
 */

export type Chord = string;

const MODIFIERS = ['Ctrl', 'Alt', 'Shift'] as const;

/** Keys named by what they are rather than what they type. */
const NAMED_CODES: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
};

const ALIASES: Record<string, string> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  cmd: 'Ctrl',
  meta: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  space: 'Space',
  ' ': 'Space',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

function normaliseKey(key: string): string {
  const alias = ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (key.length === 1) return key.toUpperCase();
  // F1…F24, Enter, Home, PageDown…: first letter capitalised as KeyboardEvent.key has them.
  return key[0]!.toUpperCase() + key.slice(1);
}

/** A chord in its one canonical spelling, or null if it isn't one. */
export function parseChord(text: string): Chord | null {
  // "Ctrl++" is Ctrl and the plus key.
  const parts = text.endsWith('++') ? [...text.slice(0, -2).split('+'), '+'] : text.split('+');
  const mods = new Set<string>();
  let key: string | null = null;
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    const name = normaliseKey(raw);
    if ((MODIFIERS as readonly string[]).includes(name)) mods.add(name);
    else if (key) return null;
    else key = name;
  }
  if (!key) return null;
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+');
}

/** The chord a key press makes, or null for a lone modifier. */
export function chordFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): Chord | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph', 'CapsLock'].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad[0-9]$/.test(e.code)) key = e.code.slice(6);
  else if (NAMED_CODES[e.code]) key = NAMED_CODES[e.code]!;
  else key = normaliseKey(e.key);
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

/** Whether the chord has a modifier or is a function key, so it can fire while typing in a field. */
export function worksWhileTyping(chord: Chord): boolean {
  if (/^(Ctrl|Alt)\+/.test(chord)) return !/^Ctrl\+(Z|Y|A|C|V|X|Shift\+Z)$/.test(chord);
  return /^F\d{1,2}$/.test(chord.split('+').pop()!);
}

/**
 * Chords the browser keeps for itself: a page can't take them over, or the user would lose a
 * browser feature they rely on. `platform: 'desktop'` (a future native window) frees most of them.
 */
const BROWSER_RESERVED: readonly string[] = [
  'Ctrl+W',
  'Ctrl+T',
  'Ctrl+N',
  'Ctrl+Shift+T',
  'Ctrl+Shift+N',
  'Ctrl+Shift+W',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Ctrl+L',
  'Ctrl+R',
  'Ctrl+Shift+R',
  'Ctrl+Shift+I',
  'Ctrl+Shift+J',
  'Ctrl+Shift+C',
  'Ctrl+F4',
  'Alt+F4',
  'Alt+D',
  'Alt+E',
  'Alt+F',
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
  'F5',
  'F6',
  'F11',
  'F12',
  ...Array.from({ length: 9 }, (_, i) => `Ctrl+${i + 1}`),
];

export type Platform = 'browser' | 'desktop';

/** Why a chord can't be used, or null when it can. */
export function reservedReason(chord: Chord, platform: Platform = 'browser'): string | null {
  if (platform === 'browser' && BROWSER_RESERVED.includes(chord)) return `${chord} belongs to the browser`;
  if (chord === 'Tab' || chord === 'Shift+Tab') return 'Tab moves between controls';
  if (chord === 'F10') return 'F10 opens the menu bar';
  return null;
}

/** A chord as people read it: arrows by direction, the space bar by name. */
export function describeChord(chord: Chord): string {
  return chord.replace(/Arrow(Up|Down|Left|Right)/, '$1').replace('Space', 'Spacebar');
}
