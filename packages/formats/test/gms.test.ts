import { describe, expect, it } from 'vitest';
import { bufString, computePlacements, readGms } from '../src';
import { makeGmsImage } from './fixtures/assetBuilders';
import { text } from './fixtures/builders';

/** What the file stores for a rotation: its transpose, with the rows reversed. */
const stored = (r: number[]) => [r[2]!, r[5]!, r[8]!, r[1]!, r[4]!, r[7]!, r[0]!, r[3]!, r[6]!];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** 90° about Y, as a row-major 3×3 acting on column vectors. */
const YAW_90 = [0, 0, 1, 0, 1, 0, -1, 0, 0];

describe('readGms', () => {
  it('replays the depth-first tree from the ascend and has-children bits', () => {
    const gms = readGms(
      makeGmsImage([
        { ascend: 0, hasChildren: true, stored: stored(IDENTITY), translation: [0, 0, 0] },
        { ascend: 0, hasChildren: true, stored: stored(IDENTITY), translation: [0, 0, 0] },
        { ascend: 0, hasChildren: false, stored: stored(IDENTITY), translation: [0, 0, 0] },
        { ascend: 2, hasChildren: false, stored: stored(IDENTITY), translation: [0, 0, 0] },
      ]),
    );
    expect(gms.problems).toEqual([]);
    expect(gms.geoms.map((g) => g.parent)).toEqual([-1, 0, 1, -1]);
    expect(gms.geoms.map((g) => g.depth)).toEqual([0, 1, 2, 0]);
  });

  it('reports a geom that ascends past the root', () => {
    const gms = readGms(makeGmsImage([{ ascend: 1, hasChildren: false, stored: stored(IDENTITY), translation: [0, 0, 0] }]));
    expect(gms.problems[0]).toMatch(/ascends/);
  });
});

describe('computePlacements', () => {
  it('reverses the stored rows and composes parent-local transforms', () => {
    const gms = readGms(
      makeGmsImage([
        { ascend: 0, hasChildren: true, stored: stored(YAW_90), translation: [10, 0, 0] },
        { ascend: 0, hasChildren: false, stored: stored(IDENTITY), translation: [1, 0, 0] },
      ]),
    );
    const { transforms, problems } = computePlacements(gms);
    expect(problems).toEqual([]);
    expect(Array.from(transforms.subarray(0, 12))).toEqual([...YAW_90, 10, 0, 0]);
    // The child's local (1, 0, 0) turns with its parent: world (10, 0, -1).
    expect(Array.from(transforms.subarray(12, 21))).toEqual(YAW_90);
    expect(Array.from(transforms.subarray(21, 24))).toEqual([10, 0, -1]);
  });

  it('turns a stored tilt the way the level needs it', () => {
    // M03_main's Si03G_CeilingA_Big_01 stores these rows. Its vault curves up along local +Z and
    // hangs at y = 30, so local +Z has to end up as world +Y for the ceiling to be overhead.
    const gms = readGms(makeGmsImage([{ ascend: 0, hasChildren: false, stored: [0, 1, 0, 0, 0, -1, 1, 0, 0], translation: [0, 0, 0] }]));
    const r = Array.from(computePlacements(gms).transforms.subarray(0, 9));
    expect([r[2], r[5], r[8]]).toEqual([0, 1, 0]);
  });

  it('treats an all-zero stored matrix as identity', () => {
    const gms = readGms(makeGmsImage([{ ascend: 0, hasChildren: false, stored: new Array(9).fill(0), translation: [0, 0, 0] }]));
    expect(Array.from(computePlacements(gms).transforms.subarray(0, 9))).toEqual(IDENTITY);
  });
});

describe('bufString', () => {
  it('reads a name at a byte offset, and nothing outside the pool', () => {
    const buf = new Uint8Array([...text('0123456789abcdef'), ...text('Hitman\0')]);
    expect(bufString(buf, 16)).toBe('Hitman');
    expect(bufString(buf, 999)).toBeNull();
  });
});
