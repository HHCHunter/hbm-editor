// The editor's object model. M0 fills it from the mock scene; M1 maps the real GMS/PRP graph onto it.

export type ObjectClass = '' | 'ZGROUP' | 'ZGEOM' | 'ZLIGHT';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LightParams {
  intensity: number;
  radius: number;
}

export interface SceneObject {
  id: string;
  name: string;
  cls: ObjectClass;
  /** Parent object id; '' for the root. */
  parent: string;
  /** Engine (left-handed) coordinates. */
  pos: Vec3;
  /** Box extents; null for objects that draw nothing (groups, lights). */
  size: Vec3 | null;
  tint: string;
  /** Wireframe colour override. */
  wire: string | null;
  light: LightParams | null;
  hidden: boolean;
  frozen: boolean;
  inactive: boolean;
}

export const ROOT_ID = 'root';
