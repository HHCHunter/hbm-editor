import type { FastifyInstance } from 'fastify';

/** The Host header values this server answers to when listening on `port`. */
export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

/**
 * Reject any request whose Host header isn't this server's own loopback address.
 *
 * Binding to 127.0.0.1 keeps other machines out, but a web page can still reach the server
 * through DNS rebinding: evil.example re-resolves to 127.0.0.1 and the browser treats the
 * response as same-origin. The Host header still says evil.example, which is what this checks.
 */
export function registerHostGuard(app: FastifyInstance, port: number): void {
  const allowed = allowedHosts(port);
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host ?? '').toLowerCase();
    if (!allowed.has(host)) {
      reply.code(403).send({ error: 'forbidden host' });
      return reply;
    }
  });
}
