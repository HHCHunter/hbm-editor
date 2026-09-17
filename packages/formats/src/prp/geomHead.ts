import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';
import { PrpCursor } from './PrpCursor';
import type { PrpRange, PrpTree } from './PrpTree';

/**
 * The 15 properties every geom record starts with (prp.md, "The geom base head"):
 * BoundingBox, Matrix ×9, Position ×3, bInactive, Prim. What follows depends on the class.
 */
export interface PrpGeomHead {
  boundingBox: string | number;
  /** Row-major 3×3 as stored; the rows are serialised in reverse order (determinant −1). */
  matrix: number[];
  position: number[];
  inactive: boolean;
  prim: number;
}

/** Decode a record's geom head, or null when the record doesn't start with one. */
export function readGeomHead(data: Uint8Array, tree: PrpTree, record: PrpRange): PrpGeomHead | null {
  const cursor = new PrpCursor(data, tree.header, record.start);
  try {
    if (cursor.next().kind !== 'beginNode') return null;

    const boundingBox = cursor.next();
    if (boundingBox.kind !== 'enum') return null;
    const matrix = readFloats(cursor, 9);
    const position = matrix && readFloats(cursor, 3);
    if (!matrix || !position) return null;
    const inactive = cursor.next();
    const prim = cursor.next();
    if (inactive.kind !== 'bool' || prim.kind !== 'u32') return null;

    return {
      boundingBox: boundingBox.interned
        ? tree.strings[boundingBox.value]!
        : boundingBox.bytes
          ? decodeText(boundingBox.bytes)
          : boundingBox.value,
      matrix,
      position,
      inactive: inactive.value !== 0,
      prim: prim.value,
    };
  } catch (err) {
    if (err instanceof FormatError) return null;
    throw err;
  }
}

function readFloats(cursor: PrpCursor, count: number): number[] | null {
  const open = cursor.next();
  if (open.kind !== 'beginArray' || open.value !== count) return null;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = cursor.next();
    if (t.kind !== 'f32') return null;
    values.push(t.value);
  }
  return cursor.next().kind === 'endArray' ? values : null;
}
