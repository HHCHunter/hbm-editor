import { PRIM_SUBTYPE_WEIGHTED, layoutForMaterialClass, type MatFile, type PrmFile, type PrimSubMesh } from '@hbm/formats';

/** One drawable submesh of a model root, with what the renderer needs to filter and shade it. */
export interface MeshPart {
  root: number;
  object: number;
  subMesh: PrimSubMesh;
  materialSlot: number;
  /** Bytes per vertex, from the material class; null when the class selects no known layout. */
  stride: number | null;
  vertexCount: number;
  triangleCount: number;
  /** One bit per LOD level; bit 0 is the nearest. */
  lodMask: number;
  /** 0 draws for every variant. */
  variantId: number;
  drawMode: number;
  weighted: boolean;
  staticShadow: boolean;
  /** Only the first frame of morphing meshes is used. */
  frames: number;
}

/** Every submesh under an object-header root, in object-table order. */
export function meshParts(prm: PrmFile, mat: MatFile, root: number): MeshPart[] {
  const header = prm.objectHeader(root);
  if (!header) return [];
  const parts: MeshPart[] = [];
  for (const object of prm.objects(header)) {
    const mesh = prm.mesh(object);
    if (!mesh) continue;
    const weighted = object.subType === PRIM_SUBTYPE_WEIGHTED;
    const material = mat.bySlot.get(object.materialId);
    const layout = material ? layoutForMaterialClass(material.className, weighted) : null;
    for (const subMesh of prm.subMeshes(mesh)) {
      parts.push({
        root,
        object: object.index,
        subMesh,
        materialSlot: object.materialId,
        stride: layout?.stride ?? null,
        vertexCount: subMesh.numVertices,
        triangleCount: Math.floor(prm.triangleIndices(subMesh).length / 3),
        lodMask: object.lodMask,
        variantId: object.variantId,
        drawMode: object.drawMode,
        weighted,
        staticShadow: mesh.staticShadow,
        frames: mesh.numFrames,
      });
    }
  }
  return parts;
}

/** The LOD levels a mask draws at, nearest first. */
export function lodLevels(mask: number): number[] {
  const levels: number[] = [];
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) levels.push(i);
  return levels;
}
