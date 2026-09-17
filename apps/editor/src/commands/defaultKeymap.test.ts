import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP, matchesChord } from './defaultKeymap';

const key = (code: string, key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ code, key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }) as KeyboardEvent;

describe('chords', () => {
  it('matches letters by physical key and requires the exact modifiers', () => {
    expect(matchesChord(key('KeyF', 'f'), 'F')).toBe(true);
    expect(matchesChord(key('KeyF', 'F', { shiftKey: true }), 'F')).toBe(false);
    expect(matchesChord(key('KeyF', 'F', { shiftKey: true }), 'Shift+F')).toBe(true);
    expect(matchesChord(key('KeyO', 'o', { ctrlKey: true }), 'Ctrl+O')).toBe(true);
    expect(matchesChord(key('Digit2', '"', { altKey: true }), 'Alt+2')).toBe(true);
  });

  it('avoids chords the browser keeps for itself', () => {
    const reserved = /^Ctrl\+([1-9]|W|T|N|L|Tab)$|^F(5|6|11|12)$/;
    for (const chord of Object.values(DEFAULT_KEYMAP)) expect(chord).not.toMatch(reserved);
  });

  it('gives each action its own chord', () => {
    const chords = Object.values(DEFAULT_KEYMAP);
    expect(new Set(chords).size).toBe(chords.length);
  });
});
