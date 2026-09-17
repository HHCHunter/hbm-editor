import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { TOKEN_HEADER } from '@hbm/protocol';

export function newSessionToken(): string {
  return randomBytes(24).toString('hex');
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Require the session token on every state-changing request.
 *
 * The editor page reads the token from GET /api/session. Another site can make the browser
 * send requests here, but it can't read that response (the server sends no CORS headers),
 * so it can't learn the token and forge the header.
 */
export function registerTokenGuard(app: FastifyInstance, token: string): void {
  const expected = Buffer.from(token);
  app.addHook('onRequest', async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    const header = req.headers[TOKEN_HEADER];
    const given = Buffer.from(typeof header === 'string' ? header : '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      reply.code(403).send({ error: 'missing or invalid session token' });
      return reply;
    }
  });
}
