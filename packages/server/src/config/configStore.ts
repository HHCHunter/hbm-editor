import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface StoredConfig {
  gameRoot: string | null;
}

/** Where the editor keeps its settings: %LOCALAPPDATA%\HBMEditor on Windows. */
export function defaultDataDir(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(homedir(), '.local', 'share');
  return path.join(base, 'HBMEditor');
}

export class ConfigStore {
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private get file(): string {
    return path.join(this.dataDir, 'config.json');
  }

  async read(): Promise<StoredConfig> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredConfig>;
      return { gameRoot: typeof parsed.gameRoot === 'string' ? parsed.gameRoot : null };
    } catch {
      return { gameRoot: null };
    }
  }

  /** Written to a temporary file and renamed, so a killed server never leaves half a file. */
  async write(config: StoredConfig): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, `${JSON.stringify(config, null, 1)}\n`);
    await rename(temp, this.file);
  }
}
