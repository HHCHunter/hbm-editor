import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { API_VERSION, type HealthDTO, type SessionDTO } from '@hbm/protocol';
import { registerHostGuard } from './security/hostGuard';
import { registerTokenGuard } from './security/sessionToken';
import { VERSION } from './version';

export interface AppOptions {
  /** The port the server listens on; the Host guard only accepts this port. */
  port: number;
  token: string;
  /** The built editor to serve at /. Left out in dev, where Vite serves the page. */
  staticDir?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  // Hooks run in registration order: Host first, so a rebinding page learns nothing else.
  registerHostGuard(app, opts.port);
  registerTokenGuard(app, opts.token);

  app.get(
    '/api/health',
    async (): Promise<HealthDTO> => ({ ok: true, version: VERSION, apiVersion: API_VERSION }),
  );
  app.get(
    '/api/session',
    async (): Promise<SessionDTO> => ({
      token: opts.token,
      version: VERSION,
      apiVersion: API_VERSION,
    }),
  );

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
