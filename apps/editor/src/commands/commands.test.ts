// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialEditorState, useEditor } from '../state/store';
import './index';
import { BROWSER_AREA } from '../shell/layoutStore';
import { resolveChord, shortcutContext } from './dispatcher';
import { fuzzyMatch } from './fuzzy';
import { reservedReason } from './keybindings';
import { DEFAULT_KEYMAP, bindingsOf, commandsForChord, useKeymap } from './keymap';
import { MENU_LAYOUT } from './menus';
import { allCommands, executeCommand, getCommand, recentCommands, registerCommands } from './registry';

vi.mock('../ui', () => ({ toast: vi.fn() }));

const state = () => useEditor.getState();

beforeEach(() => {
  useEditor.setState(initialEditorState());
  useKeymap.getState().resetAll();
});

describe('command definitions', () => {
  it('bind only commands that exist, with chords the browser allows, each chord once', () => {
    const seen = new Map<string, string>();
    for (const [id, chords] of Object.entries(DEFAULT_KEYMAP)) {
      expect(getCommand(id), id).toBeDefined();
      for (const chord of chords) {
        expect(reservedReason(chord), `${id}: ${chord}`).toBeNull();
        expect(seen.get(chord), `${chord} is bound twice`).toBeUndefined();
        seen.set(chord, id);
      }
    }
  });

  it('list only commands that exist in the menus', () => {
    const walk = (items: (typeof MENU_LAYOUT)[number]['items']): void => {
      for (const item of items) {
        if (typeof item === 'string') {
          if (item !== '-') expect(getCommand(item), item).toBeDefined();
        } else walk(item.items);
      }
    };
    for (const menu of MENU_LAYOUT) walk(menu.items);
  });

  it('refuse a duplicate id', () => {
    expect(() => registerCommands([{ id: 'edit.undo', title: 'Again', category: 'Edit', run: () => {} }])).toThrow(/twice/);
  });

  it('give every command a title and category', () => {
    for (const command of allCommands()) {
      expect(command.title.trim(), command.id).not.toBe('');
      expect(command.id).toMatch(/^[a-z]+\.[A-Za-z.]+$/);
    }
  });
});

describe('running commands', () => {
  it('says why a command cannot run instead of running it', () => {
    expect(executeCommand('camera.frameSelected')).toBe(false);
    expect(state().statusMsg).toBe('Frame Selected: Open a scene first');
  });

  it('runs a command and remembers it as recent', () => {
    expect(executeCommand('window.materials')).toBe(true);
    expect(state().browser).toBe('materials');
    expect(recentCommands()[0]).toBe('window.materials');
  });

  it('reports a command that throws rather than losing the error', () => {
    registerCommands([
      {
        id: 'test.explode',
        title: 'Explode',
        category: 'Help',
        run: () => {
          throw new Error('boom');
        },
      },
    ]);
    expect(executeCommand('test.explode')).toBe(true);
    expect(state().statusMsg).toBe('Explode failed: boom');
  });
});

const VIEW = { dialog: null, sceneView: true };
const NO_VIEW = { dialog: null, sceneView: false };

describe('shortcuts', () => {
  it('only change the 3D view while it is showing and the keyboard is not in a browser', () => {
    expect(resolveChord('W', VIEW)).toBe('view.wireframe');
    expect(resolveChord('W', NO_VIEW)).toBeNull();
    expect(resolveChord('F', NO_VIEW)).toBeNull();

    const browser = document.createElement('div');
    browser.dataset.area = BROWSER_AREA;
    const field = browser.appendChild(document.createElement('button'));
    expect(shortcutContext({ dialog: null, browserMaximised: false }, field).sceneView).toBe(false);
    expect(shortcutContext({ dialog: null, browserMaximised: false }, document.body).sceneView).toBe(true);
    expect(shortcutContext({ dialog: null, browserMaximised: true }, document.body).sceneView).toBe(false);
  });

  it('grey out 3D view commands while the browsers are maximised, with the reason', () => {
    state().update((s) => {
      s.scene = { graph: { nodes: [] } } as never;
      s.browserMaximised = true;
    });
    expect(executeCommand('camera.frameAll')).toBe(false);
    expect(state().statusMsg).toBe('Frame All: Restore the viewport to use this');
    expect(executeCommand('window.maximiseBrowser')).toBe(true);
    expect(state().browserMaximised).toBe(false);
  });

  it('switch tabs and open the palette from anywhere, but nothing else runs over a dialog', () => {
    expect(resolveChord('Alt+2', VIEW)).toBe('window.textures');
    expect(resolveChord('F1', { dialog: 'settings', sceneView: true })).toBe('help.commandPalette');
    expect(resolveChord('H', { dialog: 'settings', sceneView: true })).toBeNull();
  });

  it('follow the user’s own bindings over the defaults', () => {
    useKeymap.getState().setBindings('camera.frameSelected', ['K']);
    expect(bindingsOf('camera.frameSelected')).toEqual(['K']);
    expect(resolveChord('K', VIEW)).toBe('camera.frameSelected');
    expect(resolveChord('F', VIEW)).toBeNull();
    expect(commandsForChord('K')).toEqual(['camera.frameSelected']);
    useKeymap.getState().reset('camera.frameSelected');
    expect(bindingsOf('camera.frameSelected')).toEqual(['F']);
  });

  it('prefer the narrower scope when two commands share a key', () => {
    useKeymap.getState().setBindings('file.settings', ['G']);
    expect(resolveChord('G', VIEW)).toBe('view.grid');
    expect(resolveChord('G', NO_VIEW)).toBe('file.settings');
  });
});

describe('fuzzy matching', () => {
  it('matches letters in order and ranks word starts and runs higher', () => {
    expect(fuzzyMatch('fs', 'Frame Selected')).not.toBeNull();
    expect(fuzzyMatch('sf', 'Frame Selected')).toBeNull();
    const starts = fuzzyMatch('fs', 'Frame Selected')!.score;
    const middle = fuzzyMatch('fs', 'Unfreeze Stuff')!.score;
    expect(starts).toBeGreaterThan(middle);
    expect(fuzzyMatch('wire', 'Wireframe')!.positions).toEqual([0, 1, 2, 3]);
    expect(fuzzyMatch('table', 'Table_01')!.score).toBeGreaterThan(fuzzyMatch('table', 'Chairs_Around_Table')!.score);
  });
});
