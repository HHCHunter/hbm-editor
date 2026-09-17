import { cstringAt, hex, i32At, u32At, u8At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { asciiLower, decodeText, latin1Bytes } from '../binary/text';

// The localisation trie, as engine/enginedata/locale.cpp reads it. There is no parse step in the
// engine: ResourceCollection::Load 0x00064F70 keeps the file image and every lookup walks it.
//
//   table  := u8 count, i32 off[count-1], child 0, child 1, ...
//             strbase = table + 4*count - 3; child i's name is at strbase + (i ? off[i-1] : 0)
//   child  := name '\0' u8 flags payload
//   flags  0x01 text follows   0x02 a second text follows   0x20 a u32 sound id follows
//          0x10 a child table follows the flags byte directly (LookupElement 0x00065420)

export const LOC_TEXT = 0x01;
export const LOC_TEXT2 = 0x02;
export const LOC_CHILDREN = 0x10;
export const LOC_SOUND = 0x20;
const KNOWN_FLAGS = LOC_TEXT | LOC_TEXT2 | LOC_CHILDREN | LOC_SOUND;
const SLASH = 0x2f;
const MAX_DEPTH = 64;

export interface LocRecord {
  flagsOffset: number;
  flags: number;
  text: Uint8Array | null;
  text2: Uint8Array | null;
  /** A byte offset into the scene's .SND bank, when the record has one. */
  soundId: number | null;
  /** The child table's offset, when flags has LOC_CHILDREN. */
  childTable: number | null;
}

export interface LocChild {
  nameOffset: number;
  name: Uint8Array;
  record: LocRecord;
}

export interface LocLookupResult {
  /** Offset of the flags byte the engine hands back. */
  flagsOffset: number;
  /**
   * True when a path segment matched only the start of a longer name. The engine compares just the
   * segment's length, so "Actions/Throw" can land inside "ThrowIntoChute" and decode name bytes as
   * a record.
   */
  shadowed: boolean;
}

export interface LocWalkResult {
  nodes: number;
  /**
   * How many records set each flag bit the engine reads no payload for, keyed by the bit (0x08
   * occurs in shipped databases). Not errors: lookups and GetSoundId ignore these bits.
   */
  otherFlagBits: Record<number, number>;
  problems: string[];
}

export class LocDatabase {
  readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /** Decode the record whose flags byte is at `flagsOffset`, as Resource::GetSoundId reads it. */
  record(flagsOffset: number): LocRecord {
    const d = this.data;
    const flags = u8At(d, flagsOffset);
    let q = flagsOffset + 1;
    let text: Uint8Array | null = null;
    let text2: Uint8Array | null = null;
    if (flags & LOC_TEXT) {
      text = cstringAt(d, q);
      q += text.length + 1;
    }
    if (flags & LOC_TEXT2) {
      text2 = cstringAt(d, q);
      q += text2.length + 1;
    }
    const soundId = flags & LOC_SOUND ? u32At(d, q) : null;
    const childTable = flags & LOC_CHILDREN ? flagsOffset + 1 : null;
    return { flagsOffset, flags, text, text2, soundId, childTable };
  }

  /** The children of the table at `table`, in stored order. The root table is at 0. */
  children(table: number): LocChild[] {
    const d = this.data;
    const count = u8At(d, table);
    const out: LocChild[] = [];
    const strbase = table + 4 * count - 3;
    for (let i = 0; i < count; i++) {
      const nameOffset = strbase + (i === 0 ? 0 : i32At(d, table + 4 * i - 3));
      const name = cstringAt(d, nameOffset);
      out.push({ nameOffset, name, record: this.record(nameOffset + name.length + 1) });
    }
    return out;
  }

  /**
   * Resolve a '/'-separated path the way the engine's lookup does: leading '/' runs are skipped
   * per segment, and each table is binary-searched with _strnicmp limited to the segment length.
   * Returns null where the engine would return NULL.
   */
  lookup(path: string | Uint8Array, table = 0): LocLookupResult | null {
    const d = this.data;
    const p8 = typeof path === 'string' ? latin1Bytes(path) : path;
    const at = (i: number) => (i < p8.length ? p8[i]! : 0);
    let node = table;
    let p = 0;
    let shadowed = false;

    try {
      for (;;) {
        if (at(p) === SLASH) {
          do p++;
          while (at(p) === SLASH);
        }
        let seglen = 0;
        while (at(p + seglen) !== 0 && at(p + seglen) !== SLASH) seglen++;

        const count = u8At(d, node);
        const strbase = node + 4 * count - 3;
        const nameAt = (i: number) => strbase + (i === 0 ? 0 : i32At(d, node + 4 * i - 3));

        let lo = 0;
        let remaining = count;
        while (remaining > 0) {
          const half = remaining >> 1;
          const mid = lo + half;
          if (this.compare(nameAt(mid), p8, p, seglen) < 0) {
            lo = mid + 1;
            remaining = remaining - half - 1;
          } else {
            remaining = half;
          }
        }
        if (lo >= count) return null;

        const nameOffset = nameAt(lo);
        if (this.compare(nameOffset, p8, p, seglen) !== 0) return null;
        if (u8At(d, nameOffset + seglen) !== 0) shadowed = true;

        const flagsOffset = nameOffset + seglen + 1;
        if (at(p + seglen) === 0) return { flagsOffset, shadowed };
        node = flagsOffset + 1;
        p += seglen + 1;
      }
    } catch (err) {
      // A shadowed match can send the walk into bytes that aren't a table at all.
      if (err instanceof FormatError) return null;
      throw err;
    }
  }

  /** _strnicmp(data + nameOffset, path + from, n). */
  private compare(nameOffset: number, path: Uint8Array, from: number, n: number): number {
    for (let i = 0; i < n; i++) {
      const a = asciiLower(u8At(this.data, nameOffset + i));
      const b = asciiLower(from + i < path.length ? path[from + i]! : 0);
      if (a !== b) return a - b;
      if (a === 0) return 0;
    }
    return 0;
  }

  /**
   * Visit every node and check what the engine silently assumes: tables sorted for its binary
   * search, no unknown flags, and child tables that don't share bytes with text or sound ids.
   */
  walk(visit?: (path: readonly Uint8Array[], child: LocChild) => void): LocWalkResult {
    const problems: string[] = [];
    const otherFlagBits: Record<number, number> = {};
    let nodes = 0;
    const stack: { table: number; path: Uint8Array[] }[] = [{ table: 0, path: [] }];

    while (stack.length) {
      const { table, path } = stack.pop()!;
      const where = () => (path.length ? path.map(decodeText).join('/') : '(root)');
      if (path.length > MAX_DEPTH) {
        problems.push(`${where()}: nested more than ${MAX_DEPTH} levels deep`);
        continue;
      }

      let kids: LocChild[];
      try {
        kids = this.children(table);
      } catch (err) {
        if (!(err instanceof FormatError)) throw err;
        problems.push(`${where()}: child table at ${hex(table)} is malformed: ${err.message}`);
        continue;
      }

      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i]!;
        nodes++;
        const kidPath = [...path, kid.name];
        const { flags } = kid.record;
        const kidWhere = () => kidPath.map(decodeText).join('/');

        if (i > 0 && compareNames(kids[i - 1]!.name, kid.name) > 0) {
          problems.push(`${kidWhere()}: out of order, so the engine's binary search can miss it`);
        }
        for (let bit = 1; bit < 0x100; bit <<= 1) {
          if (flags & bit & ~KNOWN_FLAGS) otherFlagBits[bit] = (otherFlagBits[bit] ?? 0) + 1;
        }
        if (flags & LOC_CHILDREN && flags & (LOC_TEXT | LOC_TEXT2 | LOC_SOUND)) {
          problems.push(`${kidWhere()}: has both a child table and text or a sound id`);
        }

        visit?.(kidPath, kid);
        if (kid.record.childTable !== null) stack.push({ table: kid.record.childTable, path: kidPath });
      }
    }
    return { nodes, otherFlagBits, problems };
  }
}

/** Case-insensitive order of two whole names, as _stricmp gives it. */
function compareNames(a: Uint8Array, b: Uint8Array): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ca = asciiLower(a[i] ?? 0);
    const cb = asciiLower(b[i] ?? 0);
    if (ca !== cb) return ca - cb;
  }
  return 0;
}
