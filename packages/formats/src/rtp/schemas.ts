import type { PeImage } from '../pe/PeImage';
import { findPrimaryVtables, type VtableIndex } from '../pe/msvcRtti';
import { findControllerClasses, type ControllerClass } from './factories';
import { readPropertyChain, type PropertyRecord } from './propertyChain';

/** GetProperties is slot 12 of an RTP::cBase vtable; its body is `mov eax, <ZPropertyInfo>; ret`. */
const GET_PROPERTIES_SLOT = 12;

export interface SchemaLevel {
  /** The class that registered these properties (the least derived one sharing the list). */
  owner: string;
  head: number;
  records: PropertyRecord[];
}

export interface ClassSchema {
  className: string;
  /** Base class first, the order the engine loads them. */
  levels: SchemaLevel[];
}

export interface SchemaRegistry {
  vtables: VtableIndex;
  /** The schema of a class by its RTTI name (geom classes use their registered name, e.g. "ZSTDOBJ"). */
  forClass(className: string): ClassSchema | null;
  /** The schema of a controller by the name scenes store, e.g. "TimeOutDelete". */
  forController(name: string): (ClassSchema & { controller: ControllerClass }) | null;
  controllers(): ReadonlyMap<string, ControllerClass>;
}

export function resolveSchemas(image: PeImage): SchemaRegistry {
  const vtables = findPrimaryVtables(image);

  const headOf = (vtable: number): number | null => {
    const fn = image.u32AtVa(vtable + GET_PROPERTIES_SLOT * 4);
    const body = fn === null ? null : image.bytesAtVa(fn, 6);
    if (!body || body[0] !== 0xb8 || body[5] !== 0xc3) return null;
    return new DataView(body.buffer, body.byteOffset, 6).getUint32(1, true);
  };

  let owners: Map<number, string> | null = null;
  const ownerOf = (head: number): string => {
    if (!owners) {
      owners = new Map();
      for (const [name, vtable] of vtables.byName) {
        const bases = vtables.bases.get(name) ?? [];
        // Only classes deriving from RTP::cBase have a GetProperties slot.
        if (!bases.some((b) => b === 'RTP::cBase')) continue;
        const h = headOf(vtable);
        if (h === null) continue;
        const current = owners.get(h);
        if (!current || (vtables.bases.get(current)?.length ?? 99) > bases.length) owners.set(h, name);
      }
    }
    return owners.get(head) ?? `0x${head.toString(16)}`;
  };

  const cache = new Map<string, ClassSchema | null>();
  const forClass = (className: string): ClassSchema | null => {
    if (cache.has(className)) return cache.get(className)!;
    const vtable = vtables.byName.get(className);
    const head = vtable === undefined ? null : headOf(vtable);
    const schema =
      head === null
        ? null
        : { className, levels: readPropertyChain(image, head).map((l) => ({ owner: ownerOf(l.head), ...l })) };
    cache.set(className, schema);
    return schema;
  };

  let controllerMap: Map<string, ControllerClass> | null = null;
  const controllers = () => (controllerMap ??= findControllerClasses(image, vtables));

  return {
    vtables,
    forClass,
    controllers,
    forController(name) {
      const controller = controllers().get(name);
      const schema = controller ? forClass(controller.className) : null;
      return controller && schema ? { ...schema, controller } : null;
    },
  };
}
