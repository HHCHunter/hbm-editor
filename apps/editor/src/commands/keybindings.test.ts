import { describe, expect, it } from 'vitest';
import { chordFromEvent, parseChord, reservedReason, worksWhileTyping } from './keybindings';

const press = (code: string, key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  code,
  key,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe('chords', () => {
  it('spells a chord one way whatever the input order or case', () => {
    expect(parseChord('shift+ctrl+p')).toBe('Ctrl+Shift+P');
    expect(parseChord('Alt+1')).toBe('Alt+1');
    expect(parseChord('esc')).toBe('Escape');
    expect(parseChord('Ctrl++')).toBe('Ctrl++');
    expect(parseChord('Ctrl+Shift')).toBeNull();
    expect(parseChord('A+B')).toBeNull();
  });

  it('reads key presses by physical key, so Shift and keyboard layout do not change the name', () => {
    expect(chordFromEvent(press('KeyF', 'F', { shift: true }))).toBe('Shift+F');
    expect(chordFromEvent(press('KeyZ', 'y', { ctrl: true }))).toBe('Ctrl+Z');
    expect(chordFromEvent(press('Digit2', '"', { alt: true }))).toBe('Alt+2');
    expect(chordFromEvent(press('Slash', '?', { shift: true }))).toBe('Shift+/');
    expect(chordFromEvent(press('Comma', ',', { ctrl: true }))).toBe('Ctrl+,');
    expect(chordFromEvent(press('KeyP', 'P', { meta: true, shift: true }))).toBe('Ctrl+Shift+P');
    expect(chordFromEvent(press('F1', 'F1'))).toBe('F1');
    expect(chordFromEvent(press('Escape', 'Escape'))).toBe('Escape');
    expect(chordFromEvent(press('ShiftLeft', 'Shift', { shift: true }))).toBeNull();
  });

  it('lets only modified keys and function keys through while typing, and leaves text editing keys alone', () => {
    expect(worksWhileTyping('F')).toBe(false);
    expect(worksWhileTyping('Escape')).toBe(false);
    expect(worksWhileTyping('F1')).toBe(true);
    expect(worksWhileTyping('Ctrl+Shift+P')).toBe(true);
    expect(worksWhileTyping('Ctrl+Z')).toBe(false);
    expect(worksWhileTyping('Ctrl+A')).toBe(false);
  });

  it('refuses chords the browser keeps', () => {
    expect(reservedReason('Ctrl+W')).toMatch(/browser/);
    expect(reservedReason('Ctrl+3')).toMatch(/browser/);
    expect(reservedReason('F5')).toMatch(/browser/);
    expect(reservedReason('F10')).toMatch(/menu bar/);
    expect(reservedReason('Ctrl+W', 'desktop')).toBeNull();
    expect(reservedReason('Alt+3')).toBeNull();
  });
});
