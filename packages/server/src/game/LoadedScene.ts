import { readSkeleton, type ClassRegistry } from '@hbm/formats';
import type { FileSource } from '@hbm/formats/node';
import {
  buildSceneGraph,
  describeSurface,
  meshParts,
  partHiddenReason,
  type MeshPart,
  type SceneArchive,
  type SceneGraph,
  type Surface,
} from '@hbm/scene';
import type { HiddenReasonDTO, MeshRootDTO } from '@hbm/protocol';
import { Once } from '../util/Once';

/** An open scene archive with its derived data built on first use and kept. */
export class LoadedScene {
  readonly id: string;
  readonly archive: SceneArchive;
  private readonly source: FileSource;
  private readonly registry: ClassRegistry | null;
  private readonly graphOnce = new Once<SceneGraph>();
  private readonly surfacesOnce = new Once<Map<number, Surface>>();
  private readonly rootsOnce = new Once<MeshRootDTO[]>();
  private readonly partsByRoot = new Map<number, MeshPart[]>();

  constructor(id: string, archive: SceneArchive, source: FileSource, registry: ClassRegistry | null) {
    this.id = id;
    this.archive = archive;
    this.source = source;
    this.registry = registry;
  }

  graph(): Promise<SceneGraph> {
    return this.graphOnce.get(async () => {
      const [gms, buf, prp, prm] = await Promise.all([
        this.archive.gms(),
        this.archive.buf(),
        this.archive.prp(),
        this.archive.prm(),
      ]);
      return buildSceneGraph({ gms, buf, prp, prm, registry: this.registry ?? undefined });
    });
  }

  /** Surfaces by material slot. */
  surfaces(): Promise<Map<number, Surface>> {
    return this.surfacesOnce.get(async () => {
      const mat = await this.archive.mat();
      return new Map(mat.materials.map((m) => [m.slot, describeSurface(mat, m)]));
    });
  }

  async parts(root: number): Promise<MeshPart[]> {
    let parts = this.partsByRoot.get(root);
    if (!parts) {
      const [prm, mat] = await Promise.all([this.archive.prm(), this.archive.mat()]);
      parts = meshParts(prm, mat, root);
      this.partsByRoot.set(root, parts);
    }
    return parts;
  }

  /** A summary of every model root the scene places. */
  roots(): Promise<MeshRootDTO[]> {
    return this.rootsOnce.get(async () => {
      const [graph, surfaces, prm] = await Promise.all([this.graph(), this.surfaces(), this.archive.prm()]);
      const roots = [...new Set(graph.nodes.map((n) => n.meshRoot).filter(Boolean))].sort((a, b) => a - b);
      const out: MeshRootDTO[] = [];
      for (const root of roots) {
        const parts = await this.parts(root);
        const variants = new Set<number>();
        const hidden = new Set<HiddenReasonDTO>();
        let lodMask = 0;
        let triangles = 0;
        for (const part of parts) {
          lodMask |= part.lodMask;
          triangles += part.triangleCount;
          variants.add(part.variantId);
          const surface = surfaces.get(part.materialSlot);
          const reason = surface ? partHiddenReason(surface, part.drawMode) : null;
          if (reason) hidden.add(reason);
        }
        out.push({
          root,
          parts: parts.length,
          triangles,
          lodMask,
          variants: [...variants].sort((a, b) => a - b),
          hiddenReasons: [...hidden].sort(),
          weighted: parts.some((p) => p.weighted),
          bones: readSkeleton(prm, root)?.bones.length ?? 0,
        });
      }
      return out;
    });
  }

  close(): Promise<void> {
    return this.source.close();
  }
}
