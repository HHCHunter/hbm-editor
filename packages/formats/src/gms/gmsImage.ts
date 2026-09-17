import { u32At } from '../binary/bytes';

/**
 * The number of geoms in an inflated .GMS image. image[+0x00] is the offset of the geom entry
 * table, which starts with its u32 count (CreateGeoms 0x0005F2D0; gms.md).
 */
export function readGeomCount(image: Uint8Array): number {
  return u32At(image, u32At(image, 0));
}
