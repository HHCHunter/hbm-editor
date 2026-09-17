import { decodeText } from '../binary/text';
import type { PeImage } from '../pe/PeImage';
import harvested from './registrations.json';

// Geom classes are registered with ZFactory at start-up. registrations.json holds only numbers,
// collected from the recompilation's reimplemented registration code by
// tools/harvest-classreg.mjs: type id, the virtual addresses of the class and parent name strings,
// and the instance size. The names are read from the user's own HitmanBloodMoney.exe.

export interface ClassRegistration {
  typeId: number;
  nameVa: number;
  parentVa: number;
  size: number;
}

export interface ClassInfo {
  typeId: number;
  name: string;
  parentName: string | null;
  size: number;
}

export interface ClassRegistry {
  byTypeId: ReadonlyMap<number, ClassInfo>;
  byName: ReadonlyMap<string, ClassInfo>;
  /** Registrations whose name didn't resolve to an identifier in this executable. */
  unresolved: ClassRegistration[];
}

export const HARVESTED_REGISTRATIONS: readonly ClassRegistration[] = harvested.registrations;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function readName(exe: PeImage, va: number): string | null {
  const bytes = exe.cstringAtVa(va, 128);
  if (!bytes) return null;
  const name = decodeText(bytes);
  return IDENTIFIER.test(name) ? name : null;
}

export function resolveClassRegistry(
  exe: PeImage,
  registrations: readonly ClassRegistration[] = HARVESTED_REGISTRATIONS,
): ClassRegistry {
  const byTypeId = new Map<number, ClassInfo>();
  const byName = new Map<string, ClassInfo>();
  const unresolved: ClassRegistration[] = [];
  for (const reg of registrations) {
    const name = readName(exe, reg.nameVa);
    if (!name) {
      unresolved.push(reg);
      continue;
    }
    const info: ClassInfo = { typeId: reg.typeId, name, parentName: readName(exe, reg.parentVa), size: reg.size };
    byTypeId.set(reg.typeId, info);
    if (!byName.has(name)) byName.set(name, info);
  }
  return { byTypeId, byName, unresolved };
}

/** True when the class registered for `typeId` is `className` or derives from it. */
export function isA(registry: ClassRegistry, typeId: number, className: string): boolean {
  const seen = new Set<string>();
  for (let info = registry.byTypeId.get(typeId); info && !seen.has(info.name); ) {
    if (info.name === className) return true;
    seen.add(info.name);
    info = info.parentName ? registry.byName.get(info.parentName) : undefined;
  }
  return false;
}

export type GeomFamily = 'drawable' | 'group' | 'light' | 'list' | 'camera' | 'control' | 'shape' | 'unknown';

/**
 * The family encoded in a type id's top 12 bits (gms.md). Only an approximation of the class
 * hierarchy, for ids the registry doesn't know.
 */
export function geomFamily(typeId: number): GeomFamily {
  switch ((typeId & 0xfff00000) >>> 0) {
    case 0x00200000:
      return 'drawable';
    case 0x00100000:
      return 'group';
    case 0x00800000:
      return 'light';
    case 0x08000000:
      return 'list';
    case 0x00400000:
      return 'camera';
    case 0x80100000:
      return 'control';
    case 0x04000000:
      return 'shape';
    default:
      return 'unknown';
  }
}
