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

export function buildSceneGraph({ gms, buf, prp, prm, registry }: SceneGraphInput): SceneGraph {
  const problems = [...gms.problems];
  const { tree, data } = prp;
  const prpMatches = tree.nodes.length - 1 === gms.geoms.length;
  if (!prpMatches) {
    problems.push(`PRP has ${tree.nodes.length} nodes for ${gms.geoms.length} geoms, so properties are left out`);
  }

  const nodes: SceneNode[] = gms.geoms.map((g) => {
    const prpNode = prpMatches ? tree.nodes[g.index + 1]! : null;
    const head = prpNode ? readGeomHead(data, tree, prpNode.record) : null;
    const meshRoot = g.typeId !== ZLOADER_SEQUENCE_SETUP && g.prim && prm.objectHeader(g.prim) ? g.prim : 0;
    return {
      index: g.index,
      parent: g.parent,
      depth: g.depth,
      name: bufString(buf, g.nameOffset) ?? '',
      typeId: g.typeId,
      className: registry?.byTypeId.get(g.typeId)?.name ?? null,
      kind: kindOf(g.typeId, meshRoot, registry),
      meshRoot,
      refId: g.refId,
      boundingBox: head?.boundingBox ?? null,
      inactive: head ? head.inactive : null,
      controllers: prpNode ? prpNode.controllers.map((c) => c.name) : [],
    };
  });

  const placements = computePlacements(gms);
  problems.push(...placements.problems);
  return { nodes, sceneProperties: tree.sceneProperties, transforms: placements.transforms, problems };
}
