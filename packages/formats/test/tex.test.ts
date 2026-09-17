import { describe, expect, it } from 'vitest';
import { decodeTexLevel, firstLevelWithData, readTex, texLevelSize } from '../src';
import { makeTex } from './fixtures/assetBuilders';

const bytes = (...values: number[]) => new Uint8Array(values);

/** One DXT1 block: two RGB565 endpoints and 2-bit indices, texel 0 in the low bits. */
function dxt1Block(c0: number, c1: number, indices: number[]): number[] {
  const bits = indices.reduce((acc, index, i) => acc | (index << (2 * i)), 0) >>> 0;
  return [c0 & 0xff, c0 >> 8, c1 & 0xff, c1 >> 8, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, bits >>> 24];
}

const RED_565 = 0xf800;
const BLUE_565 = 0x001f;

describe('readTex', () => {
  const file = makeTex(
    [
      { id: 128, format: 'RGBA', width: 2, height: 1, name: 'Tiles/Floor', levels: [bytes(1, 2, 3, 4, 5, 6, 7, 8), bytes(9, 9, 9, 9)] },
      { id: 200, format: 'DXT1', width: 4, height: 4, flags: 0x0100, levels: [new Uint8Array(dxt1Block(RED_565, BLUE_565, new Array(16).fill(0)))] },
    ],
    { idLists: [{ owner: 200, ids: [128, 200] }], orphanBlocks: [[1, 2, 3]] },
  );
  const tex = readTex(file);

  it('reaches records through the id table', () => {
    expect(tex.problems).toEqual([]);
    expect([...tex.byId.keys()]).toEqual([128, 200]);
    const floor = tex.byId.get(128)!;
    expect(floor).toMatchObject({ format: 'RGBA', width: 2, height: 1, name: 'Tiles/Floor' });
    expect(floor.levels.map((l) => [l.width, l.height, l.size])).toEqual([
      [2, 1, 8],
      [1, 1, 4],
    ]);
    expect(tex.levelCount).toBe(3);
  });

  it('reads T1 id lists and counts bytes no table reaches', () => {
    expect(tex.idLists.get(200)).toEqual([128, 200]);
    expect(tex.unreferencedBytes).toBe(16);
  });

  it('reports a mip whose size disagrees with its format and dimensions', () => {
    const bad = readTex(makeTex([{ id: 130, format: 'I8', width: 4, height: 4, levels: [new Uint8Array(15)] }]));
    expect(bad.problems[0]).toMatch(/mip 0 holds 15 bytes; I8 4×4 needs 16/);
  });

  it('computes block-compressed level sizes from rounded-up block counts', () => {
    expect(texLevelSize('DXT1', 256, 128, 0)).toBe(64 * 32 * 8);
    expect(texLevelSize('DXT3', 256, 128, 8)).toBe(16);
    expect(texLevelSize('U8V8', 5, 3, 1)).toBe(2 * 1 * 2);
  });
});

describe('decodeTexLevel', () => {
  const decode = (spec: Parameters<typeof makeTex>[0][number]) => {
    const tex = readTex(makeTex([spec]));
    const record = tex.byId.get(spec.id)!;
    return decodeTexLevel(tex, record, firstLevelWithData(record)).rgba;
  };

  it('keeps RGBA texels in R, G, B, A byte order', () => {
    expect(Array.from(decode({ id: 1, format: 'RGBA', width: 1, height: 1, levels: [bytes(162, 99, 83, 255)] }))).toEqual([162, 99, 83, 255]);
  });

  it('decodes DXT1 endpoints and the transparent third mode', () => {
    const rgba = decode({
      id: 1,
      format: 'DXT1',
      width: 4,
      height: 4,
      levels: [new Uint8Array(dxt1Block(BLUE_565, RED_565, [0, 1, 2, 3, ...new Array(12).fill(0)]))],
    });
    expect(Array.from(rgba.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(rgba.subarray(4, 8))).toEqual([255, 0, 0, 255]);
    // c0 <= c1 selects three colours plus transparent black.
    expect(Array.from(rgba.subarray(12, 16))).toEqual([0, 0, 0, 0]);
  });

  it('takes DXT3 alpha from the explicit 4-bit plane', () => {
    const alpha = [0x0f, ...new Array(7).fill(0xff)];
    const rgba = decode({ id: 1, format: 'DXT3', width: 4, height: 4, levels: [new Uint8Array([...alpha, ...dxt1Block(RED_565, BLUE_565, new Array(16).fill(0))])] });
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(0);
    expect(Array.from(rgba.subarray(0, 3))).toEqual([255, 0, 0]);
  });

  it('expands I8 to grey and U8V8 to luminance with alpha', () => {
    expect(Array.from(decode({ id: 1, format: 'I8', width: 1, height: 1, levels: [bytes(77)] }))).toEqual([77, 77, 77, 255]);
    expect(Array.from(decode({ id: 1, format: 'U8V8', width: 1, height: 1, levels: [bytes(50, 200)] }))).toEqual([50, 50, 50, 200]);
  });

  it('looks up PALN indices in the RGBA palette', () => {
    const rgba = decode({ id: 1, format: 'PALN', width: 2, height: 1, levels: [bytes(1, 0)], palette: bytes(10, 20, 30, 40, 182, 0, 0, 255) });
    expect(Array.from(rgba)).toEqual([182, 0, 0, 255, 10, 20, 30, 40]);
  });

  it('skips zero-sized top levels when choosing what to show', () => {
    const tex = readTex(makeTex([{ id: 1, format: 'I8', width: 2, height: 2, levels: [new Uint8Array(0), bytes(9)] }]));
    expect(firstLevelWithData(tex.byId.get(1)!)).toBe(1);
  });
});
