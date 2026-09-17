import {
  FormatError,
  LocDatabase,
  MatFile,
  PrmFile,
  cacheFileName,
  findMember,
  readGms,
  readMember,
  readAnm,
  readPrpTree,
  readTex,
  type AnmFile,
  readZipDirectory,
  unpackChunk,
  type Codec,
  type GmsImage,
  type PrpTree,
  type RandomAccess,
  type TexFile,
  type ZipDirectory,
  type ZipEntry,
} from '@hbm/formats';

export interface SceneArchiveOptions {
  source: RandomAccess;
  /** The scene's file name as the engine knows it, e.g. "Scenes\M03\M03_main.ZIP". */
  sceneFileName: string;
  codec: Codec;
}

export interface PrpStream {
  data: Uint8Array;
  tree: PrpTree;
}

/** One scene archive. Members are read and parsed on first use, then kept. */
export class SceneArchive {
  readonly directory: ZipDirectory;
  readonly sceneFileName: string;
  private readonly source: RandomAccess;
  private readonly codec: Codec;
  private readonly loaded = new Map<string, Promise<unknown>>();

  private constructor(options: SceneArchiveOptions, directory: ZipDirectory) {
    this.source = options.source;
    this.codec = options.codec;
    this.sceneFileName = options.sceneFileName;
    this.directory = directory;
  }

  static async open(options: SceneArchiveOptions): Promise<SceneArchive> {
    return new SceneArchive(options, await readZipDirectory(options.source));
  }

  /** The member the engine loads for `ext`, named from the scene's file name (CalcCacheFileName). */
  member(ext: string): ZipEntry | undefined {
    return findMember(this.directory, cacheFileName(this.sceneFileName, ext));
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.loaded.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      this.loaded.set(key, pending);
      // A failed read can be retried.
      pending.catch(() => this.loaded.delete(key));
    }
    return pending;
  }

  memberBytes(ext: string): Promise<Uint8Array> {
    return this.once(`bytes:${ext}`, async () => {
      const entry = this.member(ext);
      if (!entry) throw new FormatError(`${this.sceneFileName} has no .${ext} member`, 0);
      return readMember(this.source, entry, this.codec);
    });
  }

  gms(): Promise<GmsImage> {
    return this.once('gms', async () => readGms(unpackChunk(await this.memberBytes('gms'), this.codec).data));
  }

  buf(): Promise<Uint8Array> {
    return this.memberBytes('buf');
  }

  prp(): Promise<PrpStream> {
    return this.once('prp', async () => {
      const data = await this.memberBytes('prp');
      return { data, tree: readPrpTree(data) };
    });
  }

  prm(): Promise<PrmFile> {
    return this.once('prm', async () => new PrmFile(await this.memberBytes('prm')));
  }

  mat(): Promise<MatFile> {
    return this.once('mat', async () => new MatFile(await this.memberBytes('mat')));
  }

  tex(): Promise<TexFile> {
    return this.once('tex', async () => readTex(await this.memberBytes('tex')));
  }

  /** The scene's animation clips and collections, or null when it has no .ANM member. */
  anm(): Promise<AnmFile | null> {
    return this.once('anm', async () => (this.member('anm') ? readAnm(await this.memberBytes('anm')) : null));
  }

  /** The scene's localisation database; Loader_Sequence scenes ship none. */
  loc(): Promise<LocDatabase | null> {
    return this.once('loc', async () => (this.member('loc') ? new LocDatabase(await this.memberBytes('loc')) : null));
  }
}
