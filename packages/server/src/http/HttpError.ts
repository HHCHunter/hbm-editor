/** An error with the status code and message the client should see. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function requireString(query: Record<string, unknown>, name: string): string {
  const value = query[name];
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `the "${name}" query parameter is required`);
  return value;
}

export function optionalInt(query: Record<string, unknown>, name: string): number | undefined {
  const value = query[name];
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `"${name}" must be a whole number`);
  return n;
}

export function requireInt(query: Record<string, unknown>, name: string): number {
  const n = optionalInt(query, name);
  if (n === undefined) throw new HttpError(400, `the "${name}" query parameter is required`);
  return n;
}
