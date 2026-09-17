import { existsSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { Codec, RandomAccess } from '../src';

export interface FileSource extends RandomAccess {
  close(): Promise<void>;
}

export async function openFileSource(file: string): Promise<FileSource> {
  const handle = await open(file, 'r');
  const { size } = await handle.stat();
  return {
    size,
    async read(offset, length) {
      const want = Math.max(0, Math.min(length, size - offset));
      const buffer = new Uint8Array(want);
      const { bytesRead } = await handle.read(buffer, 0, want, offset);
      return bytesRead === want ? buffer : buffer.subarray(0, bytesRead);
    },
    close: () => handle.close(),
  };
}

export const nodeCodec: Codec = {
  inflateRaw(data, size) {
    const out = inflateRawSync(data);
    if (out.length < size) throw new Error(`inflated ${out.length} bytes, expected ${size}`);
    return new Uint8Array(out.buffer, out.byteOffset, size);
  },
};

/** The install folder from the executable, the folder itself, or its Scenes folder. */
export function resolveGameDir(pointer: string | undefined): string | null {
  if (!pointer) return null;
  let dir = path.resolve(pointer.trim().replace(/^"|"$/g, ''));
  if (existsSync(dir) && statSync(dir).isFile()) dir = path.dirname(dir);
  if (path.basename(dir).toLowerCase() === 'scenes') dir = path.dirname(dir);
  return existsSync(path.join(dir, 'Scenes')) ? dir : null;
}
