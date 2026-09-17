import { TOKEN_HEADER, type SessionDTO } from '@hbm/protocol';

let session: SessionDTO | null = null;

/** Fetch the session token. Every later state-changing request has to send it back. */
export async function connect(): Promise<SessionDTO> {
  const res = await fetch('/api/session');
  if (!res.ok) throw new Error(`The local server answered ${res.status}`);
  session = (await res.json()) as SessionDTO;
  return session;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  if (!session) throw new Error('Not connected to the local server');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TOKEN_HEADER]: session.token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return (await res.json()) as T;
}
