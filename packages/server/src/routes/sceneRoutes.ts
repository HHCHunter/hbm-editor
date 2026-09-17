import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  decodeText,
  decodeTexLevel,
  firstLevelWithData,
  readRecordTokens,
  textureStages,
  TEX_FLAG_CUBEMAP,
  type PrpToken,
  type PrpTree,
} from '@hbm/formats';
import type {
  NodeDetailDTO,
  RecordSchemaDTO,
  PropertyTokenDTO,
  SceneGraphDTO,
  SceneSummaryDTO,
  SurfaceDTO,
  TextureDTO,
} from '@hbm/protocol';
import { TRANSFORM_STRIDE } from '@hbm/protocol';
import { bindNodeProperties, encodeMeshPack, type RecordBinding } from '@hbm/scene';
import type { GameService } from '../game/GameService';
import { HttpError, optionalInt, requireInt, requireString } from '../http/HttpError';
import { encodePng } from '../images/png';

type Query = Record<string, string | undefined>;

/** Most roots one mesh request may ask for. */
const MAX_ROOTS_PER_REQUEST = 64;

function sendBytes(reply: FastifyReply, bytes: Uint8Array, type = 'application/octet-stream'): FastifyReply {
  return reply.type(type).send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

function tokenDTO(token: PrpToken, tree: PrpTree): PropertyTokenDTO {
  let value: number | string = token.value;
  if (token.interned) value = tree.strings[token.value] ?? token.value;
  else if (token.bytes && (token.kind === 'string' || token.kind === 'enum')) value = decodeText(token.bytes);
  return { offset: token.offset, kind: token.kind, value };
}

function schemaDTO({ className, bound }: RecordBinding): RecordSchemaDTO {
  return {
    className,
    properties: (bound?.properties ?? []).map((p) => ({
      owner: p.owner,
      index: p.index,
      type: p.type,
      filter: p.filter,
      value: p.value,
      enumName: p.enumInfo?.name ?? null,
      options: p.enumInfo ? p.enumInfo.options.map((o) => o.name) : null,
    })),
    tailTokens: bound?.tail.length ?? 0,
    mismatch: bound?.mismatch
      ? `property ${bound.mismatch.index}: expected ${bound.mismatch.expected}, found ${bound.mismatch.found}`
      : null,
  };
}

export function registerSceneRoutes(app: FastifyInstance, game: GameService): void {
  app.get<{ Querystring: Query }>('/api/scene/summary', async (req): Promise<SceneSummaryDTO> => {
    const id = requireString(req.query, 'scene');
    return game.withScene(id, async (scene) => ({
      id,
      members: scene.archive.directory.entries.map((e) => ({
        name: e.name,
        method: e.method,
        compressedSize: e.compressedSize,
        uncompressedSize: e.uncompressedSize,
      })),
      problems: scene.archive.directory.problems,
    }));
  });

  app.get<{ Querystring: Query }>('/api/scene/graph', async (req): Promise<SceneGraphDTO> => {
    const id = requireString(req.query, 'scene');
    return game.withScene(id, async (scene) => {
      const [graph, roots] = await Promise.all([scene.graph(), scene.roots()]);
      return { id, nodes: graph.nodes, roots, sceneProperties: graph.sceneProperties, problems: graph.problems };
    });
  });

  app.get<{ Querystring: Query }>('/api/scene/transforms', async (req, reply) => {
    const id = requireString(req.query, 'scene');
    const bytes = await game.withScene(id, async (scene) => {
      const { transforms } = await scene.graph();
      const out = new Float32Array(transforms.length);
      out.set(transforms);
      return new Uint8Array(out.buffer);
    });
    return sendBytes(reply, bytes);
  });

  app.get<{ Querystring: Query }>('/api/scene/node', async (req): Promise<NodeDetailDTO> => {
    const id = requireString(req.query, 'scene');
    const index = requireInt(req.query, 'index');
    const schemas = await game.schemas();
    return game.withScene(id, async (scene) => {
      const [graph, gms, prp] = await Promise.all([scene.graph(), scene.archive.gms(), scene.archive.prp()]);
      const node = graph.nodes[index];
      const geom = gms.geoms[index];
      if (!node || !geom) throw new HttpError(404, `${id} has no node ${index}`);
      const prpNode = prp.tree.nodes.length - 1 === gms.geoms.length ? prp.tree.nodes[index + 1] : undefined;
      const tokens = (record: { start: number; end: number }) =>
        readRecordTokens(prp.data, prp.tree, record).map((t) => tokenDTO(t, prp.tree));
      const bound = prpNode && schemas ? bindNodeProperties(prp, index, node.className, schemas) : null;
      return {
        node,
        gms: {
          recordOffset: geom.recordOffset,
          nameOffset: geom.nameOffset,
          prim: geom.prim,
          typeId: geom.typeId,
          controlFlags: geom.controlFlags,
          rawDataOffset: geom.rawDataOffset,
          auxCount: geom.auxCount,
          refId: geom.refId,
          poolGroup: geom.poolGroup,
        },
        transform: Array.from(graph.transforms.subarray(index * TRANSFORM_STRIDE, (index + 1) * TRANSFORM_STRIDE)),
        properties: prpNode ? tokens(prpNode.record) : [],
        schema: bound ? schemaDTO(bound.node) : null,
        controllers: prpNode
          ? prpNode.controllers.map((c, i) => ({
              name: c.name,
              properties: tokens(c.record),
              schema: bound?.controllers[i] ? schemaDTO(bound.controllers[i]!) : null,
            }))
          : [],
      };
    });
  });

  app.get<{ Querystring: Query }>('/api/scene/meshes', async (req, reply) => {
    const id = requireString(req.query, 'scene');
    const roots = [...new Set(requireString(req.query, 'roots').split(',').map(Number))];
    if (roots.some((r) => !Number.isInteger(r) || r <= 0)) throw new HttpError(400, '"roots" must be a comma-separated list of root numbers');
    if (roots.length > MAX_ROOTS_PER_REQUEST) throw new HttpError(400, `ask for at most ${MAX_ROOTS_PER_REQUEST} roots at a time`);
    const bytes = await game.withScene(id, async (scene) => {
      const prm = await scene.archive.prm();
      const parts = [];
      for (const root of roots) {
        if (!prm.objectHeader(root)) throw new HttpError(404, `${id} has no model root ${root}`);
        parts.push(...(await scene.parts(root)));
      }
      return encodeMeshPack(prm, parts);
    });
    return sendBytes(reply, bytes);
  });

  app.get<{ Querystring: Query }>('/api/scene/surfaces', async (req): Promise<SurfaceDTO[]> => {
    const id = requireString(req.query, 'scene');
    return game.withScene(id, async (scene) => [...(await scene.surfaces()).values()]);
  });

  app.get<{ Querystring: Query }>('/api/scene/textures', async (req): Promise<TextureDTO[]> => {
    const id = requireString(req.query, 'scene');
    return game.withScene(id, async (scene) => {
      const [tex, mat] = await Promise.all([scene.archive.tex(), scene.archive.mat()]);
      const usedBy = new Map<number, number[]>();
      for (const material of mat.materials) {
        for (const stage of textureStages(mat, material)) {
          if (!stage.enabled || stage.textureId === null) continue;
          const slots = usedBy.get(stage.textureId) ?? [];
          if (!slots.includes(material.slot)) slots.push(material.slot);
          usedBy.set(stage.textureId, slots);
        }
      }
      return tex.records.map((r) => ({
        id: r.id,
        name: r.name,
        format: r.format,
        width: r.width,
        height: r.height,
        levels: r.levels.map(({ width, height, size }) => ({ width, height, size })),
        flags: r.flags,
        scale: r.scale,
        materials: usedBy.get(r.id) ?? [],
        faces: r.flags & TEX_FLAG_CUBEMAP ? (tex.idLists.get(r.id)?.slice(0, 6) ?? null) : null,
      }));
    });
  });

  app.get<{ Querystring: Query }>('/api/scene/texture', async (req, reply) => {
    const id = requireString(req.query, 'scene');
    const textureId = requireInt(req.query, 'id');
    const as = req.query.as ?? 'png';
    if (!['png', 'rgba', 'raw'].includes(as)) throw new HttpError(400, '"as" must be png, rgba or raw');

    const result = await game.withScene(id, async (scene) => {
      const tex = await scene.archive.tex();
      const record = tex.byId.get(textureId);
      if (!record) throw new HttpError(404, `${id} has no texture ${textureId}`);
      const level = optionalInt(req.query, 'level') ?? firstLevelWithData(record);
      const info = record.levels[level];
      if (!info) throw new HttpError(404, `texture ${textureId} has no mip level ${level}`);
      if (as === 'raw') return { bytes: tex.data.subarray(info.offset, info.offset + info.size), record, info };
      const image = decodeTexLevel(tex, record, level);
      return { bytes: as === 'png' ? encodePng(image.rgba, image.width, image.height) : image.rgba, record, info };
    });

    reply.header('x-texture-format', result.record.format);
    reply.header('x-texture-width', String(result.info.width));
    reply.header('x-texture-height', String(result.info.height));
    return sendBytes(reply, result.bytes, as === 'png' ? 'image/png' : 'application/octet-stream');
  });
}
