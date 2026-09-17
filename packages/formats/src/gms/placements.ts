import type { GmsImage } from './gms';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function det3(m: number[]): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

export interface Placements {
  /**
   * 12 numbers per geom: a row-major 3×3 rotation acting on column vectors, then the translation.
   * World space, in the engine's left-handed coordinates.
   */
  transforms: Float64Array;
  problems: string[];
}

/**
 * World transforms for every geom (gms.md, "The placement transform"). The stored 3×3 has its rows
 * in reverse order, so the local rotation is J·A with J the row exchange; the translation is
 * parent-local; world = parent ∘ local, composed down the pre-order tree.
 */
export function computePlacements(gms: GmsImage): Placements {
  const { image, geoms } = gms;
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const f32 = (offset: number) => view.getFloat32(offset, true);
  const transforms = new Float64Array(geoms.length * 12);
  const problems: string[] = [];

  for (const g of geoms) {
    let r: number[];
    let t: number[];
    if (g.rotationOffset + 36 > image.length || g.translationOffset + 12 > image.length) {
      problems.push(`geom ${g.index}: transform offsets point outside the image`);
      r = IDENTITY;
      t = [0, 0, 0];
    } else {
      const a = (i: number) => f32(g.rotationOffset + 4 * i);
      r = [a(6), a(7), a(8), a(3), a(4), a(5), a(0), a(1), a(2)];
      // A few records store an all-zero matrix; identity keeps their children in place.
      if (Math.abs(det3(r)) < 0.5) r = IDENTITY;
      t = [f32(g.translationOffset), f32(g.translationOffset + 4), f32(g.translationOffset + 8)];
    }

    const out = g.index * 12;
    if (g.parent < 0) {
      transforms.set(r, out);
      transforms.set(t, out + 9);
      continue;
    }
    // Pre-order: the parent's world transform is already computed.
    const p = g.parent * 12;
    for (let row = 0; row < 3; row++) {
      const p0 = transforms[p + row * 3]!;
      const p1 = transforms[p + row * 3 + 1]!;
      const p2 = transforms[p + row * 3 + 2]!;
      for (let col = 0; col < 3; col++) {
        transforms[out + row * 3 + col] = p0 * r[col]! + p1 * r[3 + col]! + p2 * r[6 + col]!;
      }
      transforms[out + 9 + row] = p0 * t[0]! + p1 * t[1]! + p2 * t[2]! + transforms[p + 9 + row]!;
    }
  }
  return { transforms, problems };
}
