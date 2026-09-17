import { FormatError } from '../binary/FormatError';
import type { TexFile, TexRecord } from './tex';

export interface DecodedImage {
  width: number;
  height: number;
  /** R, G, B, A bytes per texel, rows top to bottom. */
  rgba: Uint8Array;
}

/** The first mip level that holds data. 705 shipped records have a zero-sized top level. */
export function firstLevelWithData(record: TexRecord): number {
  const index = record.levels.findIndex((l) => l.size > 0);
  return index < 0 ? -1 : index;
}

export function decodeTexLevel(tex: TexFile, record: TexRecord, level: number): DecodedImage {
  const info = record.levels[level];
  if (!info) throw new FormatError(`id ${record.id} has no mip level ${level}`, record.offset);
  const { width, height } = info;
  const src = tex.data.subarray(info.offset, info.offset + info.size);
  const texels = width * height;

  switch (record.format) {
    case 'DXT1':
      return { width, height, rgba: decodeBlocks(src, width, height, false) };
    case 'DXT3':
      return { width, height, rgba: decodeBlocks(src, width, height, true) };
    case 'RGBA':
      // Stored as R, G, B, A bytes (tex.md), not as an A8R8G8B8 dword.
      return { width, height, rgba: src.slice(0, texels * 4) };
    case 'I8': {
      const rgba = new Uint8Array(texels * 4);
      for (let i = 0; i < texels; i++) {
        const l = src[i]!;
        rgba.set([l, l, l, 255], i * 4);
      }
      return { width, height, rgba };
    }
    case 'U8V8': {
      // The loader uploads these as A8L8: luminance in the first byte, alpha in the second.
      const rgba = new Uint8Array(texels * 4);
      for (let i = 0; i < texels; i++) {
        const l = src[i * 2]!;
        rgba.set([l, l, l, src[i * 2 + 1]!], i * 4);
      }
      return { width, height, rgba };
    }
    case 'PALN':
    case 'PALO': {
      const palette = tex.data.subarray(record.paletteOffset, record.paletteOffset + record.paletteCount * 4);
      // PALO adds a full-size opacity plane after the palette; no shipped record uses it.
      const opacity =
        record.format === 'PALO' && level === 0
          ? tex.data.subarray(record.paletteOffset + record.paletteCount * 4)
          : null;
      const rgba = new Uint8Array(texels * 4);
      for (let i = 0; i < texels; i++) {
        const p = src[i]! * 4;
        if (p + 4 <= palette.length) rgba.set(palette.subarray(p, p + 4), i * 4);
        if (opacity) rgba[i * 4 + 3] = opacity[i] ?? 255;
      }
      return { width, height, rgba };
    }
  }
}

function expand565(c: number, out: Uint8Array, o: number): void {
  const r = (c >> 11) & 0x1f;
  const g = (c >> 5) & 0x3f;
  const b = c & 0x1f;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (b << 3) | (b >> 2);
  out[o + 3] = 255;
}

/** BC1 (DXT1) or BC2 (DXT3) blocks to RGBA. */
function decodeBlocks(src: Uint8Array, width: number, height: number, explicitAlpha: boolean): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const blockSize = explicitAlpha ? 16 : 8;
  if (src.length < blocksWide * blocksHigh * blockSize) {
    throw new FormatError(`${blocksWide}×${blocksHigh} blocks need more than ${src.length} bytes`, 0);
  }
  const palette = new Uint8Array(16);

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const block = (by * blocksWide + bx) * blockSize;
      const colour = explicitAlpha ? block + 8 : block;
      const c0 = src[colour]! | (src[colour + 1]! << 8);
      const c1 = src[colour + 2]! | (src[colour + 3]! << 8);
      const bits =
        (src[colour + 4]! | (src[colour + 5]! << 8) | (src[colour + 6]! << 16) | (src[colour + 7]! << 24)) >>> 0;

      expand565(c0, palette, 0);
      expand565(c1, palette, 4);
      if (explicitAlpha || c0 > c1) {
        for (let k = 0; k < 3; k++) {
          palette[8 + k] = Math.round((2 * palette[k]! + palette[4 + k]!) / 3);
          palette[12 + k] = Math.round((palette[k]! + 2 * palette[4 + k]!) / 3);
        }
        palette[11] = 255;
        palette[15] = 255;
      } else {
        // Three colours plus transparent black.
        for (let k = 0; k < 3; k++) palette[8 + k] = (palette[k]! + palette[4 + k]!) >> 1;
        palette[11] = 255;
        palette.fill(0, 12, 16);
      }

      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) break;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) break;
          const i = py * 4 + px;
          const o = (y * width + x) * 4;
          const index = (bits >>> (2 * i)) & 3;
          out.set(palette.subarray(index * 4, index * 4 + 4), o);
          if (explicitAlpha) out[o + 3] = ((src[block + (i >> 1)]! >> ((i & 1) * 4)) & 0xf) * 17;
        }
      }
    }
  }
  return out;
}
