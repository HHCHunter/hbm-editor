import { asciiLowerString } from '../binary/text';

/** sub_00038E80: a case-insensitive "ends with". A name shorter than the tail never matches. */
function endsWithIgnoreCase(name: string, tail: string): boolean {
  return name.length >= tail.length && asciiLowerString(name.slice(-tail.length)) === tail;
}

/**
 * The archive member name the engine asks for, built from the scene's file name the way
 * ZEngineDataBase::CalcCacheFileName 0x0005A5B0 does:
 *
 *   Scenes\M01\M01_main.ZIP + "gms"  ->  Scenes\M01\M01_main.gms
 *
 * A name without an extension gets ".gms". A name ending in neither .gms nor .zip (ignoring case)
 * yields "", as does a .zip name with no '\'. Then exactly three characters after the last '.'
 * are overwritten with `ext3`.
 */
export function cacheFileName(sceneFileName: string, ext3: string | null): string {
  if (ext3 !== null && ext3.length !== 3) {
    throw new RangeError(`the extension must be three characters, got "${ext3}"`);
  }
  let name = sceneFileName;
  const lastSeparator = name.lastIndexOf('\\');
  const leaf = lastSeparator < 0 ? name : name.slice(lastSeparator);
  if (name.length !== 0 && !leaf.includes('.')) name += '.gms';

  if (!endsWithIgnoreCase(name, '.gms')) {
    if (!endsWithIgnoreCase(name, '.zip')) return '';
    const separator = name.lastIndexOf('\\');
    if (separator < 0) return '';
    // The engine splits off the leaf and appends it back after the separator literal.
    name = `${name.slice(0, separator)}\\${name.slice(separator + 1)}`;
  }

  if (ext3 !== null) {
    const dot = name.lastIndexOf('.');
    name = name.slice(0, dot + 1) + ext3 + name.slice(dot + 4);
  }
  return name;
}
