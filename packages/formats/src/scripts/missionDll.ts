import { decodeText } from '../binary/text';
import type { PeImage } from '../pe/PeImage';

// Mission logic is native code in Scriptcs/_gamerelease/<module>.dll (mission-dlls.md). Export
// ordinal 3, "Scripts", is a dword the engine ignores followed by a NULL-terminated array of
// _SCRIPTCREATOR pointers:
//   +0x00 char* name  +0x04 instance size  +0x10 base creator*  +0x1C Initialize()
// The engine walks it when attaching scene scripts (ScriptEngine::AttachSceneScripts 0x0003BF50).
// Pointers are preferred-base addresses, so no relocation is needed to read them from the file.

export const SCRIPTS_EXPORT_ORDINAL = 3;

export interface ScriptCreator {
  va: number;
  name: string;
  size: number;
  /** The base class's creator name, or null for a root class. */
  base: string | null;
  initializeVa: number;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_CREATORS = 10000;

export function readScriptCreators(dll: PeImage): ScriptCreator[] {
  const table = dll.exportsByOrdinal().get(SCRIPTS_EXPORT_ORDINAL);
  if (table === undefined) return [];
  const tableVa = dll.imageBase + table;

  const raw: { va: number; name: string; size: number; baseVa: number; initializeVa: number }[] = [];
  for (let i = 1; i < MAX_CREATORS; i++) {
    const creator = dll.u32AtVa(tableVa + i * 4);
    if (!creator) break;
    const nameBytes = dll.cstringAtVa(dll.u32AtVa(creator) ?? 0, 256);
    const name = nameBytes ? decodeText(nameBytes) : '';
    if (!IDENTIFIER.test(name)) break;
    raw.push({
      va: creator,
      name,
      size: dll.u32AtVa(creator + 4) ?? 0,
      baseVa: dll.u32AtVa(creator + 0x10) ?? 0,
      initializeVa: dll.u32AtVa(creator + 0x1c) ?? 0,
    });
  }

  const nameAt = new Map(raw.map((c) => [c.va, c.name]));
  return raw.map(({ baseVa, ...c }) => {
    let base: string | null = baseVa ? (nameAt.get(baseVa) ?? null) : null;
    if (baseVa && base === null) {
      // A base creator that isn't itself listed: read its name directly.
      const bytes = dll.cstringAtVa(dll.u32AtVa(baseVa) ?? 0, 256);
      base = bytes ? decodeText(bytes) : null;
    }
    return { ...c, base };
  });
}

/**
 * The creator a ScriptC's ScriptName asks for: `m11\m11_bartenderassassin` → `m11_m11_bartenderassassin`,
 * compared case-insensitively. This matches every serialized request in the shipped scenes the
 * recompilation checked, but the engine's own lookup isn't reimplemented yet.
 */
export function scriptCreatorKey(scriptName: string): string {
  return scriptName.replace(/[\\/.]/g, '_').toLowerCase();
}
