import { TOKEN_HEADER, type ErrorDTO, type SessionDTO } from '@hbm/protocol';

let session: SessionDTO | null = null;

/** A failed request, carrying the server's own explanation when it gave one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${path} failed (${res.status})`;
    try {
      message = ((await res.json()) as ErrorDTO).error ?? message;
    } catch {
      // Not a JSON error body.
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

/** Fetch the session token. Every later state-changing request has to send it back. */
export async function connect(): Promise<SessionDTO> {
  session = await getJson<SessionDTO>('/api/session');
  return session;
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await (await request(path, { signal })).json()) as T;
}

export async function getBytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  return new Uint8Array(await (await request(path, { signal })).arrayBuffer());
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (!session) throw new ApiError(0, 'Not connected to the local server');
  const res = await request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TOKEN_HEADER]: session.token },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}
