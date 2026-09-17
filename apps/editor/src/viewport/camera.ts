import type { Vec3 } from '../scene/types';
import type { CameraState } from '../state/store';

/** Half of Editor2's vertical field of view, in radians. */
const HALF_FOV = 0.42;
export const VERTICAL_FOV_DEG = (HALF_FOV * 2 * 180) / Math.PI;

export const MIN_DIST = 4;
export const MAX_DIST = 240;
export const PITCH_LIMIT = 1.45;

export interface CameraBasis {
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The eye position and view axes in engine coordinates, computed the way Editor2 does.
 * The engine is left-handed; the renderer converts by flipping Z.
 */
export function cameraBasis(c: CameraState): CameraBasis {
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const eye = {
    x: c.tx + c.dist * cp * Math.sin(c.yaw),
    y: c.ty + c.dist * sp,
    z: c.tz + c.dist * cp * Math.cos(c.yaw),
  };
  const f = { x: c.tx - eye.x, y: c.ty - eye.y, z: c.tz - eye.z };
  const fl = Math.hypot(f.x, f.y, f.z) || 1;
  const forward = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
  const r = { x: forward.z, y: 0, z: -forward.x };
  const rl = Math.hypot(r.x, r.y, r.z) || 1;
  const right = { x: r.x / rl, y: r.y / rl, z: r.z / rl };
  const up = {
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  };
  return { eye, forward, right, up };
}

/** Left drag: rotate around the target. dx/dy are pointer deltas in pixels. */
export function orbit(c: CameraState, dx: number, dy: number): CameraState {
  return { ...c, yaw: c.yaw - dx * 0.008, pitch: clamp(c.pitch + dy * 0.006, -PITCH_LIMIT, PITCH_LIMIT) };
}

/** Right or Shift drag: slide the target across the view plane. */
export function pan(c: CameraState, dx: number, dy: number): CameraState {
  const { right, up } = cameraBasis(c);
  const k = c.dist * 0.0016;
  return {
    ...c,
    tx: c.tx - (right.x * dx - up.x * dy) * k,
    ty: c.ty - (right.y * dx - up.y * dy) * k,
    tz: c.tz - (right.z * dx - up.z * dy) * k,
  };
}

/** Mouse wheel: move towards or away from the target. */
export function zoom(c: CameraState, deltaY: number): CameraState {
  return { ...c, dist: clamp(c.dist * (deltaY > 0 ? 1.12 : 0.9), MIN_DIST, MAX_DIST) };
}
