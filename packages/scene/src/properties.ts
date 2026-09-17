import { bindRecord, readRecordTokens, type BoundRecord, type PrpRange, type SchemaRegistry } from '@hbm/formats';
import type { PrpStream } from './archive';

export interface RecordBinding {
  /** The class whose property chain was used, or null when none was found. */
  className: string | null;
  /** Null without a schema; the raw tokens are all there is then. */
  bound: BoundRecord | null;
}

export interface NodeProperties {
  node: RecordBinding;
  controllers: (RecordBinding & { name: string })[];
}

function bind(prp: PrpStream, record: PrpRange, schema: ReturnType<SchemaRegistry['forClass']>): RecordBinding {
  if (!schema) return { className: null, bound: null };
  return { className: schema.className, bound: bindRecord(readRecordTokens(prp.data, prp.tree, record), schema, prp.tree.strings) };
}

/**
 * A geom's record and its controllers' records, bound to the property chains of their classes.
 * `nodeIndex` is the geom index; the PRP node is one further on because of the scene root.
 */
export function bindNodeProperties(prp: PrpStream, nodeIndex: number, className: string | null, schemas: SchemaRegistry): NodeProperties | null {
  const node = prp.tree.nodes[nodeIndex + 1];
  if (!node) return null;
  return {
    node: bind(prp, node.record, className ? schemas.forClass(className) : null),
    controllers: node.controllers.map((c) => ({ name: c.name, ...bind(prp, c.record, schemas.forController(c.name)) })),
  };
}
