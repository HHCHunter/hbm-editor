import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StoredConfig {
  gameRoot: string | null;
}

/**
 * Where the editor keeps its settings: the `data` folder in the editor's own directory, beside
 * start.bat. Not .runtime, which is deleted to force a clean reinstall.
 */
export function defaultDataDir(): string {
  const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  return path.join(editorRoot, 'data');
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
