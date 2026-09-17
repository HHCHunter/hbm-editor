import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  PeImage,
  readScriptCreators,
  resolveClassRegistry,
  resolveSchemas,
  type ClassRegistry,
  type SchemaRegistry,
  type ScriptCreator,
} from '@hbm/formats';
import { nodeCodec, openFileSource, resolveGameDir } from '@hbm/formats/node';
import type { SceneListItemDTO } from '@hbm/protocol';
import { SceneArchive } from '@hbm/scene';
import type { ConfigStore } from '../config/configStore';
import { HttpError } from '../http/HttpError';
import { Once } from '../util/Once';
import { LoadedScene } from './LoadedScene';

export interface SceneFile extends SceneListItemDTO {
  path: string;
}

/** Scenes kept open at once. Each holds its parsed members in memory. */
const OPEN_SCENES = 2;

/** The chosen game install: its scene catalogue, class names and open scenes. */
export class GameService {
  private readonly store: ConfigStore;
  root: string | null = null;
  private readonly catalog = new Once<Map<string, SceneFile>>();
  private readonly exe = new Once<PeImage | null>();
  private readonly registry = new Once<ClassRegistry | null>();
  private readonly schemaRegistry = new Once<SchemaRegistry | null>();
  private readonly scripts = new Map<string, Promise<{ dll: string; creators: ScriptCreator[] } | null>>();
  /** Least recently used first. */
  private readonly open = new Map<string, { scene: Promise<LoadedScene>; users: number; evicted: boolean }>();

  private constructor(store: ConfigStore) {
    this.store = store;
  }

  static async create(store: ConfigStore): Promise<GameService> {
    const service = new GameService(store);
    const { gameRoot } = await store.read();
    // A remembered install that has since moved is forgotten rather than half-used.
    service.root = gameRoot ? resolveGameDir(gameRoot) : null;
    return service;
  }

  get dataDir(): string {
    return this.store.dataDir;
  }

  exePath(): string | null {
    if (!this.root) return null;
    const exe = path.join(this.root, 'HitmanBloodMoney.exe');
    return existsSync(exe) ? exe : null;
  }

  /** Point at an install by its executable, its folder or its Scenes folder, and remember it. */
  async setGame(pointer: string): Promise<string> {
    const root = resolveGameDir(pointer);
    if (!root) {
      throw new HttpError(
        400,
        "That isn't a Hitman: Blood Money install. Choose HitmanBloodMoney.exe, the folder it's in, or its Scenes folder.",
      );
    }
    await this.closeScenes();
    this.root = root;
    this.catalog.clear();
    this.exe.clear();
    this.registry.clear();
    this.schemaRegistry.clear();
    this.scripts.clear();
    await this.store.write({ gameRoot: root });
    return root;
  }

  requireRoot(): string {
    if (!this.root) throw new HttpError(409, 'Choose your Hitman: Blood Money install first.');
    return this.root;
  }

  async scenes(): Promise<Map<string, SceneFile>> {
    const root = this.requireRoot();
    return this.catalog.get(async () => {
      const scenesDir = path.join(root, 'Scenes');
      const files = (await readdir(scenesDir, { recursive: true })).filter((f) => /\.zip$/i.test(f)).sort();
      const catalog = new Map<string, SceneFile>();
      for (const file of files) {
        const id = file.replace(/\\/g, '/').replace(/\.zip$/i, '');
        const slash = id.lastIndexOf('/');
        const full = path.join(scenesDir, file);
        catalog.set(id, { id, group: slash < 0 ? '' : id.slice(0, slash), bytes: (await stat(full)).size, path: full });
      }
      return catalog;
    });
  }

  /** The parsed executable, or null when it's missing or unreadable. */
  private exeImage(): Promise<PeImage | null> {
    return this.exe.get(async () => {
      const exe = this.exePath();
      if (!exe) return null;
      try {
        return new PeImage(new Uint8Array(await readFile(exe)));
      } catch {
        return null;
      }
    });
  }

  /** Class names from the executable, or null when it's missing or unreadable. */
  classRegistry(): Promise<ClassRegistry | null> {
    return this.registry.get(async () => {
      const image = await this.exeImage();
      if (!image) return null;
      const registry = resolveClassRegistry(image);
      return registry.byTypeId.size ? registry : null;
    });
  }

  /** Property chains from the executable, or null when it can't be read. */
  schemas(): Promise<SchemaRegistry | null> {
    return this.schemaRegistry.get(async () => {
      const image = await this.exeImage();
      return image ? resolveSchemas(image) : null;
    });
  }

  /** Script creators of a mission module ("M11", "hideout"), or null when its DLL isn't there. */
  missionScripts(module: string): Promise<{ dll: string; creators: ScriptCreator[] } | null> {
    const key = module.toLowerCase();
    let pending = this.scripts.get(key);
    if (!pending) {
      pending = (async () => {
        const dir = path.join(this.requireRoot(), 'Scriptcs', '_gamerelease');
        if (!existsSync(dir)) return null;
        const file = (await readdir(dir)).find((f) => f.toLowerCase() === `${key}.dll`);
        if (!file) return null;
        try {
          return { dll: file, creators: readScriptCreators(new PeImage(new Uint8Array(await readFile(path.join(dir, file))))) };
        } catch {
          return null;
        }
      })();
      this.scripts.set(key, pending);
      const settled = pending;
      settled.catch(() => {
        if (this.scripts.get(key) === settled) this.scripts.delete(key);
      });
    }
    return pending;
  }

  /**
   * Run `use` with an open scene. `id` must be in the catalogue exactly, so client input never
   * becomes a file path. Scenes past the open limit close once nothing is using them.
   */
  async withScene<T>(id: string, use: (scene: LoadedScene) => Promise<T>): Promise<T> {
    const file = (await this.scenes()).get(id);
    if (!file) throw new HttpError(404, `There's no scene called ${id}`);

    // No await between looking the scene up and registering it: two requests for a scene that
    // isn't open yet must share one file handle, not each open their own.
    let entry = this.open.get(id);
    if (entry) {
      this.open.delete(id);
    } else {
      const scene = (async () => {
        const registry = await this.classRegistry();
        const source = await openFileSource(file.path);
        try {
          const archive = await SceneArchive.open({ source, sceneFileName: `Scenes\\${id.replace(/\//g, '\\')}.ZIP`, codec: nodeCodec });
          return new LoadedScene(id, archive, source, registry);
        } catch (err) {
          await source.close();
          throw err;
        }
      })();
      entry = { scene, users: 0, evicted: false };
      scene.catch(() => this.open.get(id)?.scene === scene && this.open.delete(id));
    }
    this.open.set(id, entry);
    this.evict();

    entry.users++;
    try {
      return await use(await entry.scene);
    } finally {
      entry.users--;
      if (entry.evicted && entry.users === 0) void entry.scene.then((s) => s.close()).catch(() => {});
    }
  }

  private evict(): void {
    while (this.open.size > OPEN_SCENES) {
      const [oldest, entry] = this.open.entries().next().value!;
      this.open.delete(oldest);
      entry.evicted = true;
      if (entry.users === 0) void entry.scene.then((s) => s.close()).catch(() => {});
    }
  }

  private async closeScenes(): Promise<void> {
    const entries = [...this.open.values()];
    this.open.clear();
    for (const entry of entries) {
      entry.evicted = true;
      if (entry.users === 0) await entry.scene.then((s) => s.close()).catch(() => {});
    }
  }

  close(): Promise<void> {
    return this.closeScenes();
  }
}
