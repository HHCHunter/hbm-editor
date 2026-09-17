import { decodeText } from '../binary/text';
import type { PeImage } from '../pe/PeImage';
import type { VtableIndex } from '../pe/msvcRtti';

// Controllers are created by name through ZFactory. Each class gets a ZFactoryProducer whose
// constructor is the same 44 bytes apart from the pushed Create thunk:
//
//   8B 44 24 08  56  50  8B F1  8B 4C 24 0C  68 <thunk>  51  8B CE  E8 <copy info>
//   56  E8 <GetFactory>  8B C8  E8 <ZFactory::Add>  8B C6  5E  C2 08 00
//
// and each registration calls one with `68 <info> 68 <name> B9 <producer>` just before the call.
// The thunk jumps to Create, which constructs the object; the constructors it reaches stamp the
// vtables of the class and its bases, and the class is the one whose type name matches the
// registered name.

export interface ControllerClass {
  /** The name scenes use, e.g. "TimeOutDelete". */
  name: string;
  className: string;
  vtable: number;
  /** False when no stamped class name agreed and the most derived one was taken instead. */
  nameAgrees: boolean;
}

const PRODUCER = [0x8b, 0x44, 0x24, 0x08, 0x56, 0x50, 0x8b, 0xf1, 0x8b, 0x4c, 0x24, 0x0c, 0x68];
const PRODUCER_TAIL: [number, number[]][] = [
  [17, [0x51, 0x8b, 0xce, 0xe8]],
  [25, [0x56, 0xe8]],
  [31, [0x8b, 0xc8, 0xe8]],
  [38, [0x8b, 0xc6, 0x5e, 0xc2, 0x08, 0x00]],
];
const CALLEES_FOLLOWED = 6;
const BODY_BYTES = 256;

const matchesAt = (bytes: Uint8Array, at: number, pattern: readonly number[]) => pattern.every((b, i) => bytes[at + i] === b);

/** A registered name and a class name refer to the same class, ignoring the usual prefixes. */
export function namesAgree(registered: string, className: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/^.*::/, '')
      .replace(/^(ZHM3|HM3|Z|C)(?=[A-Z0-9])/, '')
      .replace(/Event$/, '')
      .toLowerCase();
  return norm(registered) === norm(className);
}

export function findControllerClasses(image: PeImage, vtables: VtableIndex): Map<string, ControllerClass> {
  const result = new Map<string, ControllerClass>();
  const text = image.section('.text');
  if (!text) return result;
  const base = image.imageBase + text.virtualAddress;
  const bytes = image.data.subarray(text.rawOffset, text.rawOffset + Math.min(text.rawSize, text.virtualSize));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rel = (at: number) => base + at + 4 + view.getInt32(at, true);

  // 1. Producer constructors, keeping those whose three callees are the common triple.
  const constructors: { va: number; thunk: number; callees: string }[] = [];
  const votes = new Map<string, number>();
  for (let i = 0; i + 44 <= bytes.length; i++) {
    if (bytes[i] !== 0x8b || !matchesAt(bytes, i, PRODUCER)) continue;
    if (!PRODUCER_TAIL.every(([at, pattern]) => matchesAt(bytes, i + at, pattern))) continue;
    const callees = [rel(i + 21), rel(i + 27), rel(i + 34)].join(',');
    constructors.push({ va: base + i, thunk: view.getUint32(i + 13, true), callees });
    votes.set(callees, (votes.get(callees) ?? 0) + 1);
  }
  const common = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const thunkOf = new Map(constructors.filter((c) => c.callees === common).map((c) => [c.va, c.thunk]));

  // 2. Classes whose vtables a function (and its first few callees) stamps.
  const stampedBy = (fnVa: number, depth: number, found: Set<string>) => {
    const body = image.bytesAtVa(fnVa, BODY_BYTES);
    if (!body) return;
    const bv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    let callees = 0;
    for (let j = 0; j + 6 <= body.length; j++) {
      if (body[j] === 0xc7) {
        // C7 /0 with no displacement, a disp8 or a disp32 before the imm32.
        for (const immAt of [j + 2, j + 3, j + 6]) {
          if (immAt + 4 > body.length) continue;
          const name = vtables.byVtable.get(bv.getUint32(immAt, true));
          if (name) found.add(name);
        }
      } else if (body[j] === 0xe8 && depth === 0 && callees < CALLEES_FOLLOWED && j + 5 <= body.length) {
        callees++;
        stampedBy(fnVa + j + 5 + bv.getInt32(j + 1, true), 1, found);
      }
      // Functions are separated by int3 padding; a lone C3 byte may be part of an instruction.
      if (body[j] === 0xcc && body[j + 1] === 0xcc) break;
    }
  };

  // 3. Registrations: `68 info 68 name B9 producer E8 <constructor>`.
  for (let p = 15; p + 5 <= bytes.length; p++) {
    if (bytes[p] !== 0xe8 || bytes[p - 15] !== 0x68 || bytes[p - 10] !== 0x68 || bytes[p - 5] !== 0xb9) continue;
    const thunk = thunkOf.get(rel(p + 1));
    if (thunk === undefined) continue;
    const nameBytes = image.cstringAtVa(view.getUint32(p - 9, true), 128);
    if (!nameBytes) continue;
    const name = decodeText(nameBytes);
    if (result.has(name)) continue;

    // Usually an incremental-link thunk (E9 rel32); some producers point straight at Create.
    const jump = image.bytesAtVa(thunk, 5);
    if (!jump) continue;
    const create = jump[0] === 0xe9 ? thunk + 5 + new DataView(jump.buffer, jump.byteOffset, 5).getInt32(1, true) : thunk;
    const stamped = new Set<string>();
    stampedBy(create, 0, stamped);

    const agreeing = [...stamped].filter((c) => namesAgree(name, c));
    let className = agreeing.length === 1 ? agreeing[0]! : null;
    const nameAgrees = className !== null;
    if (!className && stamped.size) {
      // Fall back to the most derived stamped class: the one with the most bases.
      className = [...stamped].sort((a, b) => (vtables.bases.get(b)?.length ?? 0) - (vtables.bases.get(a)?.length ?? 0))[0]!;
    }
    const vtable = className ? vtables.byName.get(className) : undefined;
    if (className && vtable !== undefined) result.set(name, { name, className, vtable, nameAgrees });
  }
  return result;
}
