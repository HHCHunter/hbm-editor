import { describe, expect, it } from 'vitest';
import { initialEditorState } from '../../state/store';
import { buildTreeRows } from './treeRows';

const { objects, collapsed } = initialEditorState();
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('buildTreeRows', () => {
  it('lists the root first, then children in scene order', () => {
    const rows = buildTreeRows(objects, [], collapsed, '', 'None');
    expect(ids(rows).slice(0, 4)).toEqual(['root', 'inside', 'lobby', 'f1']);
    expect(rows[0]?.isRoot).toBe(true);
  });

  it("hides a collapsed group's children", () => {
    const shut = buildTreeRows(objects, [], collapsed, '', 'None');
    expect(ids(shut)).toContain('stairs');
    expect(ids(shut)).not.toContain('st0');

    const open = buildTreeRows(objects, [], {}, '', 'None');
    expect(ids(open)).toContain('st0');
  });

  it('keeps only matches and their ancestors when searching, opening collapsed groups', () => {
    const rows = buildTreeRows(objects, [], collapsed, 'stepa_03', 'None');
    expect(ids(rows)).toEqual(['root', 'inside', 'lobby', 'stairs', 'st2']);
  });

  it('sorts siblings alphabetically when asked', () => {
    const rows = buildTreeRows(objects, [], collapsed, '', 'Alpha');
    const lights = rows.filter((r) => r.depth === 3 && ['om0', 'chand', 'omc'].includes(r.id));
    expect(ids(lights)).toEqual(['chand', 'om0', 'omc']);
  });

  it('marks selected rows', () => {
    const rows = buildTreeRows(objects, ['globe'], collapsed, '', 'None');
    expect(rows.find((r) => r.id === 'globe')?.selected).toBe(true);
    expect(rows.find((r) => r.id === 'f1')?.selected).toBe(false);
  });
});
