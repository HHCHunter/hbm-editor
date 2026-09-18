import type { FastifyInstance } from 'fastify';
import { classInfo, materialProperties, readTree } from '@hbm/formats';
import type { MaterialDetailDTO, MaterialPropertyDTO, MaterialSummaryDTO } from '@hbm/protocol';
import type { GameService } from '../game/GameService';
import { HttpError, requireInt, requireString } from '../http/HttpError';

type Query = Record<string, string | undefined>;

/** Features switched on: "BumpEnabled" with VALU 1 and ENAB set becomes "Bump". */
function featuresOn(properties: readonly MaterialPropertyDTO[]): string[] {
  return properties
    .filter((p) => p.kind === 'BOOL' && p.enabled && /Enabled$/.test(p.name))
    .filter((p) => Array.isArray(p.fields.VALU) && p.fields.VALU[0] !== 0)
    .map((p) => p.name.replace(/Enabled$/, ''));
}

export function registerMaterialRoutes(app: FastifyInstance, game: GameService): void {
  /** Every material in the scene, with the features it switches on and how many objects use it. */
  app.get<{ Querystring: Query }>('/api/scene/materials', async (req): Promise<MaterialSummaryDTO[]> => {
    const id = requireString(req.query, 'scene');
    return game.withScene(id, async (scene) => {
      const [mat, surfaces, users] = await Promise.all([scene.archive.mat(), scene.surfaces(), scene.materialUsers()]);
      return mat.materials.map((material) => {
        const surface = surfaces.get(material.slot);
        return {
          slot: material.slot,
          name: material.name,
          className: material.className,
          refCount: material.refCount,
          users: users.get(material.slot)?.length ?? 0,
          diffuseTextureId: surface?.diffuseTextureId ?? null,
          features: featuresOn(materialProperties(mat, material)),
          hiddenReason: surface?.hiddenReason ?? null,
        };
      });
    });
  });

  /** One material in full: every property, its class and shader passes, its users and its raw tree. */
  app.get<{ Querystring: Query }>('/api/scene/material', async (req): Promise<MaterialDetailDTO> => {
    const id = requireString(req.query, 'scene');
    const slot = requireInt(req.query, 'slot');
    return game.withScene(id, async (scene) => {
      const [mat, surfaces, users] = await Promise.all([scene.archive.mat(), scene.surfaces(), scene.materialUsers()]);
      const material = mat.bySlot.get(slot);
      const surface = surfaces.get(slot);
      if (!material || !surface) throw new HttpError(404, `${id} has no material ${slot}`);
      const classEntry = mat.classes.find((c) => c.slot === material.classSlot);
      return {
        slot,
        name: material.name,
        className: material.className,
        refCount: material.refCount,
        properties: materialProperties(mat, material),
        class: classInfo(mat, material.classSlot),
        users: users.get(slot) ?? [],
        surface,
        raw: readTree(mat, material.root),
        classRaw: classEntry ? readTree(mat, classEntry.root) : null,
      };
    });
  });
}
