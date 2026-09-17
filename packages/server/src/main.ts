import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildApp } from './app';
import { defaultDataDir } from './config/configStore';
import { HttpError } from './http/HttpError';
import { newSessionToken } from './security/sessionToken';
import { VERSION } from './version';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const here = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = path.resolve(here, '../../../apps/editor/dist');

function fail(message: string): never {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['explorer.exe', [url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Couldn't open a browser. Go to ${url}`));
  child.unref();
}

/** Past this size the log is moved to server.log.old at start-up, replacing the older copy. */
const LOG_LIMIT = 5 * 1024 * 1024;

/** The request log, started fresh once it grows past LOG_LIMIT. */
function prepareLog(dataDir: string): string | undefined {
  const file = path.join(dataDir, 'logs', 'server.log');
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file) && statSync(file).size > LOG_LIMIT) renameSync(file, `${file}.old`);
    return file;
  } catch {
    // Logging is a diagnostic aid; the editor works without it.
    return undefined;
  }
}

/**
 * Report a crash on the console and in `<data>/logs/server.log`, so the cause survives the launcher
 * window closing, then exit with an error.
 */
function recordCrashes(dataDir: string): void {
  const crash = (kind: string, err: unknown) => {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const entry = `[${new Date().toISOString()}] ${kind} (server v${VERSION}, node ${process.version})\n${detail}\n\n`;
    console.error(`\nThe editor server crashed (${kind}):\n${detail}\n`);
    try {
      mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
      appendFileSync(path.join(dataDir, 'logs', 'server.log'), entry);
      console.error(`Saved to ${path.join(dataDir, 'logs', 'server.log')}`);
    } catch {
      // The console copy above is all we can do.
    }
    process.exit(1);
  };
  process.on('uncaughtException', (err) => crash('uncaught exception', err));
  process.on('unhandledRejection', (reason) => crash('unhandled promise rejection', reason));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '4757' },
      host: { type: 'string', default: '127.0.0.1' },
      game: { type: 'string' },
      data: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      dev: { type: 'boolean', default: false },
    },
  });

  const dataDir = values.data ?? defaultDataDir();
  recordCrashes(dataDir);

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`--port must be a number from 1 to 65535, got "${values.port}".`);
  }
  if (!LOOPBACK.has(values.host)) {
    fail(
      `--host must be a loopback address (127.0.0.1, localhost or ::1). ` +
        `The editor reads and writes your game files, so it must not be reachable from other machines.`,
    );
  }

  const staticDir = values.dev ? undefined : EDITOR_DIST;
  if (staticDir && !existsSync(path.join(staticDir, 'index.html'))) {
    console.warn(`The editor UI hasn't been built (${staticDir} is missing). Run: pnpm build`);
  }

  let app;
  try {
    app = await buildApp({ port, token: newSessionToken(), staticDir, game: values.game, dataDir: values.data, logFile: prepareLog(dataDir) });
  } catch (err) {
    if (err instanceof HttpError) fail(err.message);
    throw err;
  }
  try {
    await app.listen({ port, host: values.host });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      fail(`Port ${port} is already in use. Is the editor already running? Otherwise pass --port.`);
    }
    throw err;
  }

  const hostPart = values.host === '::1' ? '[::1]' : values.host;
  const url = `http://${hostPart}:${port}/`;
  console.log(`Hitman: Blood Money Editor v${VERSION}`);
  if (values.dev) {
    console.log(`API server on ${url} (open the editor through Vite's URL)`);
  } else {
    console.log(`Editor running at ${url}`);
  }
  if (values.game) console.log(`Game: ${values.game}`);
  if (!values.dev && !values['no-open']) openBrowser(url);

  const shutdown = () => {
    app.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
