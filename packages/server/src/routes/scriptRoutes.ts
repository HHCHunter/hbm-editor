import type { FastifyInstance } from 'fastify';
import { bindRecord, decodeText, readRecordTokens, scriptCreatorKey } from '@hbm/formats';
import type { SceneScriptsDTO, ScriptCreatorDTO, ScriptUserDTO } from '@hbm/protocol';
import type { GameService } from '../game/GameService';
import { requireString } from '../http/HttpError';

type Query = Record<string, string | undefined>;

export function registerScriptRoutes(app: FastifyInstance, game: GameService): void {
  /** The scene's mission DLL script classes and the objects whose ScriptC asks for each. */
  app.get<{ Querystring: Query }>('/api/scene/scripts', async (req): Promise<SceneScriptsDTO> => {
    const id = requireString(req.query, 'scene');
    const schemas = await game.schemas();
    const scriptSchema = schemas?.forController('ScriptC') ?? null;

    const { module, requests } = await game.withScene(id, async (scene) => {
      const prp = await scene.archive.prp();
      const moduleValue = prp.tree.sceneProperties.find((p) => p.name === 'ScriptCModule')?.values[0];
      const found: { node: number; scriptName: string }[] = [];
      prp.tree.nodes.forEach((node, i) => {
        if (i === 0) return;
        for (const c of node.controllers) {
          if (c.name !== 'ScriptC') continue;
          const tokens = readRecordTokens(prp.data, prp.tree, c.record);
          // ScriptName is the one reflected property; without a schema, take the first string.
          let name: unknown = scriptSchema ? bindRecord(tokens, scriptSchema, prp.tree.strings).properties[0]?.value : undefined;
          if (typeof name !== 'string') {
            const t = tokens.find((x) => x.kind === 'string');
            name = t ? (t.interned ? prp.tree.strings[t.value] : t.bytes ? decodeText(t.bytes) : undefined) : undefined;
          }
          if (typeof name === 'string' && name) found.push({ node: i - 1, scriptName: name });
        }
      });
      return { module: typeof moduleValue === 'string' && moduleValue ? moduleValue : null, requests: found };
    });

    const mission = module ? await game.missionScripts(module) : null;
    const byKey = new Map((mission?.creators ?? []).map((c) => [c.name.toLowerCase(), c]));
    const users: ScriptUserDTO[] = requests.map((r) => ({ ...r, creator: byKey.get(scriptCreatorKey(r.scriptName))?.name ?? null }));

    const usersOf = new Map<string, number[]>();
    for (const u of users) if (u.creator) usersOf.set(u.creator, [...(usersOf.get(u.creator) ?? []), u.node]);
    const byName = new Map((mission?.creators ?? []).map((c) => [c.name, c]));
    const creators: ScriptCreatorDTO[] = (mission?.creators ?? []).map((c) => {
      const bases: string[] = [];
      for (let b = c.base; b && !bases.includes(b) && bases.length < 16; b = byName.get(b)?.base ?? null) bases.push(b);
      return { name: c.name, bases, size: c.size, users: usersOf.get(c.name) ?? [] };
    });

    return { module, dll: mission?.dll ?? null, creators, users };
  });
}
