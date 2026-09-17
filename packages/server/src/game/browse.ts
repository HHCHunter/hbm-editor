import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveGameDir } from '@hbm/formats/node';
import type { BrowseDTO, BrowseEntryDTO } from '@hbm/protocol';
import { HttpError } from '../http/HttpError';

// A folder browser for choosing the game install. A web page can't learn real file paths, so the
// server lists folders instead. It only shows folders and .exe files, and the server only ever
// listens on loopback.

const EXE_NAME = 'hitmanbloodmoney.exe';

function topLevel(): BrowseDTO {
  const entries: BrowseEntryDTO[] = [];
  if (process.platform === 'win32') {
    // A: and B: are skipped: probing an empty floppy drive can stall.
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const drive = `${letter}:\\`;
      if (existsSync(drive)) entries.push({ name: drive, path: drive, kind: 'drive', isGame: false });
    }
  } else {
    entries.push({ name: '/', path: '/', kind: 'drive', isGame: false });
  }
  entries.push({ name: 'Home', path: homedir(), kind: 'dir', isGame: resolveGameDir(homedir()) !== null });
  return { path: null, parent: null, entries, gameRoot: null };
}

export async function browse(target: string | undefined): Promise<BrowseDTO> {
  if (!target) return topLevel();

  let dir = path.resolve(target.trim().replace(/^"|"$/g, ''));
  try {
    if ((await stat(dir)).isFile()) dir = path.dirname(dir);
  } catch {
    throw new HttpError(404, `There's no folder at ${dir}`);
  }

  let listing;
  try {
    listing = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new HttpError(403, `${dir} can't be opened`);
  }

  const dirs: BrowseEntryDTO[] = [];
  const files: BrowseEntryDTO[] = [];
  for (const entry of listing) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, path: full, kind: 'dir', isGame: resolveGameDir(full) !== null });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        const isGame = entry.name.toLowerCase() === EXE_NAME && resolveGameDir(full) !== null;
        files.push({ name: entry.name, path: full, kind: 'file', isGame });
      }
    } catch {
      // Entries that can't be inspected are left out.
    }
  }
  const byName = (a: BrowseEntryDTO, b: BrowseEntryDTO) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  dirs.sort(byName);
  files.sort(byName);

  const parent = path.dirname(dir);
  return {
    path: dir,
    parent: parent === dir ? null : parent,
    entries: [...dirs, ...files],
    gameRoot: resolveGameDir(dir),
  };
}
