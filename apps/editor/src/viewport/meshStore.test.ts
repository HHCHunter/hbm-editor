import { describe, expect, it } from 'vitest';
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
