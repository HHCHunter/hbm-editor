import { describe, expect, it } from 'vitest';
import { PeImage, readScriptCreators, scriptCreatorKey } from '../src';
import { PeBuilder } from './fixtures/peBuilder';

function sampleDll(): PeImage {
  const pe = new PeBuilder(0x10000000);
  const text = pe.section('.text');
  const rdata = pe.section('.rdata');
  const data = pe.section('.data');

  const init = text.bytes([0xc3]);
  const baseName = rdata.cstring('Alllevels_Basefunc');
  const dogName = rdata.cstring('Alllevels_Dog');
  rdata.align();
  // _SCRIPTCREATOR: +0 name, +4 size, +0x10 base, +0x1C Initialize.
  const base = data.u32(baseName, 64, 0, 0, 0, 0, 0, init);
  const dog = data.u32(dogName, 460, 0, 0, base, 0, 0, init);
  const scripts = data.u32(948, dog, base, 0);
  return new PeImage(pe.exports(new Map([[3, scripts]])).build());
}

describe('mission DLL scripts', () => {
  it('lists the Scripts export creators with their bases', () => {
    expect(readScriptCreators(sampleDll()).map((c) => [c.name, c.size, c.base])).toEqual([
      ['Alllevels_Dog', 460, 'Alllevels_Basefunc'],
      ['Alllevels_Basefunc', 64, null],
    ]);
  });

  it('turns a ScriptName into the creator name it asks for', () => {
    expect(scriptCreatorKey('alllevels\\useable\\useable_ambientub')).toBe('alllevels_useable_useable_ambientub');
    expect(scriptCreatorKey('M11/M11.Bartender')).toBe('m11_m11_bartender');
  });
});
