import { f32At, hex, u16At, u32At, u8At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';

// The mesh pool (prm.md). A 16-byte header, a data heap and a descriptor table; every "pointer"
// stored in a prim struct is a descriptor index, and 0 means none. The struct chain the engine's
// mesh accessors walk (renderprim.cpp; ZPrimControlBase::IsVariantAvailable 0x0006DA50):
//
//   SPrimObjectHeader  lType 7   +0x14 lNumObjects  +0x18 lObjectTable (u32 object indices)
//   SPrimObject                   +0x0C subtype, properties, LOD mask, variant id, ...
//   SPrimMesh          lType 8   +0x28 lSubMeshTable (u32 indices, 0-terminated)  +0x2C lNumFrames
//   SPrimSubMesh                  { u32 lNumVertices, lVertices, lNumIndices, lIndices }

export const PRIM_TYPE = {
  SPRITES: 2,
  OBJECT_HEADER: 7,
  MESH: 8,
  SCATTER: 9,
  WATER_PATCH: 11,
  LIGHT: 12,
} as const;

/** SPrimMeshWeighted's subtype: skinned against a bone palette. */
export const PRIM_SUBTYPE_WEIGHTED = 3;

export interface PrmDescriptor {
  offset: number;
  size: number;
  refCount: number;
}

export interface PrimHeader {
  index: number;
  drawDestination: number;
  packType: number;
  type: number;
  textureId: number;
  drawEntryId: number;
  nextPrim: number;
}

export interface PrimObjectHeader extends PrimHeader {
  propertyFlags: number;
  propertyData: number;
  numObjects: number;
  objectTable: number;
  coliId: number;
  min: [number, number, number];
  max: [number, number, number];
}

export interface PrimObject extends PrimHeader {
  subType: number;
  properties: number;
  /** One bit per LOD level the object draws at; bit 0 is the nearest. */
  lodMask: number;
  /** 0 draws for every variant; otherwise drawn only when the placement asks for this id. */
  variantId: number;
  numInstances: number;
  /** Instance slot in the scene's .MAT. */
  materialId: number;
  coliBits: number;
  wireColor: number;
  drawMode: number;
  transformations: number;
  extraData: number;
  descriptorSize: number;
}

export interface PrimMesh {
  object: PrimObject;
  subMeshTable: number;
  numFrames: number;
  frameStart: number;
  frameStep: number;
  /** SPrimStaticShadowMesh is 0x7C bytes, stored in an 0x80-byte descriptor. */
  staticShadow: boolean;
}

export interface PrimSubMesh {
  mesh: PrimMesh;
  /** Descriptor index of the SPrimSubMesh array, and the record within it. */
  array: number;
  slot: number;
  numVertices: number;
  vertices: number;
  numIndices: number;
  indices: number;
}

const align16 = (n: number) => (n + 15) & ~15;

export class PrmFile {
  readonly data: Uint8Array;
  readonly descriptors: PrmDescriptor[];
  readonly problems: string[] = [];

  constructor(data: Uint8Array) {
    this.data = data;
    const tableOffset = u32At(data, 0);
    const count = u32At(data, 4);
    if (u32At(data, 8) !== tableOffset) this.problems.push('the two descriptor table offsets differ');
    if (u32At(data, 12) !== 0) this.problems.push('header padding is not zero');
    if (tableOffset + count * 16 > data.length) {
      throw new FormatError(`descriptor table (${count} entries) runs past the end`, 0);
    }
    if (tableOffset + count * 16 !== data.length) this.problems.push('descriptor table does not end at the end of the file');

    this.descriptors = [];
    for (let i = 0; i < count; i++) {
      const at = tableOffset + i * 16;
      const d = { offset: u32At(data, at), size: u32At(data, at + 4), refCount: u32At(data, at + 8) };
      if (i > 0 && d.offset + d.size > tableOffset) {
        this.problems.push(`descriptor ${i} runs past the heap`);
        d.size = 0;
      }
      this.descriptors.push(d);
    }

    // The heap should tile from 0x10 to the table in descriptor order of offset.
    const spans = this.descriptors.slice(1).filter((d) => d.size > 0).sort((a, b) => a.offset - b.offset);
    let expected = 0x10;
    let reported = 0;
    for (const d of spans) {
      if (d.offset !== expected && reported++ < 5) {
        this.problems.push(`heap has ${d.offset > expected ? 'a gap' : 'an overlap'} at ${hex(Math.min(d.offset, expected))}`);
      }
      expected = Math.max(expected, align16(d.offset + d.size));
    }
  }

  get count(): number {
    return this.descriptors.length;
  }

  descriptor(index: number): PrmDescriptor | null {
    return index > 0 && index < this.descriptors.length ? this.descriptors[index]! : null;
  }

  /** The descriptor's bytes, or null for index 0 and out-of-range indices. */
  bytes(index: number): Uint8Array | null {
    const d = this.descriptor(index);
    return d ? this.data.subarray(d.offset, d.offset + d.size) : null;
  }

  header(index: number): PrimHeader | null {
    const d = this.descriptor(index);
    if (!d || d.size < 0x0c) return null;
    const o = d.offset;
    return {
      index,
      drawDestination: u8At(this.data, o),
      packType: u8At(this.data, o + 1),
      type: u16At(this.data, o + 2),
      textureId: u16At(this.data, o + 4),
      drawEntryId: u16At(this.data, o + 6),
      nextPrim: u32At(this.data, o + 8),
    };
  }

  objectHeader(index: number): PrimObjectHeader | null {
    const h = this.header(index);
    const d = this.descriptor(index);
    if (!h || !d || h.type !== PRIM_TYPE.OBJECT_HEADER || d.size < 0x3c) return null;
    const o = d.offset;
    const v = (at: number) => f32At(this.data, o + at);
    return {
      ...h,
      propertyFlags: u32At(this.data, o + 0x0c),
      propertyData: u32At(this.data, o + 0x10),
      numObjects: u32At(this.data, o + 0x14),
      objectTable: u32At(this.data, o + 0x18),
      coliId: u32At(this.data, o + 0x1c),
      min: [v(0x20), v(0x24), v(0x28)],
      max: [v(0x2c), v(0x30), v(0x34)],
    };
  }

  /** The objects in a root's object table, as IsVariantAvailable walks it. */
  objects(root: PrimObjectHeader): PrimObject[] {
    const table = this.descriptor(root.objectTable);
    if (!table) return [];
    const n = Math.min(root.numObjects, Math.floor(table.size / 4));
    const out: PrimObject[] = [];
    for (let i = 0; i < n; i++) {
      const object = this.object(u32At(this.data, table.offset + i * 4));
      if (object) out.push(object);
    }
    return out;
  }

  object(index: number): PrimObject | null {
    const h = this.header(index);
    const d = this.descriptor(index);
    if (!h || !d || d.size < 0x28) return null;
    const o = d.offset;
    return {
      ...h,
      subType: u8At(this.data, o + 0x0c),
      properties: u8At(this.data, o + 0x0d),
      lodMask: u8At(this.data, o + 0x0e),
      variantId: u8At(this.data, o + 0x0f),
      numInstances: u8At(this.data, o + 0x10),
      materialId: u16At(this.data, o + 0x12),
      coliBits: u32At(this.data, o + 0x14),
      wireColor: u32At(this.data, o + 0x18),
      drawMode: u32At(this.data, o + 0x1c),
      transformations: u32At(this.data, o + 0x20),
      extraData: u32At(this.data, o + 0x24),
      descriptorSize: d.size,
    };
  }

  mesh(object: PrimObject): PrimMesh | null {
    if (object.type !== PRIM_TYPE.MESH || object.descriptorSize < 0x38) return null;
    const o = this.descriptors[object.index]!.offset;
    return {
      object,
      subMeshTable: u32At(this.data, o + 0x28),
      numFrames: Math.max(1, u32At(this.data, o + 0x2c)),
      frameStart: u16At(this.data, o + 0x30),
      frameStep: u16At(this.data, o + 0x32),
      staticShadow: object.descriptorSize === 0x80,
    };
  }

  /**
   * Every submesh record under a mesh. The table is a 0-terminated list of descriptor indices,
   * each an array of 16-byte SPrimSubMesh records; the engine's accessors use the first record
   * of the first array.
   */
  subMeshes(mesh: PrimMesh): PrimSubMesh[] {
    const table = this.descriptor(mesh.subMeshTable);
    if (!table) return [];
    const out: PrimSubMesh[] = [];
    for (let k = 0; k < Math.floor(table.size / 4); k++) {
      const array = u32At(this.data, table.offset + k * 4);
      if (!array) break;
      const d = this.descriptor(array);
      if (!d) continue;
      for (let slot = 0; slot < Math.floor(d.size / 16); slot++) {
        const at = d.offset + slot * 16;
        const numVertices = u32At(this.data, at);
        const vertices = u32At(this.data, at + 4);
        const numIndices = u32At(this.data, at + 8);
        const indices = u32At(this.data, at + 12);
        if (!(numVertices || vertices || numIndices || indices)) continue;
        out.push({ mesh, array, slot, numVertices, vertices, numIndices, indices });
      }
    }
    return out;
  }

  /** Object-header roots found by shape: an lType 7 record whose object table resolves. */
  findRoots(): number[] {
    const roots: number[] = [];
    for (let i = 1; i < this.descriptors.length; i++) {
      const d = this.descriptors[i]!;
      if (d.size < 0x3c || d.size > 0x40) continue;
      const root = this.objectHeader(i);
      if (!root || root.numObjects === 0) continue;
      const table = this.descriptor(root.objectTable);
      if (!table || table.size < root.numObjects * 4) continue;
      if (this.objects(root).length === root.numObjects) roots.push(i);
    }
    return roots;
  }

  /**
   * A submesh's triangle indices. The block is { u16 list count, then per list u16 n, n indices };
   * shipped lists hold triangles three indices at a time, not strips.
   */
  triangleIndices(sub: PrimSubMesh): Uint16Array {
    const d = this.descriptor(sub.indices);
    if (!d) throw new FormatError('submesh has no index block', 0);
    const lists = u16At(this.data, d.offset);
    let cursor = d.offset + 2;
    let total = 0;
    const parts: { start: number; count: number }[] = [];
    for (let i = 0; i < lists; i++) {
      const count = u16At(this.data, cursor);
      if (cursor + 2 + count * 2 > d.offset + d.size) throw new FormatError('index list runs past its block', cursor);
      parts.push({ start: cursor + 2, count });
      total += count;
      cursor += 2 + count * 2;
    }
    const out = new Uint16Array(total);
    let n = 0;
    for (const p of parts) {
      for (let i = 0; i < p.count; i++) out[n++] = u16At(this.data, p.start + i * 2);
    }
    return out;
  }

  /** The vertex block for all frames of a submesh, cut to `stride` bytes per vertex. */
  vertexBytes(sub: PrimSubMesh, stride: number): Uint8Array {
    const d = this.descriptor(sub.vertices);
    const need = sub.numVertices * sub.mesh.numFrames * stride;
    if (!d || need > d.size) throw new FormatError(`vertex block is smaller than ${need} bytes`, d?.offset ?? 0);
    return this.data.subarray(d.offset, d.offset + need);
  }
}

/** Vertex sizes a block of `blockSize` bytes can hold: align16(vertices × frames × stride) == size. */
export function strideCandidates(numVertices: number, numFrames: number, blockSize: number): number[] {
  const out: number[] = [];
  if (!numVertices || !numFrames) return out;
  for (let stride = 4; stride <= 256; stride += 4) {
    if (align16(numVertices * numFrames * stride) === blockSize) out.push(stride);
  }
  return out;
}
