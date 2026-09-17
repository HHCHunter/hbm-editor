import { hex, u16At, u32At } from '../binary/bytes';
import { FormatError } from '../binary/FormatError';
import { asciiLowerString, decodeText } from '../binary/text';
import type { Codec, RandomAccess } from '../io';

// The scene archive index, read the way FsZip_t does it (engine/zstdlib/iozip.cpp):
// findEOCDOffset 0x0002B930 locates the end record, initializeFileCache 0x0002BE90 walks the
// central directory into CFastLookupFileCache_t, which is keyed by name with '\' == '/' and
// ASCII case ignored.

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
/** MSVC's multi-character constant 'Rune': the bytes "enuR" read as a little-endian u32. */
const SIG_RUNE = 0x52756e65;
const EOCD_FIELDS = 18;
const CENTRAL_FIXED = 42;
const LOCAL_FIXED = 30;
const SCAN_CHUNK = 0x10000;

export interface ZipEntry {
  name: string;
  /** The lookup key: '\' and '/' are equivalent and ASCII case is ignored. */
  key: string;
  versionNeeded: number;
  flags: number;
  /** 0 stored, 8 deflate. */
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Where this entry's central directory record starts. */
  recordOffset: number;
  localHeaderOffset: number;
  /**
   * Where the engine reads the member's data from: the local header offset plus 30 plus the
   * name length. It never reads the local header's own extra-field length.
   */
  dataOffset: number;
}

export interface ZipDirectory {
  /** Every indexed member, in central directory order. Records with an empty name are skipped. */
  entries: ZipEntry[];
  byKey: Map<string, ZipEntry>;
  eocdOffset: number;
  centralDirectoryOffset: number;
  /** True when a 'Rune' duplicate end record supplied the central directory location. */
  usedRuneRecord: boolean;
  problems: string[];
}

interface EndRecord {
  entriesTotal: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
}

export function memberKey(name: string): string {
  return asciiLowerString(name.replace(/\\/g, '/'));
}

export function findMember(directory: ZipDirectory, name: string): ZipEntry | undefined {
  return directory.byKey.get(memberKey(name));
}

function parseEndRecord(fields: Uint8Array): EndRecord {
  return {
    entriesTotal: u16At(fields, 6),
    centralDirectorySize: u32At(fields, 8),
    centralDirectoryOffset: u32At(fields, 12),
  };
}

/**
 * Scan backwards from 22 bytes before the end, one byte at a time, for the end record. Any 'Rune'
 * record met on the way is remembered; the last one seen (furthest from the end) wins.
 */
async function scanForEndRecord(
  src: RandomAccess,
): Promise<{ offset: number; fields: Uint8Array; rune: Uint8Array | null } | null> {
  let pos = src.size - 22;
  let rune: Uint8Array | null = null;
  while (pos >= 0) {
    const chunkStart = Math.max(0, pos - SCAN_CHUNK + 1);
    const wanted = pos + 4 + EOCD_FIELDS - chunkStart;
    const chunk = await src.read(chunkStart, wanted);
    if (chunk.length < wanted) throw new FormatError('archive is shorter than its reported size', chunkStart);
    for (; pos >= chunkStart; pos--) {
      const at = pos - chunkStart;
      const signature = u32At(chunk, at);
      if (signature === SIG_RUNE) {
        rune = chunk.slice(at + 4, at + 4 + EOCD_FIELDS);
      } else if (signature === SIG_EOCD) {
        return { offset: pos, fields: chunk.slice(at + 4, at + 4 + EOCD_FIELDS), rune };
      }
    }
  }
  return null;
}

export async function readZipDirectory(src: RandomAccess): Promise<ZipDirectory> {
  const scan = await scanForEndRecord(src);
  if (!scan) throw new FormatError('no end-of-central-directory record', Math.max(0, src.size - 22));

  const end = parseEndRecord(scan.fields);
  const rune = scan.rune ? parseEndRecord(scan.rune) : null;
  // initializeFileCache seeks to the 'Rune' copy's directory when that copy's size is non-zero.
  const usedRuneRecord = rune !== null && rune.centralDirectorySize !== 0;
  const centralDirectoryOffset = usedRuneRecord ? rune.centralDirectoryOffset : end.centralDirectoryOffset;
  if (centralDirectoryOffset > src.size) {
    throw new FormatError(`central directory offset ${hex(centralDirectoryOffset)} is past the end`, scan.offset);
  }

  const region = await src.read(centralDirectoryOffset, src.size - centralDirectoryOffset);
  const entries: ZipEntry[] = [];
  const byKey = new Map<string, ZipEntry>();
  const problems: string[] = [];

  let p = 0;
  while (p < region.length) {
    const recordOffset = centralDirectoryOffset + p;
    if (p + 4 > region.length) {
      problems.push(`central directory ends mid-signature at ${hex(recordOffset)}`);
      break;
    }
    const signature = u32At(region, p);
    if (signature !== SIG_CENTRAL) {
      // The end record and the 'Rune' tag end the directory cleanly; anything else is an error
      // the engine records before it stops indexing.
      if (signature !== SIG_EOCD && signature !== SIG_RUNE) {
        problems.push(`unexpected signature ${hex(signature)} in the central directory at ${hex(recordOffset)}`);
      }
      break;
    }
    const fields = p + 4;
    if (fields + CENTRAL_FIXED > region.length) {
      problems.push(`central directory record at ${hex(recordOffset)} is truncated`);
      break;
    }
    const nameLength = u16At(region, fields + 0x18);
    const extraLength = u16At(region, fields + 0x1a);
    const commentLength = u16At(region, fields + 0x1c);
    const next = fields + CENTRAL_FIXED + nameLength + extraLength + commentLength;
    if (next > region.length) {
      problems.push(`central directory record at ${hex(recordOffset)} runs past the end of the archive`);
      break;
    }

    if (nameLength > 0) {
      const name = decodeText(region.subarray(fields + CENTRAL_FIXED, fields + CENTRAL_FIXED + nameLength));
      const localHeaderOffset = u32At(region, fields + 0x26);
      const entry: ZipEntry = {
        name,
        key: memberKey(name),
        versionNeeded: u16At(region, fields + 0x02),
        flags: u16At(region, fields + 0x04),
        method: u16At(region, fields + 0x06),
        dosTime: u16At(region, fields + 0x08),
        dosDate: u16At(region, fields + 0x0a),
        crc32: u32At(region, fields + 0x0c),
        compressedSize: u32At(region, fields + 0x10),
        uncompressedSize: u32At(region, fields + 0x14),
        recordOffset,
        localHeaderOffset,
        dataOffset: localHeaderOffset + nameLength + LOCAL_FIXED,
      };
      entries.push(entry);
      if (byKey.has(entry.key)) problems.push(`more than one member is named ${name}`);
      else byKey.set(entry.key, entry);
    }
    p = next;
  }

  if (!usedRuneRecord && entries.length !== end.entriesTotal) {
    problems.push(`end record lists ${end.entriesTotal} entries but the directory holds ${entries.length}`);
  }

  return { entries, byKey, eocdOffset: scan.offset, centralDirectoryOffset, usedRuneRecord, problems };
}

/**
 * Check a member's local header against the data offset the engine computes, which assumes the
 * local header has no extra field. Returns a description of the problem, or null.
 */
export async function checkLocalHeader(src: RandomAccess, entry: ZipEntry): Promise<string | null> {
  const header = await src.read(entry.localHeaderOffset, LOCAL_FIXED);
  if (header.length < LOCAL_FIXED) return `${entry.name}: local header is truncated`;
  if (u32At(header, 0) !== SIG_LOCAL) {
    return `${entry.name}: no local header at ${hex(entry.localHeaderOffset)}`;
  }
  const actual = entry.localHeaderOffset + LOCAL_FIXED + u16At(header, 26) + u16At(header, 28);
  if (actual !== entry.dataOffset) {
    return `${entry.name}: data starts at ${hex(actual)} but the engine reads from ${hex(entry.dataOffset)}`;
  }
  return null;
}

export async function readMember(src: RandomAccess, entry: ZipEntry, codec: Codec): Promise<Uint8Array> {
  const data = await src.read(entry.dataOffset, entry.compressedSize);
  if (data.length !== entry.compressedSize) {
    throw new FormatError(`${entry.name} is truncated`, entry.dataOffset);
  }
  if (entry.method === 0) return data;
  if (entry.method === 8) return codec.inflateRaw(data, entry.uncompressedSize);
  throw new FormatError(`${entry.name} uses compression method ${entry.method}`, entry.recordOffset);
}
