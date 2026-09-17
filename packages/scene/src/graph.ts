import {
  bufString,
  computePlacements,
  geomFamily,
  isA,
  readGeomHead,
  type ClassRegistry,
  type GmsImage,
  type PrmFile,
  type PrpSceneProperty,
} from '@hbm/formats';
import type { PrpStream } from './archive';

/** The one class whose GMS prim slot holds something other than a prim (gms.md). */
export const ZLOADER_SEQUENCE_SETUP = 0x0020011b;

export type NodeKind = 'room' | 'group' | 'light' | 'camera' | 'mesh' | 'other';

export interface SceneNode {
  /** The geom index; PRP node index + 1 and GMS geom index are the same object. */
  index: number;
  /** Parent geom index, or -1 under the scene root. */
  parent: number;
  depth: number;
  /** The full name from the .BUF, often a '!'-separated path. */
  name: string;
  typeId: number;
  className: string | null;
  kind: NodeKind;
  /** The .PRM object-header root this geom draws, or 0. */
  meshRoot: number;
  /**
   * Which character of a multi-character model this geom draws (ZLNKOBJ `m_lVariantId`). The
   * engine draws an object of the model when this is 0 or equals the object's `lVariantId`.
   */
  variantId: number;
  refId: number;
  boundingBox: string | number | null;
  inactive: boolean | null;
  controllers: string[];
}

export interface SceneGraph {
  nodes: SceneNode[];
  sceneProperties: PrpSceneProperty[];
  /** 12 numbers per node: row-major 3×3 then translation, world space, engine coordinates. */
  transforms: Float64Array;
  problems: string[];
}

export interface SceneGraphInput {
  gms: GmsImage;
  buf: Uint8Array;
  prp: PrpStream;
  prm: PrmFile;
  /** Class names from the user's executable. Without it, kinds come from type-id families. */
  registry?: ClassRegistry;
}

/** The last segment of a '!'-separated scene path. */
export function leafName(name: string): string {
  const i = name.lastIndexOf('!');
  return i < 0 ? name : name.slice(i + 1);
}

function kindOf(typeId: number, meshRoot: number, registry: ClassRegistry | undefined): NodeKind {
  if (registry?.byTypeId.has(typeId)) {
    if (isA(registry, typeId, 'ZROOM')) return 'room';
    if (isA(registry, typeId, 'ZGROUP')) return 'group';
  }
  const family = geomFamily(typeId);
  if (family === 'light') return 'light';
  if (family === 'camera') return 'camera';
  if (meshRoot) return 'mesh';
  // Unregistered ids fall back to the category bits, which approximate ZGROUP.
  if (!registry?.byTypeId.has(typeId) && family === 'group') return typeId === 0x00100021 ? 'room' : 'group';
  return 'other';
}

/**
 * The variant a geom asks for. ZLNKOBJ registers `m_lVariantId` straight after ZSTDOBJ's
 * `Invisible`, so the value is trusted for that class family. Without class names, it is used
 * only when the model really has an object with that variant.
 */
function variantOf(value: number | null, typeId: number, root: number, prm: PrmFile, registry: ClassRegistry | undefined): number {
  if (!value) return 0;
  if (registry?.byTypeId.has(typeId)) return isA(registry, typeId, 'ZLNKOBJ') ? value : 0;
  const header = prm.objectHeader(root);
  return header && prm.objects(header).some((o) => o.variantId === value) ? value : 0;
}

export function buildSceneGraph({ gms, buf, prp, prm, registry }: SceneGraphInput): SceneGraph {
  const problems = [...gms.problems];
  const { tree, data } = prp;
  const prpMatches = tree.nodes.length - 1 === gms.geoms.length;
  if (!prpMatches) {
    problems.push(`PRP has ${tree.nodes.length} nodes for ${gms.geoms.length} geoms, so properties are left out`);
  }

  let primDisagreements = 0;
  const nodes: SceneNode[] = gms.geoms.map((g) => {
    const prpNode = prpMatches ? tree.nodes[g.index + 1]! : null;
    const head = prpNode ? readGeomHead(data, tree, prpNode.record) : null;

    // The engine builds geoms from the GMS record, then applies the PRP properties, whose Prim goes
    // through ZGEOM::SetPrim. So the PRP value wins; GMS +0x0C is the fallback without a PRP head.
    let prim = g.prim;
    if (head && head.prim !== g.prim) {
      primDisagreements++;
      prim = head.prim;
    }
    const meshRoot = g.typeId !== ZLOADER_SEQUENCE_SETUP && prim && prm.objectHeader(prim) ? prim : 0;

    return {
      index: g.index,
      parent: g.parent,
      depth: g.depth,
      name: bufString(buf, g.nameOffset) ?? '',
      typeId: g.typeId,
      className: registry?.byTypeId.get(g.typeId)?.name ?? null,
      kind: kindOf(g.typeId, meshRoot, registry),
      meshRoot,
      variantId: meshRoot && head ? variantOf(head.afterInvisible, g.typeId, meshRoot, prm, registry) : 0,
      refId: g.refId,
      boundingBox: head?.boundingBox ?? null,
      inactive: head ? head.inactive : null,
      controllers: prpNode ? prpNode.controllers.map((c) => c.name) : [],
    };
  });

  if (primDisagreements) {
    problems.push(`${primDisagreements} geoms name a different prim in the PRP than in the GMS; the PRP value is used`);
  }

  const placements = computePlacements(gms);
  problems.push(...placements.problems);
  return { nodes, sceneProperties: tree.sceneProperties, transforms: placements.transforms, problems };
}
