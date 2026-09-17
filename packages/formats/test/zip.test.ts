import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  FormatError,
  bytesSource,
  cacheFileName,
  checkLocalHeader,
  decodeText,
  findMember,
  readMember,
  readZipDirectory,
  unpackChunk,
} from '../src';
import { nodeCodec } from '../scripts/nodeIo';
import { makeZip, text } from './fixtures/builders';

const members = [
  { name: 'Scenes/M01/M01_main.GMS', data: text('geoms '.repeat(40)) },
  { name: 'Scenes/M01/M01_main.PRP', data: text('properties'), method: 0 as const },
];

describe('readZipDirectory', () => {
  it('indexes members with the data offset the engine computes', async () => {
    const dir = await readZipDirectory(bytesSource(makeZip(members)));
    expect(dir.problems).toEqual([]);
    expect(dir.entries.map((e) => e.name)).toEqual(members.map((m) => m.name));
    for (const e of dir.entries) expect(e.dataOffset).toBe(e.localHeaderOffset + 30 + e.name.length);
  });

  it("finds members ignoring case and treating '\\' as '/'", async () => {
    const dir = await readZipDirectory(bytesSource(makeZip(members)));
    expect(findMember(dir, 'SCENES\\m01\\M01_MAIN.gms')?.name).toBe('Scenes/M01/M01_main.GMS');
    expect(findMember(dir, 'Scenes/M01/M01_main.TEX')).toBeUndefined();
  });

  it('reads stored and deflated members', async () => {
    const zip = makeZip(members);
    const src = bytesSource(zip);
    const dir = await readZipDirectory(src);
    for (const [i, e] of dir.entries.entries()) {
      expect(await readMember(src, e, nodeCodec)).toEqual(members[i]!.data);
    }
  });

  it('finds the end record behind an archive comment', async () => {
    const dir = await readZipDirectory(bytesSource(makeZip(members, { comment: 'x'.repeat(300) })));
    expect(dir.entries).toHaveLength(2);
  });

  it("indexes the directory a 'Rune' record points to", async () => {
    const zip = makeZip(members, { runeDirectory: ['Scenes/M01/M01_main.PRP'] });
    const dir = await readZipDirectory(bytesSource(zip));
    expect(dir.usedRuneRecord).toBe(true);
    expect(dir.entries.map((e) => e.name)).toEqual(['Scenes/M01/M01_main.PRP']);
    expect(dir.problems).toEqual([]);
  });

  it('stops at an unexpected signature and reports it', async () => {
    const zip = makeZip(members);
    const good = await readZipDirectory(bytesSource(zip));
    zip.set([0xde, 0xad, 0xbe, 0xef], good.entries[1]!.recordOffset);
    const dir = await readZipDirectory(bytesSource(zip));
    expect(dir.entries).toHaveLength(1);
    expect(dir.problems[0]).toMatch(/unexpected signature/);
  });

  it('flags a local extra field, which moves the data away from where the engine reads', async () => {
    const zip = makeZip([{ ...members[0]!, localExtra: new Uint8Array(4) }]);
    const src = bytesSource(zip);
    const dir = await readZipDirectory(src);
    expect(await checkLocalHeader(src, dir.entries[0]!)).toMatch(/engine reads from/);
  });

  it('throws when there is no end record', async () => {
    await expect(readZipDirectory(bytesSource(new Uint8Array(100)))).rejects.toThrow(FormatError);
  });
});

describe('cacheFileName', () => {
  it("swaps the scene archive's extension for the one requested", () => {
    expect(cacheFileName('Scenes\\M01\\M01_main.ZIP', 'gms')).toBe('Scenes\\M01\\M01_main.gms');
    expect(cacheFileName('Scenes\\M01\\M01_main.zip', 'prp')).toBe('Scenes\\M01\\M01_main.prp');
  });

  it('treats a name without an extension as .gms', () => {
    expect(cacheFileName('Scenes\\M02\\M02_main', 'tex')).toBe('Scenes\\M02\\M02_main.tex');
  });

  it('returns an empty name for anything else, as the engine does', () => {
    expect(cacheFileName('Scenes\\M01\\M01_main.txt', 'gms')).toBe('');
    expect(cacheFileName('M01_main.zip', 'gms')).toBe('');
    expect(cacheFileName('', 'gms')).toBe('');
  });
});

describe('unpackChunk', () => {
  const payload = text('compiled geoms '.repeat(30));

  const chunk = (body: Uint8Array, stored: boolean, size = payload.length) => {
    const out = new Uint8Array(9 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, size, true);
    v.setUint32(4, out.length, true);
    out[8] = stored ? 1 : 0;
    out.set(body, 9);
    return out;
  };

  it('copies a stored payload', () => {
    const result = unpackChunk(chunk(payload, true), nodeCodec);
    expect(decodeText(result.data)).toBe(decodeText(payload));
    expect(result.problems).toEqual([]);
  });

  it('inflates a raw DEFLATE payload with the stray Adler-32 after it', () => {
    const deflated = new Uint8Array(deflateRawSync(payload));
    const withAdler = new Uint8Array([...deflated, 0x12, 0x34, 0x56, 0x78]);
    const result = unpackChunk(chunk(withAdler, false), nodeCodec);
    expect(result.data).toEqual(payload);
  });

  it('reports a header size that disagrees with the member', () => {
    const bytes = chunk(payload, true);
    new DataView(bytes.buffer).setUint32(4, 5, true);
    expect(unpackChunk(bytes, nodeCodec).problems).toHaveLength(1);
  });
});
