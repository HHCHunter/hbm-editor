import { FormatError } from '../binary/FormatError';
import { MAT_FLOAT, MAT_INT, MAT_LIST, MAT_STRING, type MatFile, type MatMaterial, type MatNode } from './mat';
import { bindProperties } from './materialProps';

// Everything a material says, read generically, for a viewer that shows it all rather than only
// what the renderer uses. Nothing here interprets values; see materialProps.ts for that.

export type MatValue = string | number[] | null;

/** A node's value: text for strings, numbers for ints and floats, null for lists. */
export function nodeValue(mat: MatFile, node: MatNode): MatValue {
  switch (node.type) {
    case MAT_STRING:
      return mat.text(node);
    case MAT_INT:
      return mat.ints(node);
    case MAT_FLOAT:
      return mat.floats(node);
    default:
      return null;
  }
}

export interface MatTreeNode {
  tag: string;
  type: 'float' | 'string' | 'int' | 'list' | 'unknown';
  value: MatValue;
  children?: MatTreeNode[];
}

const TYPE_NAMES = ['float', 'string', 'int', 'list'] as const;

/** The node and everything under it, stopping after `limit` nodes so a corrupt file can't run away. */
export function readTree(mat: MatFile, node: MatNode, limit = 4000): MatTreeNode {
  let left = limit;
  const walk = (n: MatNode): MatTreeNode => {
    left--;
    const out: MatTreeNode = { tag: n.tag, type: TYPE_NAMES[n.type] ?? 'unknown', value: null };
    try {
      out.value = nodeValue(mat, n);
      if (n.type === MAT_LIST) {
        out.children = [];
        for (const child of mat.children(n)) {
          if (left <= 0) break;
          out.children.push(walk(child));
        }
      }
    } catch (err) {
      if (!(err instanceof FormatError)) throw err;
      out.value = null;
    }
    return out;
  };
  return walk(node);
}

/**
 * One BIND property: a named parameter the material hands its shader. `kind` is the property's tag
 * (TEXT, COLO, FLTV, BOOL, SCRL, RSTA, SPRI…); `fields` holds every child but NAME and ENAB.
 */
export interface MatProperty {
  kind: string;
  name: string;
  /** ENAB: the engine skips a disabled property before binding it. */
  enabled: boolean;
  fields: Record<string, MatValue>;
}

export function materialProperties(mat: MatFile, material: MatMaterial): MatProperty[] {
  return bindProperties(mat, material).map((p) => {
    const fields: Record<string, MatValue> = {};
    let name = '';
    let enabled = false;
    if (p.type === MAT_LIST) {
      for (const child of mat.children(p)) {
        const value = nodeValue(mat, child);
        if (child.tag === 'NAME') name = typeof value === 'string' ? value : '';
        else if (child.tag === 'ENAB') enabled = Array.isArray(value) && value[0] !== 0;
        else if (!(child.tag in fields)) fields[child.tag] = value;
      }
    }
    return { kind: p.tag, name, enabled, fields };
  });
}

export interface MatShaderLayer {
  /** The pass, e.g. "Ambient" or "Reflection". */
  name: string;
  type: string;
  /** The effect file, e.g. "Sprite.fx", or an effect family such as "Glow". */
  path: string;
  /** The technique within it. */
  technique: string;
  validation: string;
}

export interface MatSubclass {
  name: string;
  objectType: string;
  storage: string;
  layers: MatShaderLayer[];
}

export interface MatClassInfo {
  slot: number;
  name: string;
  subclasses: MatSubclass[];
}

/** A material class (its template): the subclasses and the shader passes each draws with. */
export function classInfo(mat: MatFile, classSlot: number): MatClassInfo | null {
  const entry = mat.classes.find((c) => c.slot === classSlot);
  if (!entry || entry.root.type !== MAT_LIST) return null;
  const text = (node: MatNode, tag: string) => {
    const c = mat.child(node, tag);
    return c && c.type === MAT_STRING ? mat.text(c) : '';
  };
  const subclasses = mat
    .children(entry.root)
    .filter((n) => n.tag === 'SUBC' && n.type === MAT_LIST)
    .map((sub) => ({
      name: text(sub, 'NAME'),
      objectType: text(sub, 'OTYP'),
      storage: text(sub, 'STYP'),
      layers: mat
        .children(sub)
        .filter((n) => n.tag === 'LAYE' && n.type === MAT_LIST)
        .map((layer) => ({
          name: text(layer, 'NAME'),
          type: text(layer, 'TYPE'),
          path: text(layer, 'PATH'),
          technique: text(layer, 'IDEN'),
          validation: text(layer, 'VALI'),
        })),
    }));
  return { slot: entry.slot, name: entry.className, subclasses };
}
