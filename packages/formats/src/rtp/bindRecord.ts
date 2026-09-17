import { decodeText } from '../binary/text';
import type { PrpToken, PrpTokenKind } from '../prp/PrpCursor';
import { inLevelFiles, type EnumInfo } from './propertyChain';
import type { ClassSchema } from './schemas';

// Level files are positional: a record holds each level-file property of its class chain in the
// order RTP::LoadSerializable visits them, with no names. Binding walks the schema and consumes the
// markers each type's loader reads. Whatever follows the reflected properties is class-specific
// LoadObject data (ScriptC's variables, for one) and is kept as an opaque tail.

export type BoundValue = number | boolean | string | number[] | string[] | null;

export interface BoundProperty {
  /** The class that registered the property. */
  owner: string;
  /** 1-based position among the record's level-file properties. */
  index: number;
  type: string;
  filter: number;
  value: BoundValue;
  enumInfo: EnumInfo | null;
  /** Byte offset of the first token in the PRP stream. */
  offset: number;
}

export interface BoundRecord {
  properties: BoundProperty[];
  /** Tokens after the reflected properties. */
  tail: PrpToken[];
  /** Where binding stopped, when a token didn't have the shape the schema expects. */
  mismatch: { index: number; offset: number; expected: string; found: string } | null;
}

class Mismatch extends Error {
  constructor(
    readonly expected: string,
    readonly token: PrpToken | undefined,
  ) {
    super(expected);
  }
}

export function bindRecord(tokens: readonly PrpToken[], schema: ClassSchema, strings: readonly string[]): BoundRecord {
  let at = 0;
  const take = (kind: PrpTokenKind, what: string = kind): PrpToken => {
    const token = tokens[at];
    if (!token || token.kind !== kind) throw new Mismatch(what, token);
    at++;
    return token;
  };
  const text = (token: PrpToken) => (token.interned ? (strings[token.value] ?? `#${token.value}`) : token.bytes ? decodeText(token.bytes) : '');

  const properties: BoundProperty[] = [];
  let index = 0;
  for (const level of schema.levels) {
    for (const record of level.records) {
      if (!inLevelFiles(record)) continue;
      index++;
      const start = at;
      const offset = tokens[at]?.offset ?? -1;
      try {
        const type = record.type;
        if (!type) throw new Mismatch(`a type for loader 0x${record.loadRva.toString(16)}`, tokens[at]);
        let value: BoundValue;
        if (tokens[at]?.kind === 'skip') {
          // ZPackedOutput::Skip writes a lone 0x7D in place of a property it leaves out.
          at++;
          value = null;
        } else {
          const shape = type.shape;
          switch (shape.kind) {
            case 'scalar': {
              const token = take(shape.token, type.type);
              value =
                shape.token === 'string'
                  ? text(token)
                  : shape.token === 'bool'
                    ? token.value !== 0
                    : type.type.startsWith('int') ? token.value | 0 : token.value;
              break;
            }
            case 'array': {
              const open = take('beginArray', type.type);
              if (open.value !== shape.count) throw new Mismatch(type.type, open);
              const values: number[] = [];
              for (let i = 0; i < shape.count; i++) values.push(take(shape.token, type.type).value);
              take('endArray', type.type);
              value = type.type.startsWith('int') ? values.map((v) => v | 0) : values;
              break;
            }
            case 'enum':
              value = text(take('enum'));
              break;
            case 'bitfield': {
              const token = take('type13', 'bitfield');
              const names: string[] = [];
              const view = token.bytes ? new DataView(token.bytes.buffer, token.bytes.byteOffset, token.bytes.byteLength) : null;
              for (let i = 0; view && i < token.value; i++) names.push(strings[view.getUint32(i * 4, true)] ?? '?');
              value = names;
              break;
            }
            case 'referenceTable': {
              const count = take('container', type.type).value;
              const refs: string[] = [];
              for (let i = 0; i < count; i++) refs.push(text(take('string', type.type)));
              value = refs;
              break;
            }
            case 'raw': {
              // A byte count as a container, then the bytes as one raw block unless the count is 0.
              const length = take('container', type.type).value;
              if (length > 0 && take('raw', type.type).value !== length) throw new Mismatch(type.type, tokens[at - 1]);
              value = length;
              break;
            }
          }
        }
        properties.push({ owner: level.owner, index, type: type.type, filter: record.filter, value, enumInfo: record.enumInfo, offset });
      } catch (err) {
        if (!(err instanceof Mismatch)) throw err;
        at = start;
        return {
          properties,
          tail: tokens.slice(at),
          mismatch: {
            index,
            offset: err.token?.offset ?? offset,
            expected: err.expected,
            found: err.token ? err.token.kind : 'end of record',
          },
        };
      }
    }
  }
  return { properties, tail: tokens.slice(at), mismatch: null };
}
