import type { NodeDetailDTO, PropertyTokenDTO, SceneNodeDTO, SurfaceDTO } from '@hbm/protocol';
import { formatNumber } from '../../state/actions';

/** A read-only property grid row. */
export type PropRow = { kind: 'group'; label: string } | { kind: 'text'; label: string; value: string };

const hex = (n: number, width = 8) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const vec = (values: readonly number[]) => values.map(formatNumber).join(', ');

function tokenValue(token: PropertyTokenDTO): string {
  return typeof token.value === 'number' && !Number.isInteger(token.value) ? formatNumber(token.value) : String(token.value);
}

/** Record tokens, one row each, labelled by position since the stream carries no property names. */
function tokenRows(tokens: readonly PropertyTokenDTO[]): PropRow[] {
  return tokens.map((t, i) => ({ kind: 'text', label: `${i} ${t.kind}`, value: tokenValue(t) }));
}

export function buildPropRows(
  selected: readonly SceneNodeDTO[],
  detail: NodeDetailDTO | null,
  surfaces: Readonly<Record<number, SurfaceDTO>>,
  meshParts: readonly { materialSlot: number }[] | null,
): PropRow[] {
  const rows: PropRow[] = [];

  if (selected.length > 1) {
    rows.push({ kind: 'group', label: `MULTI (${selected.length})` });
    rows.push({ kind: 'text', label: 'Class', value: [...new Set(selected.map((n) => n.className ?? '?'))].join(' / ') });
    return rows;
  }
  const node = selected[0];
  if (!node) return rows;

  rows.push({ kind: 'group', label: node.className ?? `type ${hex(node.typeId)}` });
  rows.push({ kind: 'text', label: 'Index', value: String(node.index) });
  rows.push({ kind: 'text', label: 'Path', value: node.name });
  rows.push({ kind: 'text', label: 'TypeId', value: hex(node.typeId) });
  rows.push({ kind: 'text', label: 'BoundingBox', value: node.boundingBox === null ? '' : String(node.boundingBox) });
  if (node.inactive !== null) rows.push({ kind: 'text', label: 'bInactive', value: node.inactive ? 'true' : 'false' });

  if (!detail || detail.node.index !== node.index) {
    rows.push({ kind: 'group', label: 'Loading…' });
    return rows;
  }

  const t = detail.transform;
  rows.push({ kind: 'group', label: 'World transform' });
  rows.push({ kind: 'text', label: 'Position', value: vec(t.slice(9, 12)) });
  rows.push({ kind: 'text', label: 'Row X', value: vec(t.slice(0, 3)) });
  rows.push({ kind: 'text', label: 'Row Y', value: vec(t.slice(3, 6)) });
  rows.push({ kind: 'text', label: 'Row Z', value: vec(t.slice(6, 9)) });

  const g = detail.gms;
  rows.push({ kind: 'group', label: 'GMS record' });
  rows.push({ kind: 'text', label: 'Record', value: hex(g.recordOffset) });
  rows.push({ kind: 'text', label: 'Prim', value: String(g.prim) });
  rows.push({ kind: 'text', label: 'ControlFlags', value: hex(g.controlFlags) });
  rows.push({ kind: 'text', label: 'RefId', value: String(g.refId) });
  rows.push({ kind: 'text', label: 'AuxCount', value: String(g.auxCount) });
  rows.push({ kind: 'text', label: 'PoolGroup', value: String(g.poolGroup) });

  if (meshParts?.length) {
    rows.push({ kind: 'group', label: `Model ${node.meshRoot}` });
    const slots = [...new Set(meshParts.map((p) => p.materialSlot))];
    for (const slot of slots) {
      const surface = surfaces[slot];
      const extra = surface?.hiddenReason ? ` (${surface.hiddenReason})` : '';
      rows.push({ kind: 'text', label: `Material ${slot}`, value: `${surface?.name ?? '?'}${extra}` });
    }
  }

  rows.push({ kind: 'group', label: 'Properties' });
  rows.push(...tokenRows(detail.properties));
  for (const controller of detail.controllers) {
    rows.push({ kind: 'group', label: controller.name });
    rows.push(...tokenRows(controller.properties));
  }
  return rows;
}
