import { beforeEach, describe, expect, it } from 'vitest';
import type { SceneGraphDTO, SceneNodeDTO } from '@hbm/protocol';
import { childIndex, effectiveFlags } from '../scene/sceneModel';
import { pickFromViewport, selectNode, setAllExpanded, toggleHideSelection, toggleShown, zoomExtents } from './actions';
import { initialEditorState, useEditor, type LoadedScene } from './store';

const state = () => useEditor.getState();

function node(index: number, parent: number, kind: SceneNodeDTO['kind'], meshRoot = 0): SceneNodeDTO {
  return { index, parent, depth: parent < 0 ? 0 : 1, name: `n${index}`, typeId: 0, className: null, kind, meshRoot, boundingBox: null, inactive: null, controllers: [] };
}

// room 0 › group 1 › mesh 2, and mesh 3 at the top.
function loadScene(): LoadedScene {
  const nodes = [node(0, -1, 'room'), node(1, 0, 'group'), node(2, 1, 'mesh', 10), node(3, -1, 'mesh', 11)];
  const graph: SceneGraphDTO = { id: 'M01/M01_main', nodes, roots: [], sceneProperties: [], problems: [] };
  const transforms = new Float32Array(nodes.length * 12);
  transforms.set([100, 0, 0], 2 * 12 + 9);
  transforms.set([-100, 50, 20], 3 * 12 + 9);
  const scene: LoadedScene = { id: graph.id, graph, transforms, surfaces: {}, roots: {}, children: childIndex(graph) };
  state().update((s) => {
    s.scene = scene as never;
  });
  return scene;
}

beforeEach(() => {
  useEditor.setState(initialEditorState());
  loadScene();
});

describe('editor-only visibility', () => {
  it('undoes and redoes a hide', () => {
    selectNode(3, false);
    toggleHideSelection();
    expect(state().hidden[3]).toBe(true);

    state().undo();
    expect(state().hidden[3]).toBeUndefined();

    state().redo();
    expect(state().hidden[3]).toBe(true);
  });

  it('hides everything below a hidden node', () => {
    const flags = effectiveFlags(state().scene!.graph.nodes, { 1: true });
    expect([...flags]).toEqual([0, 1, 1, 0]);
  });

  it('keeps the collision flag and the K view button in step', () => {
    toggleShown('collision');
    expect(state().view.K).toBe(true);
    expect(state().filters.show.collision).toBe(true);
  });
});

describe('selection', () => {
  it('selects the outermost group in Group mode and opens its ancestors', () => {
    state().update((s) => {
      s.selMode = 'Group';
    });
    pickFromViewport(2, false);
    expect(state().sel).toEqual([0]);

    state().update((s) => {
      s.selMode = 'Geom';
    });
    pickFromViewport(2, false);
    expect(state().sel).toEqual([2]);
    expect(state().expanded).toMatchObject({ 0: true, 1: true });
  });

  it('toggles a node in and out of the selection with Ctrl', () => {
    selectNode(2, false);
    selectNode(3, true);
    expect(state().sel).toEqual([2, 3]);
    selectNode(2, true);
    expect(state().sel).toEqual([3]);
  });

  it('clears the selection on a miss', () => {
    selectNode(2, false);
    pickFromViewport(null, false);
    expect(state().sel).toEqual([]);
  });
});

describe('outliner and camera', () => {
  it('expands only nodes with children', () => {
    setAllExpanded(true);
    expect(state().expanded).toEqual({ 0: true, 1: true });
  });

  it('frames the placed models', () => {
    zoomExtents();
    const { cam } = state();
    expect([cam.tx, cam.ty, cam.tz]).toEqual([0, 25, 10]);
    expect(cam.dist).toBeGreaterThan(100);
  });
});
