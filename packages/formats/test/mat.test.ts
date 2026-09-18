import { describe, expect, it } from 'vitest';
import { MatFile, classInfo, colorProperty, materialProperties, readTree, renderState, textureStages } from '../src';
import { makeMat, type MatSpec } from './fixtures/assetBuilders';

const property = (tag: string, name: string, enabled: boolean, extra: MatSpec[] = []): MatSpec => ({
  tag,
  children: [{ tag: 'NAME', text: name }, { tag: 'ENAB', ints: [enabled ? 1 : 0] }, ...extra],
});

const file = makeMat(
  [
    {
      name: 'Standard',
      root: {
        tag: 'CLAS',
        children: [
          { tag: 'NAME', text: 'Standard' },
          {
            tag: 'SUBC',
            children: [
              { tag: 'NAME', text: 'Weighted' },
              { tag: 'OTYP', text: 'Mesh' },
              { tag: 'STYP', text: 'Array' },
              {
                tag: 'LAYE',
                children: [
                  { tag: 'NAME', text: 'Ambient' },
                  { tag: 'TYPE', text: 'FX' },
                  { tag: 'PATH', text: 'Glow' },
                  { tag: 'IDEN', text: 'AmbientMPS' },
                  { tag: 'VALI', text: '' },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
  [
    {
      className: 'Standard',
      classSlot: 1,
      refCount: 3,
      root: {
        tag: 'INST',
        children: [
          { tag: 'NAME', text: 'Characters/Hitman/Hitman_01_Face' },
          {
            tag: 'BIND',
            children: [
              property('TEXT', 'mapDiffuse', true, [{ tag: 'TXID', ints: [548] }, { tag: 'TILU', text: 'TILED' }]),
              property('TEXT', 'mapNormal', false, [{ tag: 'TXID', ints: [0] }]),
              property('TEXT', 'mapEnvironment', true, [{ tag: 'TXID', ints: [0x80000003] }]),
              property('COLO', 'v4DiffuseColor', true, [{ tag: 'VALU', floats: [0.5, 0.25, 1, 1] }]),
              property('RSTA', 'RenderState', true, [
                { tag: 'BENA', ints: [0] },
                { tag: 'ATST', ints: [1] },
                { tag: 'AREF', ints: [127] },
                { tag: 'CULL', text: 'TwoSided' },
              ]),
            ],
          },
        ],
      },
    },
    {
      className: 'Standard',
      classSlot: 1,
      refCount: 1,
      root: {
        tag: 'INST',
        children: [
          { tag: 'NAME', text: 'Characters/_Nude/Eyes_outer' },
          {
            tag: 'BIND',
            children: [
              property('RSTA', 'RenderState', true, [
                { tag: 'BENA', ints: [1] },
                { tag: 'BMOD', text: 'ADD_BEFORE_TRANS' },
                { tag: 'OPAC', floats: [0.5] },
              ]),
            ],
          },
        ],
      },
    },
  ],
);

describe('MatFile', () => {
  const mat = new MatFile(file);

  it('reads classes and materials by instance slot', () => {
    expect(mat.problems).toEqual([]);
    expect(mat.classes.map((c) => c.name)).toEqual(['Standard']);
    expect(mat.bySlot.get(1)).toMatchObject({ className: 'Standard', name: 'Characters/Hitman/Hitman_01_Face', refCount: 3 });
    expect(mat.bySlot.get(2)?.name).toBe('Characters/_Nude/Eyes_outer');
  });

  it('reads values inline for a count of one and through an offset otherwise', () => {
    const colour = mat.children(mat.child(mat.bySlot.get(1)!.root, 'BIND')!).find((p) => p.tag === 'COLO')!;
    const value = mat.child(colour, 'VALU')!;
    expect(value.count).toBe(4);
    expect(mat.floats(value)).toEqual([0.5, 0.25, 1, 1]);
  });

  it('lists texture stages with their enable flag and id kind', () => {
    const stages = textureStages(mat, mat.bySlot.get(1)!);
    expect(stages.map((s) => [s.name, s.enabled, s.textureId, s.engineSlot])).toEqual([
      ['mapDiffuse', true, 548, null],
      ['mapNormal', false, null, null],
      ['mapEnvironment', true, null, 3 + 0x22],
    ]);
    expect(stages[0]!.tileU).toBe('TILED');
  });

  it("applies the engine's blend defaults when blending is off", () => {
    expect(renderState(mat, mat.bySlot.get(1)!)).toMatchObject({
      blendEnabled: false,
      blendMode: null,
      opacity: 1,
      alphaTest: true,
      alphaRef: 127,
      cull: 'TwoSided',
    });
    expect(renderState(mat, mat.bySlot.get(2)!)).toMatchObject({ blendEnabled: true, blendMode: 'ADD_BEFORE_TRANS', opacity: 0.5 });
  });

  it('reads an enabled colour property by name', () => {
    expect(colorProperty(mat, mat.bySlot.get(1)!, 'v4DiffuseColor')).toEqual([0.5, 0.25, 1, 1]);
    expect(colorProperty(mat, mat.bySlot.get(2)!, 'v4DiffuseColor')).toBeNull();
  });

  it('lists every property with its enable flag and other fields', () => {
    const props = materialProperties(mat, mat.bySlot.get(1)!);
    expect(props.map((p) => [p.kind, p.name, p.enabled])).toEqual([
      ['TEXT', 'mapDiffuse', true],
      ['TEXT', 'mapNormal', false],
      ['TEXT', 'mapEnvironment', true],
      ['COLO', 'v4DiffuseColor', true],
      ['RSTA', 'RenderState', true],
    ]);
    expect(props[0]!.fields).toEqual({ TXID: [548], TILU: 'TILED' });
    expect(props[3]!.fields).toEqual({ VALU: [0.5, 0.25, 1, 1] });
    expect(props[4]!.fields).toMatchObject({ ATST: [1], CULL: 'TwoSided' });
  });

  it('describes the class and the shader passes each subclass draws with', () => {
    expect(classInfo(mat, mat.bySlot.get(1)!.classSlot)).toEqual({
      slot: 1,
      name: 'Standard',
      subclasses: [
        {
          name: 'Weighted',
          objectType: 'Mesh',
          storage: 'Array',
          layers: [{ name: 'Ambient', type: 'FX', path: 'Glow', technique: 'AmbientMPS', validation: '' }],
        },
      ],
    });
    expect(classInfo(mat, 99)).toBeNull();
  });

  it('reads the whole node tree, and stops at the node limit', () => {
    const tree = readTree(mat, mat.bySlot.get(2)!.root);
    expect(tree).toMatchObject({ tag: 'INST', type: 'list', children: [{ tag: 'NAME', value: 'Characters/_Nude/Eyes_outer' }, { tag: 'BIND' }] });
    const cut = readTree(mat, mat.bySlot.get(1)!.root, 3);
    const count = (n: { children?: unknown[] }): number => 1 + ((n.children as { children?: unknown[] }[] | undefined) ?? []).reduce((a, c) => a + count(c), 0);
    expect(count(cut)).toBe(3);
  });
});
