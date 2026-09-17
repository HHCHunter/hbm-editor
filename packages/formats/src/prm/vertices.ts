// Vertex layouts as the engine's CPU accessors read them (renderprimstandardd3d.cpp,
// renderprimoldd3d.cpp; vertex-declarations.md, "What the accessors say the layouts are").
// The 16-byte static-shadow layout comes from its vertex declaration.

export interface VertexLayout {
  stride: number;
  name: 'old' | 'standard' | 'weighted' | 'staticShadow';
  position: number;
  /** Packed normals are one D3DCOLOR dword; old-mesh normals are three floats. */
  normal: { offset: number; packed: boolean } | null;
  /** D3DCOLOR dword. */
  color: number;
  uv: number | null;
  blendWeights: number | null;
  blendIndices: number | null;
}

export const VERTEX_LAYOUTS = {
  36: { stride: 36, name: 'old', position: 0, normal: { offset: 12, packed: false }, color: 24, uv: 28, blendWeights: null, blendIndices: null },
  40: { stride: 40, name: 'standard', position: 0, normal: { offset: 12, packed: true }, color: 16, uv: 20, blendWeights: null, blendIndices: null },
  52: { stride: 52, name: 'weighted', position: 0, normal: { offset: 28, packed: true }, color: 32, uv: 36, blendWeights: 12, blendIndices: 24 },
  16: { stride: 16, name: 'staticShadow', position: 0, normal: null, color: 12, uv: null, blendWeights: null, blendIndices: null },
} as const satisfies Record<number, VertexLayout>;

/**
 * The layout a mesh's material class selects (prm.md, "What selects the vertex format"): Old 36,
 * StaticShadow 16, Standard 40, or 52 for a weighted Standard mesh.
 */
export function layoutForMaterialClass(className: string, weighted: boolean): VertexLayout | null {
  switch (className) {
    case 'Standard':
      return weighted ? VERTEX_LAYOUTS[52] : VERTEX_LAYOUTS[40];
    case 'Old':
      return VERTEX_LAYOUTS[36];
    case 'StaticShadow':
      return VERTEX_LAYOUTS[16];
    default:
      return null;
  }
}

const NORMAL_SCALE = Math.fround(2 / 255);

/** The engine's packed-normal decode, sub_0009B8E0: x, y, z bytes at bits 16, 8 and 0. */
export function unpackNormal(packed: number, out: Float32Array, at: number): void {
  out[at] = Math.fround(((packed >>> 16) & 0xff) * NORMAL_SCALE - 1);
  out[at + 1] = Math.fround(((packed >>> 8) & 0xff) * NORMAL_SCALE - 1);
  out[at + 2] = Math.fround((packed & 0xff) * NORMAL_SCALE - 1);
}

export interface DecodedVertices {
  count: number;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  /** R, G, B, A bytes per vertex. */
  colors: Uint8Array;
}

export function decodeVertices(block: Uint8Array, count: number, layout: VertexLayout): DecodedVertices {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const positions = new Float32Array(count * 3);
  const normals = layout.normal ? new Float32Array(count * 3) : null;
  const uvs = layout.uv !== null ? new Float32Array(count * 2) : null;
  const colors = new Uint8Array(count * 4);

  for (let i = 0; i < count; i++) {
    const v = i * layout.stride;
    positions[i * 3] = view.getFloat32(v, true);
    positions[i * 3 + 1] = view.getFloat32(v + 4, true);
    positions[i * 3 + 2] = view.getFloat32(v + 8, true);

    if (normals && layout.normal) {
      const n = v + layout.normal.offset;
      if (layout.normal.packed) {
        unpackNormal(view.getUint32(n, true), normals, i * 3);
      } else {
        normals[i * 3] = view.getFloat32(n, true);
        normals[i * 3 + 1] = view.getFloat32(n + 4, true);
        normals[i * 3 + 2] = view.getFloat32(n + 8, true);
      }
    }

    if (uvs && layout.uv !== null) {
      uvs[i * 2] = view.getFloat32(v + layout.uv, true);
      uvs[i * 2 + 1] = view.getFloat32(v + layout.uv + 4, true);
    }

    // D3DCOLOR is 0xAARRGGBB, so the bytes on disk are B, G, R, A.
    const c = v + layout.color;
    colors[i * 4] = block[c + 2]!;
    colors[i * 4 + 1] = block[c + 1]!;
    colors[i * 4 + 2] = block[c]!;
    colors[i * 4 + 3] = block[c + 3]!;
  }
  return { count, positions, normals, uvs, colors };
}
