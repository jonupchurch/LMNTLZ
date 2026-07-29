/**
 * The one place the client talks to the server.
 *
 * ### The base URL is configuration, not a constant
 *
 * Three deployments, three answers, and only one of them is same-origin:
 *
 * | Where | Base |
 * |---|---|
 * | `pnpm dev` | `http://localhost:3000` — a different port, so cross-origin |
 * | web 1.0 | same origin if the client is served by the API's project, otherwise its URL |
 * | Steam | **always cross-origin** — the bundle loads from disk |
 *
 * The Steam row is why this cannot be hard-coded and why the API needs CORS
 * regardless of how the web build is hosted. `VITE_API_BASE_URL` is baked in at
 * build time; an empty value means same-origin, which is the safest default for
 * a bundle that might be served from anywhere.
 */

const BASE = (import.meta.env['VITE_API_BASE_URL'] ?? '').replace(/\/$/, '');

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
  readonly [key: string]: unknown;
}

/**
 * A failed request, carrying the server's own code and message.
 *
 * **The status and the code are both kept** because they answer different
 * questions: the status says how to react (retry, re-auth, give up) and the code
 * says what to tell the player. Collapsing them into a string loses the first.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error?.message ?? `Request failed with ${status}.`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'unknown';
    this.body = body;
  }
}

let sessionToken: string | null = null;

/** Set after sign-in. Held in memory only — never `localStorage`, which is
 *  readable by any script that gets injected into the page. */
export const setSessionToken = (token: string | null): void => {
  sessionToken = token;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);

  const res = await fetch(`${BASE}/v1${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody | null);
  return body as T;
}
