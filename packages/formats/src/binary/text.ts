/**
 * Windows-1252's characters for bytes 0x80–0x9F; every other byte is its own code point. The table
 * is explicit because Node's TextDecoder treats "windows-1252" as ISO-8859-1 and browsers don't.
 */
const CP1252_HIGH =
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ' +
  '‘’“”•–—˜™š›œžŸ';

/** Decode a game string. The engine's strings are single-byte; they're shown as Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x2000) {
    const chunk = Array.from(bytes.subarray(i, i + 0x2000), (b) =>
      b >= 0x80 && b <= 0x9f ? CP1252_HIGH.charCodeAt(b - 0x80) : b,
    );
    out += String.fromCharCode(...chunk);
  }
  return out;
}

/** One byte per character, for comparing against the engine's single-byte names. */
export function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new RangeError(`"${text}" contains a character that doesn't fit in a single byte`);
    }
    out[i] = code;
  }
  return out;
}

/** ASCII-only lower-casing, as the C runtime's _strnicmp and _stricmp do in the "C" locale. */
export function asciiLower(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

export function asciiLowerString(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}
