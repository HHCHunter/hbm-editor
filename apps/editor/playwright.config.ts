import { defineConfig } from '@playwright/test';

const PORT = 4791;

// Runs the built editor against a generated game in the Edge that ships with Windows, so no
// browser download is needed. Build first: pnpm build.
export default defineConfig({
  testDir: 'e2e',
  // *.e2e.ts, so Vitest's *.test / *.spec pattern never picks these up.
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.HBM_E2E_CHANNEL ?? 'msedge',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'pnpm --filter @hbm/server exec tsx scripts/fakeGameServer.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { HBM_E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
