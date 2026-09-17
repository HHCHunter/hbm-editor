import { describe, expect, it } from 'vitest';
import { MatFile } from '@hbm/formats';
import { makeMat, type MatSpec } from '@hbm/formats/testing';
import { DRAW_MODE_NOT_A_SURFACE, describeSurface, partHiddenReason } from '../src';

const property = (tag: string, name: string, extra: MatSpec[], enabled = true): MatSpec => ({
  tag,
  children: [{ tag: 'NAME', text: name }, { tag: 'ENAB', ints: [enabled ? 1 : 0] }, ...extra],
});
const texture = (stage: string, id: number, enabled = true) => property('TEXT', stage, [{ tag: 'TXID', ints: [id] }], enabled);
const rsta = (children: MatSpec[]) => property('RSTA', 'RenderState', children);
const material = (name: string, bind: MatSpec[]) => ({
  className: 'Standard',
  classSlot: 1,
  refCount: 1,
  root: { tag: 'INST', children: [{ tag: 'NAME', text: name }, { tag: 'BIND', children: bind }] },
});

const mat = new MatFile(
  makeMat(
    [{ name: 'Standard', root: { tag: 'CLAS', children: [{ tag: 'NAME', text: 'Standard' }] } }],
    [
      material('Walls/Brick', [texture('mapNormal', 90), texture('mapDiffuse', 548)]),
      material('Foliage/Hedge', [texture('mapDiffuse', 12), rsta([{ tag: 'ATST', ints: [1] }, { tag: 'AREF', ints: [127] }, { tag: 'CULL', text: 'TwoSided' }])]),
      material('Characters/_Nude/Eyes_outer', [
        texture('mapDiffuse', 0),
        property('COLO', 'v4DiffuseColor', [{ tag: 'VALU', floats: [0, 0, 0, 1] }]),
        rsta([{ tag: 'BENA', ints: [1] }, { tag: 'BMOD', text: 'ADD_BEFORE_TRANS' }, { tag: 'OPAC', floats: [1] }]),
      ]),
      material('Bad', []),
      material('_Glacier/WorldColi/WC_060_Stone', []),
      material('_Glacier/InsideBound', []),
      material('Props/NormalOnly', [texture('mapNormal', 91)]),
    ],
  ),
);
const surface = (slot: number) => describeSurface(mat, mat.bySlot.get(slot)!);

describe('describeSurface', () => {
  it('shows the diffuse stage, never a normal map, as colour', () => {
    expect(surface(1).diffuseTextureId).toBe(548);
    expect(surface(7).diffuseTextureId).toBeNull();
  });

  it('reads alpha testing and two-sided culling', () => {
    expect(surface(2)).toMatchObject({ alpha: 'mask', alphaCutoff: 127 / 255, doubleSided: true });
    expect(surface(1)).toMatchObject({ alpha: 'opaque', alphaCutoff: null, doubleSided: false });
  });

  it('keeps the base colour and additive blending of an untextured overlay', () => {
    expect(surface(3)).toMatchObject({ alpha: 'blend', additive: true, baseColor: [0, 0, 0, 1], diffuseTextureId: null });
  });

  it('names placeholder, collision and bound materials', () => {
    expect([surface(4), surface(5), surface(6)].map((s) => s.hiddenReason)).toEqual(['placeholder', 'collision', 'bounds']);
    expect(surface(1).hiddenReason).toBeNull();
  });
});

describe('partHiddenReason', () => {
  it('treats the draw-mode bit as collision only on untextured materials', () => {
    expect(partHiddenReason(surface(7), DRAW_MODE_NOT_A_SURFACE)).toBe('collision');
    expect(partHiddenReason(surface(1), DRAW_MODE_NOT_A_SURFACE)).toBeNull();
    expect(partHiddenReason(surface(7), 0x880)).toBeNull();
  });

  it("keeps a material's own reason ahead of the draw-mode bit", () => {
    expect(partHiddenReason(surface(4), DRAW_MODE_NOT_A_SURFACE)).toBe('placeholder');
  });
});
