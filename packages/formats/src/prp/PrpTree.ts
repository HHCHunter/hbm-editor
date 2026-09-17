import { FormatError } from '../binary/FormatError';
import { decodeText } from '../binary/text';
import { PRP_PAYLOAD, readPrpHeader, type PrpHeader } from './header';
import { PrpCursor, type PrpToken, type PrpTokenKind } from './PrpCursor';

// A scene's property stream: the scene's own named properties, then one record per scene-graph
// node in depth-first pre-order. The node grammar is ZEngineDataBase::LoadPropertiesRecursive
// 0x0005DD10 (enginedatabase.cpp):
//
//   node := 02 <properties> 7E                           ExchangeHeader/Object/Footer, type 14
//           04 <n> { 0C <class name> 02 <properties> 7E }  "Controllers"
//           04 <n> { node }                                "Children"
//
// The scene property block before the root is from prp.md:
//
//   04 <n> { 0C <name> 09 <type> ( 0C <string> | 09 <count> 01 <count> <values> 7C ) }
//
// nodes[k + 1] is the .GMS geom k; nodes[0] is the scene root, which has no geom.

export interface PrpRange {
  /** The node's 0x02 marker. */
  start: number;
  /** Just past its 0x7E marker. */
  end: number;
}

export interface PrpController {
  name: string;
  record: PrpRange;
}

export interface PrpNode {
  depth: number;
  /** Index of the parent node, or -1 for the root. */
  parent: number;
  record: PrpRange;
  controllers: PrpController[];
  childCount: number;
}

export interface PrpSceneProperty {
  name: string;
  type: number;
  values: (number | string)[];
}

export interface PrpTree {
  header: PrpHeader;
  strings: string[];
  sceneProperties: PrpSceneProperty[];
  nodes: PrpNode[];
  controllerCount: number;
  /** Where parsing stopped. */
  end: number;
  trailingBytes: number;
}

export function readPrpTree(data: Uint8Array): PrpTree {
  const header = readPrpHeader(data);
  if (!(header.flags & PRP_PAYLOAD)) {
    throw new FormatError('stream carries no body markers, which this reader needs', 15);
  }
  const strings = (header.strings ?? []).map(decodeText);
  const cursor = new PrpCursor(data, header);

  const expect = (kind: PrpTokenKind): PrpToken => {
    const token = cursor.next();
    if (token.kind !== kind) throw new FormatError(`expected ${kind}, found ${token.kind}`, token.offset);
    return token;
  };
  const text = (token: PrpToken): string =>
    token.interned ? strings[token.value]! : decodeText(token.bytes ?? new Uint8Array());

  const sceneProperties: PrpSceneProperty[] = [];
  const propertyCount = expect('container').value;
  for (let i = 0; i < propertyCount; i++) {
    const name = text(expect('string'));
    const type = expect('u32').value;
    if (cursor.peekMarker() === 0x0c) {
      sceneProperties.push({ name, type, values: [text(cursor.next())] });
      continue;
    }
    expect('u32');
    expect('beginArray');
    const values: (number | string)[] = [];
    for (let t = cursor.next(); t.kind !== 'endArray'; t = cursor.next()) {
      values.push(t.kind === 'string' || (t.kind === 'enum' && (t.interned || t.bytes)) ? text(t) : t.value);
    }
    sceneProperties.push({ name, type, values });
  }

  const readRecord = (): PrpRange => {
    const open = expect('beginNode');
    for (;;) {
      const token = cursor.next();
      if (token.kind === 'endNode') return { start: open.offset, end: cursor.pos };
      if (token.kind === 'beginNode') throw new FormatError('node records do not nest', token.offset);
    }
  };

  const nodes: PrpNode[] = [];
  let controllerCount = 0;
  const readNode = (depth: number, parent: number): number => {
    const record = readRecord();
    const controllers: PrpController[] = [];
    const ctrlCount = expect('container').value;
    for (let i = 0; i < ctrlCount; i++) {
      const name = text(expect('string'));
      controllers.push({ name, record: readRecord() });
    }
    controllerCount += ctrlCount;
    const childCount = expect('container').value;
    nodes.push({ depth, parent, record, controllers, childCount });
    return nodes.length - 1;
  };

  // The engine recurses; an explicit stack keeps deep scenes off the JS call stack.
  const root = readNode(0, -1);
  const stack = [{ index: root, remaining: nodes[root]!.childCount }];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (top.remaining === 0) {
      stack.pop();
      continue;
    }
    top.remaining--;
    const child = readNode(nodes[top.index]!.depth + 1, top.index);
    stack.push({ index: child, remaining: nodes[child]!.childCount });
  }

  return {
    header,
    strings,
    sceneProperties,
    nodes,
    controllerCount,
    end: cursor.pos,
    trailingBytes: data.length - cursor.pos,
  };
}

/** The tokens inside a record, without its 0x02 and 0x7E markers. */
export function readRecordTokens(data: Uint8Array, tree: PrpTree, record: PrpRange): PrpToken[] {
  const cursor = new PrpCursor(data, tree.header, record.start);
  const tokens: PrpToken[] = [];
  cursor.next();
  for (let t = cursor.next(); t.kind !== 'endNode'; t = cursor.next()) tokens.push(t);
  return tokens;
}
