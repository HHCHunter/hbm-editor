import type { FastifyInstance } from 'fastify';
import { LOC_CHILDREN, decodeText, type LocDatabase, type LocRecord } from '@hbm/formats';
import type { LocEntryDTO, LocLookupDTO } from '@hbm/protocol';
import type { GameService } from '../game/GameService';
import { HttpError, optionalInt, requireString } from '../http/HttpError';

type Query = Record<string, string | undefined>;

const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_LIMIT = 500;

function entry(name: string, path: string, record: LocRecord): LocEntryDTO {
  return {
    name,
    path,
    flags: record.flags,
    text: record.text ? decodeText(record.text) : null,
    text2: record.text2 ? decodeText(record.text2) : null,
    soundId: record.soundId,
    hasChildren: (record.flags & LOC_CHILDREN) !== 0,
  };
}

async function requireLoc(game: GameService, id: string, use: (db: LocDatabase) => unknown) {
  return game.withScene(id, async (scene) => {
    const db = await scene.archive.loc();
    if (!db) throw new HttpError(404, `${id} has no localisation database`);
    return use(db);
  });
}

export function registerLocRoutes(app: FastifyInstance, game: GameService): void {
  app.get<{ Querystring: Query }>('/api/scene/loc/children', async (req) => {
    const id = requireString(req.query, 'scene');
    const path = (req.query.path ?? '').replace(/^\/+|\/+$/g, '');
    return requireLoc(game, id, (db): LocEntryDTO[] => {
      let table = 0;
      if (path) {
        const hit = db.lookup(path);
        if (!hit) throw new HttpError(404, `There's no ${path}`);
        const { childTable } = db.record(hit.flagsOffset);
        if (childTable === null) return [];
        table = childTable;
      }
      return db.children(table).map((c) => {
        const name = decodeText(c.name);
        return entry(name, path ? `${path}/${name}` : name, c.record);
      });
    });
  });

  app.get<{ Querystring: Query }>('/api/scene/loc/lookup', async (req) => {
    const id = requireString(req.query, 'scene');
    const path = requireString(req.query, 'path');
    return requireLoc(game, id, (db): LocLookupDTO => {
      const hit = db.lookup(path);
      if (!hit) return { path, found: false, shadowed: false, entry: null };
      const name = path.split('/').filter(Boolean).pop() ?? '';
      return { path, found: true, shadowed: hit.shadowed, entry: entry(name, path, db.record(hit.flagsOffset)) };
    });
  });

  app.get<{ Querystring: Query }>('/api/scene/loc/search', async (req) => {
    const id = requireString(req.query, 'scene');
    const query = requireString(req.query, 'q').toLowerCase();
    const limit = Math.min(optionalInt(req.query, 'limit') ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    return requireLoc(game, id, (db): LocEntryDTO[] => {
      const hits: LocEntryDTO[] = [];
      db.walk((segments, child) => {
        if (hits.length >= limit) return;
        const path = segments.map(decodeText).join('/');
        const text = child.record.text ? decodeText(child.record.text) : '';
        if (path.toLowerCase().includes(query) || text.toLowerCase().includes(query)) {
          hits.push(entry(decodeText(child.name), path, child.record));
        }
      });
      return hits;
    });
  });
}
