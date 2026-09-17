/** Bytes that don't have the structure a reader expects. `offset` is where the problem was found. */
export class FormatError extends Error {
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(`${message} (at 0x${Math.max(0, offset).toString(16).toUpperCase()})`);
    this.name = 'FormatError';
    this.offset = offset;
  }
}
