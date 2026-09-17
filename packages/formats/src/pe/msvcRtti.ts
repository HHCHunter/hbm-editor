import { decodeText } from '../binary/text';
import type { PeImage, PeSection } from './PeImage';

// Visual C++ run-time type information, which the retail executable keeps for its polymorphic
// classes. The dword just before a vtable points at a CompleteObjectLocator:
//   +0x00 signature (0)  +0x04 offset of this vtable in the object  +0x08 constructor displacement
//   +0x0C TypeDescriptor*  +0x10 ClassHierarchyDescriptor*
// and a TypeDescriptor is { +0 type_info vftable, +4 spare, +8 ".?AV<name>@@" }.
// The complete-object vtable of a class is the one whose locator has offset 0 and displacement 0.

export interface VtableIndex {
  /** Primary vtable address by class name ("CTimeOutDelete", "RTP::cBase"). */
  byName: ReadonlyMap<string, number>;
  /** Class name by primary vtable address. */
  byVtable: ReadonlyMap<number, string>;
  /**
   * Every base class by name, the class itself first, from the ClassHierarchyDescriptor
   * (+0x08 base count, +0x0C array of BaseClassDescriptor*, each starting with a TypeDescriptor*).
   */
  bases: ReadonlyMap<string, readonly string[]>;
}

/** ".?AVcNode@RTP@@" → "RTP::cNode"; null for templates and anything unexpected. */
export function demangleTypeName(mangled: string): string | null {
  const m = /^\.\?A[VU](.+)@@$/.exec(mangled);
  if (!m || m[1]!.includes('?')) return null;
  return m[1]!.split('@').reverse().join('::');
}

function within(section: PeSection | null, image: PeImage, va: number): boolean {
  if (!section) return false;
  const rva = va - image.imageBase;
  return rva >= section.virtualAddress && rva < section.virtualAddress + Math.max(section.virtualSize, section.rawSize);
}

export function findPrimaryVtables(image: PeImage): VtableIndex {
  const rdata = image.section('.rdata');
  const data = image.section('.data');
  const byName = new Map<string, number>();
  const byVtable = new Map<number, string>();
  const bases = new Map<string, string[]>();
  if (!rdata) return { byName, byVtable, bases };

  const typeName = (descriptor: number | null): string | null => {
    const bytes = descriptor === null ? null : image.cstringAtVa(descriptor + 8, 200);
    return bytes ? demangleTypeName(decodeText(bytes)) : null;
  };

  const start = image.imageBase + rdata.virtualAddress;
  const end = start + Math.min(rdata.rawSize, rdata.virtualSize) - 4;
  const candidates: { vtable: number; typeInfoVftable: number; name: string; hierarchy: number | null }[] = [];
  const vftableVotes = new Map<number, number>();

  for (let at = start; at < end; at += 4) {
    const locator = image.u32AtVa(at);
    if (locator === null || !within(rdata, image, locator)) continue;
    if (image.u32AtVa(locator) !== 0 || image.u32AtVa(locator + 4) !== 0 || image.u32AtVa(locator + 8) !== 0) continue;
    const descriptor = image.u32AtVa(locator + 12);
    if (descriptor === null || !(within(data, image, descriptor) || within(rdata, image, descriptor))) continue;
    const name = typeName(descriptor);
    const typeInfoVftable = image.u32AtVa(descriptor);
    if (!name || typeInfoVftable === null) continue;
    candidates.push({ vtable: at + 4, typeInfoVftable, name, hierarchy: image.u32AtVa(locator + 16) });
    vftableVotes.set(typeInfoVftable, (vftableVotes.get(typeInfoVftable) ?? 0) + 1);
  }

  // Every TypeDescriptor shares type_info's vftable, so the most common value filters out stray matches.
  let typeInfo = 0;
  let best = 0;
  for (const [va, votes] of vftableVotes) {
    if (votes > best) [typeInfo, best] = [va, votes];
  }
  for (const c of candidates) {
    if (c.typeInfoVftable !== typeInfo || byName.has(c.name)) continue;
    byName.set(c.name, c.vtable);
    byVtable.set(c.vtable, c.name);

    const list: string[] = [];
    const count = c.hierarchy === null ? null : image.u32AtVa(c.hierarchy + 8);
    const array = c.hierarchy === null ? null : image.u32AtVa(c.hierarchy + 12);
    if (count !== null && array !== null && count < 64) {
      for (let i = 0; i < count; i++) {
        const baseDescriptor = image.u32AtVa(array + i * 4);
        const baseName = typeName(baseDescriptor === null ? null : image.u32AtVa(baseDescriptor));
        if (baseName) list.push(baseName);
      }
    }
    bases.set(c.name, list.length ? list : [c.name]);
  }
  return { byName, byVtable, bases };
}
