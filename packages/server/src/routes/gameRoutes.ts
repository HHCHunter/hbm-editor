import type { FastifyInstance } from 'fastify';
import type { BrowseDTO, ChooseGameRequest, ClassDTO, ConfigDTO, SceneListItemDTO } from '@hbm/protocol';
import { browse } from '../game/browse';
import type { GameService } from '../game/GameService';
import { HttpError } from '../http/HttpError';

export function registerGameRoutes(app: FastifyInstance, game: GameService): void {
  const config = async (): Promise<ConfigDTO> => ({
    gameRoot: game.root,
    exePath: game.exePath(),
    classNames: game.root ? (await game.classRegistry()) !== null : false,
    dataDir: game.dataDir,
  });

  app.get('/api/config', config);

  app.post<{ Body: ChooseGameRequest }>('/api/config/game', async (req) => {
    const pointer = req.body?.path;
    if (typeof pointer !== 'string' || !pointer.trim()) throw new HttpError(400, 'Send the path to the game as "path".');
    await game.setGame(pointer);
    return config();
  });

  app.get<{ Querystring: { path?: string } }>('/api/browse', async (req): Promise<BrowseDTO> => browse(req.query.path));

  app.get('/api/scenes', async (): Promise<SceneListItemDTO[]> =>
    [...(await game.scenes()).values()].map(({ id, group, bytes }) => ({ id, group, bytes })),
  );

  app.get('/api/classes', async (): Promise<ClassDTO[]> => {
    game.requireRoot();
    const registry = await game.classRegistry();
    if (!registry) return [];
    return [...registry.byTypeId.values()].sort((a, b) => a.typeId - b.typeId);
  });
}
