import type { SceneObject } from '../../scene/types';
import {
  DISPLAY_SCALE,
  formatNumber,
  formatVec,
  setBoundingBox,
  setLightValue,
  setPositionFromText,
  toggleInactive,
} from '../../state/actions';

/** A property grid row. Rows without a handler are shown read-only. */
export type PropRow =
  | { kind: 'group'; label: string }
  | { kind: 'text'; label: string; value: string; onCommit?: (text: string) => boolean }
  | { kind: 'check'; label: string; checked: boolean; onToggle?: () => void }
  | { kind: 'select'; label: string; value: string; options: string[]; onSelect?: (v: string) => void };

export function buildPropRows(selected: readonly SceneObject[]): PropRow[] {
  const rows: PropRow[] = [];

  if (selected.length > 1) {
    rows.push({ kind: 'group', label: `MULTI (${selected.length})` });
    rows.push({ kind: 'text', label: 'Class', value: [...new Set(selected.map((o) => o.cls))].join(' / ') });
    rows.push({ kind: 'text', label: 'BoundingBox', value: 'STATIC' });
    return rows;
  }

  const o = selected[0];
  if (!o) return rows;

  rows.push({ kind: 'group', label: 'ZGEOM' });
  rows.push({
    kind: 'select',
    label: 'BoundingBox',
    value: o.frozen ? 'FROZEN' : 'STATIC',
    options: ['STATIC', 'DYNAMIC', 'FROZEN'],
    onSelect: (v) => setBoundingBox(o.id, v),
  });
  // The mock scene has no rotations.
  rows.push({ kind: 'text', label: 'Matrix', value: '1, 0, 0, 0, 1, 0, 0, 0, 1' });
  rows.push({
    kind: 'text',
    label: 'Position',
    value: formatVec(o.pos),
    onCommit: (text) => setPositionFromText(o.id, text),
  });
  rows.push({ kind: 'check', label: 'bInactive', checked: o.inactive, onToggle: () => toggleInactive(o.id) });

  if (o.cls === 'ZLIGHT' && o.light) {
    rows.push({ kind: 'group', label: 'ZLIGHT' });
    rows.push({ kind: 'check', label: 'Local', checked: true });
    rows.push({ kind: 'check', label: 'ParentBound', checked: false });
    rows.push({
      kind: 'text',
      label: 'Intensity',
      value: String(o.light.intensity),
      onCommit: (text) => setLightValue(o.id, 'intensity', text),
    });
    rows.push({
      kind: 'text',
      label: 'Radius',
      value: String(o.light.radius),
      onCommit: (text) => setLightValue(o.id, 'radius', text),
    });
    rows.push({ kind: 'check', label: 'CastShadows', checked: true });
  } else if (o.cls === 'ZGROUP') {
    rows.push({ kind: 'group', label: 'ZGROUP' });
    rows.push({ kind: 'text', label: 'PFFResMultiplier', value: '1' });
    rows.push({ kind: 'select', label: 'ColMaskOff', value: 'o All', options: ['o All', 'o None', 'o Custom'] });
    rows.push({ kind: 'select', label: 'ResetGroup', value: 'NoReset', options: ['NoReset', 'OnLoad', 'OnEnter'] });
    rows.push({ kind: 'check', label: 'LightShinesIn', checked: true });
    rows.push({ kind: 'check', label: 'LightShinesOut', checked: true });
  } else if (o.size) {
    const size = [o.size.x, o.size.y, o.size.z].map((n) => formatNumber(n * DISPLAY_SCALE)).join(' × ');
    rows.push({ kind: 'group', label: 'ZPRIM' });
    rows.push({ kind: 'text', label: 'Material', value: `mat:${o.name.toLowerCase()}.mat` });
    rows.push({ kind: 'select', label: 'Collision', value: 'Mesh', options: ['Mesh', 'Box', 'None'] });
    rows.push({ kind: 'text', label: 'Size', value: size });
  }

  return rows;
}
