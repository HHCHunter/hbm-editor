import { describe, expect, it } from 'vitest';
import { ByteWriter, CLIP_HUMAN_STATE, CLIP_QUATS, ROOT_TRACK_BONE, readAnm } from '../src';

/** A chunk: type, flags (extent in the low 30 bits), data offset, child count, then body. */
function chunk(type: number, children: Uint8Array[], data: Uint8Array): Uint8Array {
  const kids = children.reduce((n, c) => n + c.length, 0);
  const headerAndKids = (children.length ? 0x10 : 0x08) + kids;
  const extent = headerAndKids + data.length;
  const w = new ByteWriter();
  if (children.length) {
    w.u32(type).u32((0x80000000 | extent) >>> 0).u32(headerAndKids).u32(children.length);
    for (const c of children) w.bytes(c);
  } else {
    w.u32(type).u32(extent);
  }
  w.bytes(data);
  return w.toBytes();
}

function text(...names: string[]): Uint8Array {
  const w = new ByteWriter();
  for (const n of names) w.cstring(n);
  return w.toBytes();
}

function sampleAnm(): Uint8Array {
  const bones = text('PELVIS', 'SPINE');
  const anims = text('anim:Male_Reg/Male_Reg_Idle#Idle', 'anim:Hero/Hero_Wave#Wave');
  const poses = text('Smile');

  // Packed data: clip 1's quat track table (u8 count, u16 ids).
  const data = new ByteWriter().u8(2).u16(0).u16(1).u8(0).toBytes();
  const clip = (w: ByteWriter, frames: number, mask: number, quatOffset: number, groundOffset: number) => {
    w.u16(0x3f).u16(0).u16(frames).u16(25).u32(mask).u32(0).i32(-1).i32(quatOffset).i32(groundOffset);
    w.i32(-1).i32(-1).f32(4).f32(0).f32(0).f32(0).u32(0).i32(-1).u32(0);
  };
  const manager = new ByteWriter();
  manager.u32(2).u32(data.length).u32(bones.length).u32(anims.length).u32(poses.length).u32(2).u32(2).u32(1);
  for (let i = 0; i < 5; i++) manager.u32(0);
  clip(manager, 30, CLIP_HUMAN_STATE, -1, 0);
  clip(manager, 12, CLIP_QUATS, 0, -1);
  manager.bytes(data).bytes(bones).bytes(anims).bytes(poses);

  const collection = chunk(5, [chunk(0x22f, [], new Uint8Array(8))], text('anmcol:animationdatabase#Male_Reg'));
  return chunk(0x004d4e41, [collection, chunk(4, [], manager.toBytes())], new Uint8Array(0));
}

describe('readAnm', () => {
  const anm = readAnm(sampleAnm());

  it('walks the chunk tree to collections and the manager block', () => {
    expect(anm.problems).toEqual([]);
    expect(anm.collections).toEqual(['anmcol:animationdatabase#Male_Reg']);
    expect(anm.boneNames).toEqual(['PELVIS', 'SPINE']);
    expect(anm.poseNames).toEqual(['Smile']);
  });

  it('reads clip headers with names and the bones each animates', () => {
    expect(anm.clips.map((c) => [c.name, c.frames, c.fps, c.boneIds])).toEqual([
      ['anim:Male_Reg/Male_Reg_Idle#Idle', 30, 25, [ROOT_TRACK_BONE]],
      ['anim:Hero/Hero_Wave#Wave', 12, 25, [0, 1]],
    ]);
    expect(anm.clips[0]!.blendFrames).toBe(4);
  });
});
