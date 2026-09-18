import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { FormatError } from '@hbm/formats';
import { API_VERSION, type ErrorDTO, type HealthDTO, type SessionDTO } from '@hbm/protocol';
import { ConfigStore, defaultDataDir } from './config/configStore';
import { GameService } from './game/GameService';
import { HttpError } from './http/HttpError';
import { registerAnimationRoutes } from './routes/animationRoutes';
import { registerGameRoutes } from './routes/gameRoutes';
import { registerLocRoutes } from './routes/locRoutes';
import { registerMaterialRoutes } from './routes/materialRoutes';
import { registerSceneRoutes } from './routes/sceneRoutes';
import { registerScriptRoutes } from './routes/scriptRoutes';
import { registerHostGuard } from './security/hostGuard';
import { registerTokenGuard } from './security/sessionToken';
import { VERSION } from './version';

export interface AppOptions {
  /** The port the server listens on; the Host guard only accepts this port. */
  port: number;
  token: string;
  /** The built editor to serve at /. Left out in dev, where Vite serves the page. */
  staticDir?: string;
  /** Where settings are kept. Defaults to the `data` folder in the editor's directory. */
  dataDir?: string;
  /** A game install to switch to at start-up, as given to --game. */
  game?: string;
  /** Where warnings and unexpected request errors are appended. Left out, nothing is logged. */
  logFile?: string;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logFile ? { level: 'warn', file: opts.logFile } : false });

  // Hooks run in registration order: Host first, so a rebinding page learns nothing else.
  registerHostGuard(app, opts.port);
  registerTokenGuard(app, opts.token);

  app.setErrorHandler((err, req, reply) => {
    let status = 500;
    let message = err instanceof Error ? err.message : String(err);
    if (err instanceof HttpError) status = err.status;
    else if (err instanceof FormatError) {
      status = 422;
      message = `The game file couldn't be read: ${err.message}`;
    } else if (typeof (err as { statusCode?: number }).statusCode === 'number') {
      status = (err as { statusCode: number }).statusCode;
    } else {
      app.log.error({ err, url: req.url }, 'request failed');
    }
    const body: ErrorDTO = { error: message };
    reply.code(status).send(body);
  });

  const game = await GameService.create(new ConfigStore(opts.dataDir ?? defaultDataDir()));
  if (opts.game) await game.setGame(opts.game);
  app.addHook('onClose', () => game.close());

  app.get('/api/health', async (): Promise<HealthDTO> => ({ ok: true, version: VERSION, apiVersion: API_VERSION }));
  app.get(
    '/api/session',
    async (): Promise<SessionDTO> => ({ token: opts.token, version: VERSION, apiVersion: API_VERSION }),
  );
  registerGameRoutes(app, game);
  registerSceneRoutes(app, game);
  registerLocRoutes(app, game);
  registerScriptRoutes(app, game);
  registerMaterialRoutes(app, game);
  registerAnimationRoutes(app, game);

  if (opts.staticDir && existsSync(opts.staticDir)) {
    await app.register(fastifyStatic, { root: opts.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not found' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not found' }));
  }

  return app;
}
