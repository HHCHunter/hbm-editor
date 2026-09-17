import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA } from '../state/store';
import { MAX_DIST, MIN_DIST, PITCH_LIMIT, cameraBasis, orbit, pan, zoom } from './camera';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  a.x * b.x + a.y * b.y + a.z * b.z;

describe('camera', () => {
  it('places the eye at the orbit distance, looking at the target', () => {
    const b = cameraBasis(DEFAULT_CAMERA);
    const { tx, ty, tz, dist } = DEFAULT_CAMERA;
    expect(Math.hypot(b.eye.x - tx, b.eye.y - ty, b.eye.z - tz)).toBeCloseTo(dist);
    expect(dot(b.forward, b.right)).toBeCloseTo(0);
    expect(dot(b.forward, b.up)).toBeCloseTo(0);
    expect(dot(b.right, b.up)).toBeCloseTo(0);
  });

  it('keeps pitch inside the limit', () => {
    expect(orbit(DEFAULT_CAMERA, 0, 10_000).pitch).toBe(PITCH_LIMIT);
    expect(orbit(DEFAULT_CAMERA, 0, -10_000).pitch).toBe(-PITCH_LIMIT);
  });

  it('keeps zoom inside the distance limits', () => {
    let c = DEFAULT_CAMERA;
    for (let i = 0; i < 100; i++) c = zoom(c, 1);
    expect(c.dist).toBe(MAX_DIST);
    for (let i = 0; i < 100; i++) c = zoom(c, -1);
    expect(c.dist).toBe(MIN_DIST);
  });

  it('pans the target without changing the view direction', () => {
    const moved = pan(DEFAULT_CAMERA, 40, -25);
    expect(moved.tx).not.toBeCloseTo(DEFAULT_CAMERA.tx);
    expect(moved.yaw).toBe(DEFAULT_CAMERA.yaw);
    expect(moved.pitch).toBe(DEFAULT_CAMERA.pitch);
    expect(moved.dist).toBe(DEFAULT_CAMERA.dist);
  });
});
