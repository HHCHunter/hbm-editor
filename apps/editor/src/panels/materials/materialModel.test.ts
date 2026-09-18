import { describe, expect, it } from 'vitest';
import type { MaterialPropertyDTO } from '@hbm/protocol';
import { describeRenderState, groupMaterial, textureRef } from './materialModel';

const prop = (kind: string, name: string, fields: MaterialPropertyDTO['fields'] = {}, enabled = true): MaterialPropertyDTO => ({ kind, name, enabled, fields });

const batwall: MaterialPropertyDTO[] = [
  prop('RSTA', 'RenderState', { BENA: [0], ATST: [0], AREF: [254], FENA: [1], CULL: 'DontCare', ZBIA: [0] }),
  prop('TEXT', 'mapDiffuse', { TXID: [528], TILU: 'TILED' }),
  prop('COLO', 'v4DiffuseColor', { VALU: [1, 1, 1, 1] }),
  prop('BOOL', 'BumpEnabled', { VALU: [1] }),
  prop('TEXT', 'mapNormal', { TXID: [529] }),
  prop('FLTV', 'v4BumpScale', { VALU: [0.99, 0.99, 0, 0] }),
  prop('BOOL', 'ReflectionEnabled', { VALU: [0] }),
  prop('TEXT', 'mapEnvironment', { TXID: [0x80000003] }),
  prop('SCRL', '', { SPED: [0, 0] }, false),
  prop('BOOL', 'ScrollEnabled', { VALU: [0] }),
  prop('FLTV', 'somethingNew', { VALU: [3] }),
];

describe('grouping material properties', () => {
  const grouped = groupMaterial(batwall);

  it('groups properties under the features they belong to, in order', () => {
    expect(grouped.features.map((f) => [f.spec.key, f.on])).toEqual([
      ['Base', true],
      ['Bump', true],
      ['Reflection', false],
      ['Scroll', false],
    ]);
    const bump = grouped.features[1]!;
    expect(bump.switches.map((p) => p.name)).toEqual(['BumpEnabled']);
    expect(bump.textures.map((p) => p.name)).toEqual(['mapNormal']);
    expect(bump.values.map((p) => p.name)).toEqual(['v4BumpScale']);
    expect(grouped.features[3]!.values.map((p) => p.kind)).toEqual(['SCRL']);
  });

  it('keeps the render state apart and leaves unknown properties as they are', () => {
    expect(grouped.renderState?.name).toBe('RenderState');
    expect(grouped.other.map((p) => p.name)).toEqual(['somethingNew']);
  });

  it('tells scene textures from textures the engine supplies', () => {
    expect(textureRef(batwall[1]!)).toEqual({ textureId: 528, engineSlot: null });
    expect(textureRef(batwall[7]!)).toEqual({ textureId: null, engineSlot: 3 + 0x22 });
    expect(textureRef(prop('TEXT', 'mapX', { TXID: [0] }))).toEqual({ textureId: null, engineSlot: null });
  });

  it('describes render state in plain words', () => {
    expect(describeRenderState(batwall[0]!)).toEqual(['Opaque', 'Culling: DontCare']);
    expect(describeRenderState(prop('RSTA', 'RenderState', { BENA: [1], BMOD: 'ADD', OPAC: [0.5], ATST: [1], AREF: [127], CULL: 'TwoSided', FENA: [0] }))).toEqual([
      'Blended: ADD, 50%',
      'Alpha test at 127',
      'Two-sided',
      'No fog',
    ]);
  });
});
