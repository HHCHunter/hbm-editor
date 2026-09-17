import type { FastifyInstance } from 'fastify';
import type { SceneAnimationsDTO } from '@hbm/protocol';
import { bindNodeProperties } from '@hbm/scene';
import type { GameService } from '../game/GameService';
import { HttpError, requireString } from '../http/HttpError';

type Query = Record<string, string | undefined>;

export function registerAnimationRoutes(app: FastifyInstance, game: GameService): void {
  /** Clip headers and collections from the scene's .ANM, with the objects naming each collection. */
  app.get<{ Querystring: Query }>('/api/scene/animations', async (req): Promise<SceneAnimationsDTO> => {
    const id = requireString(req.query, 'scene');
    const schemas = await game.schemas();
    return game.withScene(id, async (scene) => {
      const anm = await scene.archive.anm();
      if (!anm) throw new HttpError(404, `${id} has no animations`);

      // Characters name their collection in a resource-name property (ZLNKOBJ's, after m_lVariantId).
      const users = new Map<string, number[]>();
      if (schemas) {
        const [graph, prp] = await Promise.all([scene.graph(), scene.archive.prp()]);
        for (const node of graph.nodes) {
          if (!node.meshRoot || !node.className) continue;
          const props = bindNodeProperties(prp, node.index, node.className, schemas);
          for (const p of props?.node.bound?.properties ?? []) {
            if (typeof p.value === 'string' && p.value.startsWith('anmcol:')) users.set(p.value, [...(users.get(p.value) ?? []), node.index]);
          }
        }
      }

      return {
        collections: anm.collections.map((name) => ({ name, users: users.get(name) ?? [] })),
        boneNames: anm.boneNames,
        poseNames: anm.poseNames,
        clips: anm.clips.map(({ index, name, frames, fps, mask, states, blendFrames, boneIds }) => ({
          index,
          name,
          frames,
          fps,
          mask,
          states,
          blendFrames,
          boneIds,
        })),
        problems: anm.problems,
      };
    });
  });
}
