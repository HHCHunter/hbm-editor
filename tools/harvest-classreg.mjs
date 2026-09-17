// Collects the ZFactory geom class registrations from the recompilation's source, as numbers only:
// type id, the virtual addresses of the class and parent name strings, and the instance size.
// The class names themselves stay in the executable and are read from the user's copy at runtime.
//
// Registrations in the recompilation have this shape:
//   Reg_XXXX*(0x0097Bxxx)->Add(TYPEID, tmp.Init(reinterpret_cast<void*>(NAME_VA), SIZE,
//                                               reinterpret_cast<void*>(PARENT_VA), ...));
//
//   node tools/harvest-classreg.mjs [path to HitmanBloodMoneyRecompilation]
//
// Writes packages/formats/src/classreg/registrations.json.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recomp = path.resolve(process.argv[2] ?? path.join(root, '..', 'HitmanBloodMoneyRecompilation'));
const out = path.join(root, 'packages', 'formats', 'src', 'classreg', 'registrations.json');

const PATTERN = new RegExp(
  String.raw`->Add\(\s*0x([0-9A-Fa-f]{8})u?\s*,\s*` +
    String.raw`tmp\.Init\(\s*reinterpret_cast<void\*>\(\s*0x([0-9A-Fa-f]{8})u?\s*\)\s*,\s*` +
    String.raw`0x([0-9A-Fa-f]+)u?\s*,\s*` +
    String.raw`reinterpret_cast<void\*>\(\s*0x([0-9A-Fa-f]{8})u?\s*\)`,
  'g',
);

const files = (await readdir(path.join(recomp, 'src'), { recursive: true })).filter((f) =>
  /\.(cpp|cp|h)$/i.test(f),
);

const byTypeId = new Map();
let scanned = 0;
for (const file of files) {
  const text = await readFile(path.join(recomp, 'src', file), 'utf8');
  if (!text.includes('tmp.Init(')) continue;
  scanned++;
  for (const m of text.matchAll(PATTERN)) {
    const reg = {
      typeId: parseInt(m[1], 16),
      nameVa: parseInt(m[2], 16),
      parentVa: parseInt(m[4], 16),
      size: parseInt(m[3], 16),
    };
    const previous = byTypeId.get(reg.typeId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(reg)) {
      console.warn(`type id 0x${reg.typeId.toString(16)} is registered twice with different values (${file})`);
    }
    byTypeId.set(reg.typeId, reg);
  }
}

if (byTypeId.size === 0) {
  console.error(`No registrations found under ${path.join(recomp, 'src')}. Is that the recompilation repo?`);
  process.exit(1);
}

const registrations = [...byTypeId.values()].sort((a, b) => a.typeId - b.typeId);
await writeFile(out, `${JSON.stringify({ registrations }, null, 1)}\n`);
console.log(`${registrations.length} registrations from ${scanned} source files -> ${path.relative(root, out)}`);
