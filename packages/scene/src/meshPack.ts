import { FormatError, VERTEX_LAYOUTS, decodeVertices, type PrmFile, type VertexLayout } from '@hbm/formats';
import type { MeshPart } from './parts';

// A compact binary form of decoded mesh parts, for sending to the renderer:
//
//   "HBMP"  u32 version  u32 header length  JSON header  padding to 4  body
//
// The header lists each part and the byte range of each attribute in the body. Every array starts
// on a 4-byte boundary so the browser can view it without copying. Positions are engine coordinates.

export const MESH_PACK_VERSION = 1;
const MAGIC = [0x48, 0x42, 0x4d, 0x50];

/** [byte offset into the body, element count]. */
export type PackRange = [number, number];

export interface MeshPackPart {
  root: number;
  object: number;
  materialSlot: number;
  lodMask: number;
  variantId: number;
  drawMode: number;
  vertexCount: number;
  indexCount: number;
  position: PackRange;
  normal: PackRange | null;
  uv: PackRange | null;
  /** R, G, B, A bytes per vertex. */
  color: PackRange;
  /** u16 triangle-list indices. */
  index: PackRange;
}

export interface MeshPack {
  parts: MeshPackPart[];
  body: Uint8Array;
}

const align4 = (n: number) => (n + 3) & ~3;

/** Pack every part that has a known vertex layout. */
export function encodeMeshPack(prm: PrmFile, parts: readonly MeshPart[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let bodyLength = 0;
  const add = (bytes: Uint8Array, count: number): PackRange => {
    const offset = align4(bodyLength);
    if (offset > bodyLength) chunks.push(new Uint8Array(offset - bodyLength));
    chunks.push(bytes);
    bodyLength = offset + bytes.length;
    return [offset, count];
  };
  const view = (a: Float32Array | Uint16Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  const packed: MeshPackPart[] = [];
  for (const part of parts) {
    const layout = part.stride === null ? null : (VERTEX_LAYOUTS as Record<number, VertexLayout>)[part.stride];
    if (!layout) continue;
    const vertices = decodeVertices(prm.vertexBytes(part.subMesh, layout.stride), part.vertexCount, layout);
    const indices = prm.triangleIndices(part.subMesh);
    packed.push({
      root: part.root,
      object: part.object,
      materialSlot: part.materialSlot,
      lodMask: part.lodMask,
      variantId: part.variantId,
      drawMode: part.drawMode,
      vertexCount: part.vertexCount,
      indexCount: indices.length,
      position: add(view(vertices.positions), part.vertexCount),
      normal: vertices.normals ? add(view(vertices.normals), part.vertexCount) : null,
      uv: vertices.uvs ? add(view(vertices.uvs), part.vertexCount) : null,
      color: add(vertices.colors, part.vertexCount),
      index: add(view(indices), indices.length),
    });
  }

  const header = new TextEncoder().encode(JSON.stringify({ parts: packed }));
  const bodyStart = align4(12 + header.length);
  const out = new Uint8Array(bodyStart + bodyLength);
  out.set(MAGIC, 0);
  const v = new DataView(out.buffer);
  v.setUint32(4, MESH_PACK_VERSION, true);
  v.setUint32(8, header.length, true);
  out.set(header, 12);
  let at = bodyStart;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export function decodeMeshPack(bytes: Uint8Array): MeshPack {
  if (bytes.length < 12 || MAGIC.some((b, i) => bytes[i] !== b)) throw new FormatError('not a mesh pack', 0);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = v.getUint32(4, true);
  if (version !== MESH_PACK_VERSION) throw new FormatError(`mesh pack version ${version} isn't supported`, 4);
  const headerLength = v.getUint32(8, true);
  const { parts } = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLength))) as { parts: MeshPackPart[] };
  return { parts, body: bytes.subarray(align4(12 + headerLength)) };
}
