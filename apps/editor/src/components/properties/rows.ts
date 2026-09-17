import type { BoundPropertyDTO, NodeDetailDTO, PropertyTokenDTO, RecordSchemaDTO, SceneNodeDTO, SurfaceDTO } from '@hbm/protocol';
import { formatNumber } from '../../state/actions';

/** A read-only property grid row. */
export type PropRow = { kind: 'group'; label: string } | { kind: 'text'; label: string; value: string; title?: string };

const hex = (n: number, width = 8) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const vec = (values: readonly number[]) => values.map(formatNumber).join(', ');

function tokenValue(token: PropertyTokenDTO): string {
  return typeof token.value === 'number' && !Number.isInteger(token.value) ? formatNumber(token.value) : String(token.value);
}

/** Record tokens, one row each, labelled by position since the stream carries no property names. */
function tokenRows(tokens: readonly PropertyTokenDTO[]): PropRow[] {
  return tokens.map((t, i) => ({ kind: 'text', label: `${i} ${t.kind}`, value: tokenValue(t) }));
}

function propertyValue(p: BoundPropertyDTO): string {
  const v = p.value;
  if (v === null) return '(skipped)';
  if (p.type === 'raw-data') return `${String(v)} bytes`;
  if (Array.isArray(v)) {
    if (!v.length) return '(none)';
    return typeof v[0] === 'number' ? vec(v as number[]) : (v as string[]).join(', ');
  }
  if (typeof v === 'number') return formatNumber(v);
  if (v === '') return '(none)';
  return String(v);
}

/**
 * Typed rows from a record's class chain. The executable has no property names, so each row is
 * labelled by position and type, grouped under the class that registered it.
 */
function schemaRows(schema: RecordSchemaDTO, heading: string | null): PropRow[] {
  const rows: PropRow[] = [];
  let owner: string | null = null;
  for (const p of schema.properties) {
    if (p.owner !== owner) {
      owner = p.owner;
      // The caller has already shown a heading for `heading` itself.
      if (owner !== heading) rows.push({ kind: 'group', label: owner });
    }
    const type = p.enumName ? `${p.type === 'bitfield' ? 'bitfield ' : ''}${p.enumName}` : p.type;
    rows.push({
      kind: 'text',
      label: `#${p.index} ${type}`,
      value: propertyValue(p),
      title: p.options ? `${type}: ${p.options.join(', ')}` : undefined,
    });
  }
  if (schema.tailTokens) rows.push({ kind: 'text', label: 'custom data', value: `${schema.tailTokens} tokens` });
  if (schema.mismatch) rows.push({ kind: 'text', label: 'unread', value: schema.mismatch });
  return rows;
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
    rows.push({ kind: 'text', label: 'Variant', value: node.variantId ? String(node.variantId) : '0 (whole model)' });
    const slots = [...new Set(meshParts.map((p) => p.materialSlot))];
    for (const slot of slots) {
      const surface = surfaces[slot];
      const extra = surface?.hiddenReason ? ` (${surface.hiddenReason})` : '';
      rows.push({ kind: 'text', label: `Material ${slot}`, value: `${surface?.name ?? '?'}${extra}` });
    }
  }

  if (detail.schema?.className && !detail.schema.mismatch) {
    rows.push(...schemaRows(detail.schema, ''));
  } else {
    rows.push({ kind: 'group', label: 'Properties' });
    rows.push(...tokenRows(detail.properties));
  }
  for (const controller of detail.controllers) {
    const schema = controller.schema;
    if (schema?.className && !schema.mismatch) {
      rows.push({ kind: 'group', label: `${controller.name} (${schema.className})` });
      if (controller.scriptCreator) rows.push({ kind: 'text', label: 'script class', value: controller.scriptCreator });
      rows.push(...schemaRows(schema, schema.className));
      if (!schema.properties.length && !schema.tailTokens) rows.push({ kind: 'text', label: 'properties', value: '(none in level files)' });
    } else {
      rows.push({ kind: 'group', label: controller.name });
      rows.push(...tokenRows(controller.properties));
    }
  }
  return rows;
}
