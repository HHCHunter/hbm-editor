import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOKEN_HEADER } from '@hbm/protocol';
import { buildApp } from '../src/app';

const PORT = 4757;
const TOKEN = 'test-token-0123456789abcdef';
const LOCAL = { host: `127.0.0.1:${PORT}` };

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ port: PORT, token: TOKEN });
});

afterAll(async () => {
  await app.close();
});

describe('host guard', () => {
  it('answers requests addressed to its own loopback host', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: LOCAL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('accepts localhost and [::1] on the same port', async () => {
    for (const host of [`localhost:${PORT}`, `[::1]:${PORT}`]) {
      const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
      expect(res.statusCode, host).toBe(200);
    }
  });

  it('rejects a foreign Host header, as sent by a DNS-rebinding page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: `evil.example:${PORT}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain(TOKEN);
  });

  it('rejects loopback on a different port', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: '127.0.0.1:80' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('session token guard', () => {
  it('hands the token to the page', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/session', headers: LOCAL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ token: TOKEN });
  });

  it('rejects a state-changing request without the token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/anything', headers: LOCAL });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a wrong token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/anything',
      headers: { ...LOCAL, [TOKEN_HEADER]: 'nope' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets a request with the right token past both guards', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/anything',
      headers: { ...LOCAL, [TOKEN_HEADER]: TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });
});
