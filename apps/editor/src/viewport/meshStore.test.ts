import { describe, expect, it, vi } from 'vitest';
import { orientTriangles } from './meshStore';

// One triangle in the XY plane: counter-clockwise about +Z.
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const up = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
const down = new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]);

describe('triangle orientation', () => {
  it('keeps triangles that already turn about their normals', () => {
    const indices = new Uint16Array([0, 1, 2]);
    expect(orientTriangles(positions, up, indices)).toBe(indices);
  });

  it('reverses triangles that turn the other way', () => {
    expect([...orientTriangles(positions, down, new Uint16Array([0, 1, 2]))]).toEqual([0, 2, 1]);
  });

  it('leaves meshes without normals alone', () => {
    const indices = new Uint16Array([0, 1, 2]);
    expect(orientTriangles(positions, null, indices)).toBe(indices);
  });
});

vi.mock('../api/endpoints', () => ({
  getMeshPack: vi.fn(),
}));

describe('loading scene meshes', () => {
  it('reports a failed batch and still finishes the others', async () => {
    const { getMeshPack } = await import('../api/endpoints');
    const { loadSceneMeshes, meshPartsOf } = await import('./meshStore');
    const roots = Array.from({ length: 130 }, (_, i) => i + 1);
    vi.mocked(getMeshPack).mockImplementation(async (_scene, batch) => {
      if (batch.includes(65)) throw new Error('broken pack');
      return { parts: [], body: new Uint8Array(0) } as unknown as Awaited<ReturnType<typeof getMeshPack>>;
    });

    const progress: number[] = [];
    const failed: number[][] = [];
    await new Promise<void>((resolve) => {
      const check = (done: number) => {
        progress.push(done);
        if (done === roots.length) resolve();
      };
      loadSceneMeshes(
        'M00',
        roots,
        (_batch, done) => check(done),
        (batch, _err, done) => {
          failed.push(batch);
          check(done);
        },
      );
    });

    expect(progress.at(-1)).toBe(130);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain(65);
    expect(meshPartsOf('M00', 1)).toEqual([]);
    expect(meshPartsOf('M00', 65)).toBeNull();
  });
});
