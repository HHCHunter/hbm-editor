import type { MatFile, MatMaterial, MatNode } from './mat';

// What a material binds, read the way the engine reads it. Every BIND child carries NAME and ENAB,
// and a disabled property is skipped before the kind dispatch (CreatePropertyBinders, mat.md).

/** The material's BIND properties, disabled ones included. */
export function bindProperties(mat: MatFile, material: MatMaterial): MatNode[] {
  const bind = mat.child(material.root, 'BIND');
  return bind ? mat.children(bind) : [];
}

function isEnabled(mat: MatFile, property: MatNode): boolean {
  const enab = mat.child(property, 'ENAB');
  return enab !== null && mat.ints(enab)[0] !== 0;
}

function optionalText(mat: MatFile, node: MatNode, tag: string): string | null {
  const c = mat.child(node, tag);
  return c ? mat.text(c) : null;
}

export interface MatTextureStage {
  name: string | null;
  enabled: boolean;
  txid: number | null;
  /** The .TEX id when the stage names one: non-zero with the sign bit clear. */
  textureId: number | null;
  /** With the sign bit set the id is an engine surface slot, (txid & 0x7FFFFFFF) + 0x22. */
  engineSlot: number | null;
  tileU: string | null;
  tileV: string | null;
}

export function textureStages(mat: MatFile, material: MatMaterial): MatTextureStage[] {
  return bindProperties(mat, material)
    .filter((p) => p.tag === 'TEXT')
    .map((p) => {
      const txidNode = mat.child(p, 'TXID');
      const txid = txidNode ? mat.ints(txidNode)[0]! : null;
      const surface = txid !== null && txid >= 0x80000000;
      return {
        name: optionalText(mat, p, 'NAME'),
        enabled: isEnabled(mat, p),
        txid,
        textureId: txid && !surface ? txid : null,
        engineSlot: surface ? (txid & 0x7fffffff) + 0x22 : null,
        tileU: optionalText(mat, p, 'TILU'),
        tileV: optionalText(mat, p, 'TILV'),
      };
    });
}

export interface MatRenderState {
  blendEnabled: boolean;
  /** Null unless blending is enabled: the engine stores that default before reading BENA. */
  blendMode: string | null;
  /** 1.0 unless blending is enabled, likewise. */
  opacity: number;
  alphaTest: boolean;
  alphaRef: number | null;
  fogEnabled: boolean | null;
  cull: string | null;
  zBias: number | null;
  zOffset: number | null;
}

/** The enabled RSTA block, or null. All nine children are optional. */
export function renderState(mat: MatFile, material: MatMaterial): MatRenderState | null {
  const rsta = bindProperties(mat, material).find((p) => p.tag === 'RSTA');
  if (!rsta || !isEnabled(mat, rsta)) return null;
  const int = (tag: string) => {
    const c = mat.child(rsta, tag);
    return c ? mat.ints(c)[0]! : null;
  };
  const float = (tag: string) => {
    const c = mat.child(rsta, tag);
    return c ? mat.floats(c)[0]! : null;
  };
  const blendEnabled = (int('BENA') ?? 0) !== 0;
  const fog = int('FENA');
  return {
    blendEnabled,
    blendMode: blendEnabled ? optionalText(mat, rsta, 'BMOD') : null,
    opacity: blendEnabled ? (float('OPAC') ?? 1) : 1,
    alphaTest: (int('ATST') ?? 0) !== 0,
    alphaRef: int('AREF'),
    fogEnabled: fog === null ? null : fog !== 0,
    cull: optionalText(mat, rsta, 'CULL'),
    zBias: int('ZBIA'),
    zOffset: float('ZOFF'),
  };
}

/** An enabled COLO property's value by NAME, e.g. "v4DiffuseColor", as RGBA floats. */
export function colorProperty(mat: MatFile, material: MatMaterial, name: string): number[] | null {
  for (const p of bindProperties(mat, material)) {
    if (p.tag !== 'COLO' || optionalText(mat, p, 'NAME') !== name) continue;
    if (!isEnabled(mat, p)) return null;
    const value = mat.child(p, 'VALU');
    if (!value) return null;
    const v = mat.floats(value);
    return v.length >= 3 ? [v[0]!, v[1]!, v[2]!, v[3] ?? 1] : null;
  }
  return null;
}
