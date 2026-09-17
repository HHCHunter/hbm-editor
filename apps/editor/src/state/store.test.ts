import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteSelection,
  groupSelection,
  pickFromViewport,
  renameObject,
  setPositionFromText,
  toggleHideSelection,
} from './actions';
import { initialEditorState, useEditor } from './store';

const state = () => useEditor.getState();
const obj = (id: string) => state().objects.find((o) => o.id === id);
const select = (...ids: string[]) =>
  state().update((s) => {
    s.sel = ids;
  });

beforeEach(() => {
  useEditor.setState(initialEditorState());
});

describe('undo history', () => {
  it('undoes and redoes a hide', () => {
    select('globe');
    toggleHideSelection();
    expect(obj('globe')?.hidden).toBe(true);

    state().undo();
    expect(obj('globe')?.hidden).toBe(false);

    state().redo();
    expect(obj('globe')?.hidden).toBe(true);
  });

  it('brings back a deleted group and its children on undo', () => {
    select('stairs');
    deleteSelection();
    expect(obj('stairs')).toBeUndefined();
    expect(obj('st0')).toBeUndefined();
    expect(state().sel).toEqual([]);

    state().undo();
    expect(obj('stairs')).toBeDefined();
    expect(obj('st6')?.parent).toBe('stairs');

    state().redo();
    expect(obj('st3')).toBeUndefined();
  });

  it('clears the redo stack when a new edit is made', () => {
    select('globe');
    toggleHideSelection();
    state().undo();
    expect(state().redoStack).toHaveLength(1);

    renameObject('globe', 'Globe_Renamed');
    expect(state().redoStack).toHaveLength(0);
  });

  it('records nothing for an edit that changes nothing', () => {
    renameObject('globe', 'Pc06F_Globe_01');
    setPositionFromText('globe', '165, 20, 105');
    expect(state().undoStack).toHaveLength(0);
    expect(state().dirty).toBe(false);
  });

  it('rejects a malformed position without recording an edit', () => {
    expect(setPositionFromText('globe', '1, 2')).toBe(false);
    expect(state().undoStack).toHaveLength(0);
  });

  it('groups a selection under a new ZGROUP, undoably', () => {
    select('cb0', 'cb1');
    groupSelection();
    const [groupId] = state().sel;
    expect(obj(groupId!)?.cls).toBe('ZGROUP');
    expect(obj('cb0')?.parent).toBe(groupId);

    state().undo();
    expect(obj(groupId!)).toBeUndefined();
    expect(obj('cb0')?.parent).toBe('cab');
  });

  it('refuses to group an object with its own parent', () => {
    select('stairs', 'st0');
    groupSelection();
    expect(state().undoStack).toHaveLength(0);
  });
});

describe('viewport picking', () => {
  it('selects the outermost group in Group mode', () => {
    state().update((s) => {
      s.selMode = 'Group';
    });
    pickFromViewport('st2', false);
    expect(state().sel).toEqual(['inside']);
  });

  it('clears the selection on a miss', () => {
    pickFromViewport(null, false);
    expect(state().sel).toEqual([]);
  });
});
