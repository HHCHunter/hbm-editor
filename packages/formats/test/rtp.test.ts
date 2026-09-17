import { describe, expect, it } from 'vitest';
import {
  PeImage,
  bindRecord,
  demangleTypeName,
  findPrimaryVtables,
  inLevelFiles,
  resolveSchemas,
  type ClassSchema,
  type PrpToken,
  type PrpTokenKind,
} from '../src';
import { PeBuilder, le32, rel32 } from './fixtures/peBuilder';

const IMAGE = 0x00400000;
const va = (rva: number) => IMAGE + rva;

/**
 * An executable with RTTI and property lists for RTP::cBase ← ZGEOM ← ZSTDOBJ and
 * RTP::cBase ← CTimeOutDelete, plus a ZFactory registration of "TimeOutDelete".
 */
function sampleExe() {
  const pe = new PeBuilder(IMAGE);
  const text = pe.section('.text');
  const rdata = pe.section('.rdata');
  const data = pe.section('.data');

  // Type handlers: a dword holding the Load function (only its address matters).
  const handler = (loadRva: number) => rdata.u32(va(loadRva));
  const enumLoad = handler(0x00059920);
  const vec3Load = handler(0x002a32b0);
  const uintLoad = handler(0x002a2ce0);
  const boolLoad = handler(0x002a2a10);
  const floatLoad = handler(0x002a2c50);

  // enum EKind { A = 0, B = 1 }: entries link backwards from the last.
  const kindName = rdata.cstring('EKind');
  const optA = rdata.cstring('KIND_A');
  const optB = rdata.cstring('KIND_B');
  rdata.align();
  const entryA = rdata.u32(0, 0, optA);
  const entryB = rdata.u32(entryA, 1, optB);
  const kindInfo = rdata.u32(entryB, kindName, 4);

  // Property records (cNode + handler, then kind-specific fields) and ZPropertyInfo heads.
  const cBaseHead = data.u32(0, 0, 0);
  const geomUint = data.u32(0, 0, 2, uintLoad, 0x20); // save-only
  const geomVec = data.u32(geomUint, 0, 5, vec3Load, 0, 0, 0, 0); // accessor, 0x20 bytes
  const geomEnum = data.u32(geomVec, 0, 1, enumLoad, 0x10, kindInfo); // member enum, 0x18 bytes
  const geomHead = data.u32(geomEnum, cBaseHead, 0);
  const stdBool = data.u32(0, 0, 3, boolLoad, 0, 0, 0, 0);
  const stdHead = data.u32(stdBool, geomHead, 0);
  const todFloat = data.u32(0, 0, 1, floatLoad, 0x30);
  const todHead = data.u32(todFloat, cBaseHead, 0);

  // RTTI: TypeDescriptors share type_info's vftable; each class lists its bases, itself first.
  const typeInfoVftable = rdata.u32(0);
  const descriptor = (mangled: string) => {
    data.align();
    const at = data.u32(typeInfoVftable, 0);
    data.cstring(mangled);
    return at;
  };
  const td = {
    'RTP::cBase': descriptor('.?AVcBase@RTP@@'),
    ZGEOM: descriptor('.?AVZGEOM@@'),
    ZSTDOBJ: descriptor('.?AVZSTDOBJ@@'),
    CTimeOutDelete: descriptor('.?AVCTimeOutDelete@@'),
  };
  const getProperties = (head: number) => text.bytes([0xb8, ...le32(head), 0xc3, 0xcc, 0xcc]);
  const vtables: Record<string, number> = {};
  const addClass = (name: keyof typeof td, bases: (keyof typeof td)[], head: number) => {
    const baseDescriptors = [name, ...bases].map((b) => rdata.u32(td[b], 0, 0, 0, 0, 0, 0));
    const array = rdata.u32(...baseDescriptors);
    const hierarchy = rdata.u32(0, 0, baseDescriptors.length, array);
    const locator = rdata.u32(0, 0, 0, td[name], hierarchy);
    const fn = getProperties(head);
    rdata.u32(locator);
    vtables[name] = rdata.u32(...Array.from({ length: 12 }, () => 0), fn);
  };
  addClass('RTP::cBase', [], cBaseHead);
  addClass('ZGEOM', ['RTP::cBase'], geomHead);
  addClass('ZSTDOBJ', ['ZGEOM', 'RTP::cBase'], stdHead);
  addClass('CTimeOutDelete', ['RTP::cBase'], todHead);

  // ZFactory: callees, Create stamping the vtable, its thunk, the producer constructor, a registration.
  const [calleeX, calleeY, calleeZ] = [text.bytes([0xc3, 0xcc, 0xcc]), text.bytes([0xc3, 0xcc, 0xcc]), text.bytes([0xc3, 0xcc, 0xcc])];
  const create = text.bytes([0xc7, 0x06, ...le32(vtables.CTimeOutDelete!), 0xc3, 0xcc, 0xcc]);
  const thunk = text.bytes(rel32(0xe9, text.va, create));
  const ctor = text.va;
  text.bytes([0x8b, 0x44, 0x24, 0x08, 0x56, 0x50, 0x8b, 0xf1, 0x8b, 0x4c, 0x24, 0x0c, 0x68, ...le32(thunk), 0x51, 0x8b, 0xce]);
  text.bytes(rel32(0xe8, text.va, calleeX));
  text.bytes([0x56]);
  text.bytes(rel32(0xe8, text.va, calleeY));
  text.bytes([0x8b, 0xc8]);
  text.bytes(rel32(0xe8, text.va, calleeZ));
  text.bytes([0x8b, 0xc6, 0x5e, 0xc2, 0x08, 0x00, 0xcc, 0xcc]);
  const controllerName = rdata.cstring('TimeOutDelete');
  text.bytes([0x68, ...le32(0x00990000), 0x68, ...le32(controllerName), 0xb9, ...le32(0x00990100)]);
  text.bytes(rel32(0xe8, text.va, ctor));

  return new PeImage(pe.build());
}

describe('run-time property schemas', () => {
  const exe = sampleExe();

  it('demangles MSVC type names', () => {
    expect(demangleTypeName('.?AVcNode@RTP@@')).toBe('RTP::cNode');
    expect(demangleTypeName('.?AV?$vector@H@std@@')).toBeNull();
  });

  it('finds primary vtables and base lists from RTTI', () => {
    const index = findPrimaryVtables(exe);
    expect([...index.byName.keys()].sort()).toEqual(['CTimeOutDelete', 'RTP::cBase', 'ZGEOM', 'ZSTDOBJ']);
    expect(index.bases.get('ZSTDOBJ')).toEqual(['ZSTDOBJ', 'ZGEOM', 'RTP::cBase']);
  });

  it('reads a class chain base first, with owners, filters and enum options', () => {
    const schema = resolveSchemas(exe).forClass('ZSTDOBJ')!;
    expect(schema.levels.map((l) => l.owner)).toEqual(['RTP::cBase', 'ZGEOM', 'ZSTDOBJ']);
    const geom = schema.levels[1]!.records;
    expect(geom.map((r) => [r.type?.type, r.filter])).toEqual([
      ['enum', 1],
      ['float32[3]', 5],
      ['uint32', 2],
    ]);
    expect(geom[0]!.enumInfo).toMatchObject({ name: 'EKind', options: [{ name: 'KIND_A', value: 0 }, { name: 'KIND_B', value: 1 }] });
    expect(geom.filter(inLevelFiles)).toHaveLength(2);
  });

  it('maps a registered controller name to its class through ZFactory', () => {
    const schema = resolveSchemas(exe).forController('TimeOutDelete');
    expect(schema?.controller).toMatchObject({ className: 'CTimeOutDelete', nameAgrees: true });
    expect(schema?.levels.at(-1)!.records.map((r) => r.type?.type)).toEqual(['float32']);
  });
});

function tok(kind: PrpTokenKind, value = 0, extra: Partial<PrpToken> = {}): PrpToken {
  return { offset: 0, marker: 0, kind, value, bytes: null, interned: false, ...extra };
}

describe('bindRecord', () => {
  const exe = sampleExe();
  const schema = resolveSchemas(exe).forClass('ZSTDOBJ') as ClassSchema;
  const strings = ['KIND_B'];

  it('binds each level-file property in load order', () => {
    const tokens = [
      tok('enum', 0, { interned: true }),
      tok('beginArray', 3),
      tok('f32', 1),
      tok('f32', 2),
      tok('f32', 3),
      tok('endArray'),
      tok('bool', 1),
    ];
    const bound = bindRecord(tokens, schema, strings);
    expect(bound.mismatch).toBeNull();
    expect(bound.tail).toEqual([]);
    expect(bound.properties.map((p) => [p.owner, p.index, p.type, p.value])).toEqual([
      ['ZGEOM', 1, 'enum', 'KIND_B'],
      ['ZGEOM', 2, 'float32[3]', [1, 2, 3]],
      ['ZSTDOBJ', 3, 'bool', true],
    ]);
  });

  it('keeps tokens after the reflected properties as a tail', () => {
    const tokens = [tok('enum', 0, { interned: true }), tok('skip'), tok('bool', 0), tok('u32', 9)];
    const bound = bindRecord(tokens, schema, strings);
    expect(bound.properties[1]!.value).toBeNull();
    expect(bound.tail.map((t) => t.kind)).toEqual(['u32']);
  });

  it('stops at a token of the wrong shape and reports it', () => {
    const bound = bindRecord([tok('enum', 0, { interned: true }), tok('u32', 1)], schema, strings);
    expect(bound.mismatch).toMatchObject({ index: 2, expected: 'float32[3]', found: 'u32' });
    expect(bound.properties).toHaveLength(1);
    expect(bound.tail).toHaveLength(1);
  });
});
