// Request and response shapes shared by @hbm/server and @hbm/editor.

export const API_VERSION = 1;

/** Header every state-changing request must carry. The page reads the value from /api/session. */
export const TOKEN_HEADER = 'x-hbm-token';

export interface HealthDTO {
  ok: true;
  version: string;
  apiVersion: number;
}

export interface SessionDTO {
  token: string;
  version: string;
  apiVersion: number;
}

export interface ErrorDTO {
  error: string;
}
