import { describe, expect, it } from 'vitest';
import type { SceneGraphDTO, SceneNodeDTO } from '@hbm/protocol';
import { childIndex } from '../../scene/sceneModel';
import { buildTreeRows } from './treeRows';

function node(index: number, parent: number, depth: number, name: string, kind: SceneNodeDTO['kind'] = 'group'): SceneNodeDTO {
  return { index, parent, depth, name, typeId: 0, className: null, kind, meshRoot: 0, boundingBox: null, inactive: null, controllers: [] };
}

// Lobby
//   Table_01
//   Chair_02
// Kitchen
//   Stove
const nodes = [
  node(0, -1, 0, 'Lobby', 'room'),
  node(1, 0, 1, 'Lobby!Table_01', 'mesh'),
  node(2, 0, 1, 'Lobby!Chair_02', 'mesh'),
  node(3, -1, 0, 'Kitchen', 'room'),
  node(4, 3, 1, 'Kitchen!Stove', 'mesh'),
];
const graph = { nodes } as SceneGraphDTO;
const children = childIndex(graph);

describe('outliner rows', () => {
  it('lists only top-level nodes until one is opened', () => {
    const rows = buildTreeRows({ nodes, children, expanded: {}, search: '', sorting: 'None' });
    expect(rows.map((r) => r.label)).toEqual(['Lobby', 'Kitchen']);
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: false });
  });

  it('shows the short name and the children of an opened node', () => {
    const rows = buildTreeRows({ nodes, children, expanded: { 0: true }, search: '', sorting: 'None' });
    expect(rows.map((r) => r.label)).toEqual(['Lobby', 'Table_01', 'Chair_02', 'Kitchen']);
  });

  it('sorts siblings alphabetically', () => {
    const rows = buildTreeRows({ nodes, children, expanded: { 0: true }, search: '', sorting: 'Alpha' });
    expect(rows.map((r) => r.label)).toEqual(['Kitchen', 'Lobby', 'Chair_02', 'Table_01']);
  });

  it('opens the ancestors of search matches and drops everything else', () => {
    const rows = buildTreeRows({ nodes, children, expanded: {}, search: 'stove', sorting: 'None' });
    expect(rows.map((r) => r.index)).toEqual([3, 4]);
  });
});
