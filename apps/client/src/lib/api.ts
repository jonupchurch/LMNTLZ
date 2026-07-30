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

/**
 * How to get a fresh session token when the current one has expired.
 *
 * **Installed by `session.ts` rather than implemented here**, because renewing
 * means holding the renewal token, and this module deliberately holds nothing
 * that survives a reload. Transport stays transport.
 *
 * Returns `true` when a new session token is now in place. Anything else — a
 * revoked family, an expired renewal, no stored token at all — is `false`, and
 * the original `401` is what the caller sees.
 */
let renewSession: (() => Promise<boolean>) | null = null;

export const setRenewHandler = (fn: (() => Promise<boolean>) | null): void => {
  renewSession = fn;
};

async function send<T>(path: string, init: RequestInit, mayRenew: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);

  const res = await fetch(`${BASE}/v1${path}`, { ...init, headers });

  if (res.status === 401 && mayRenew && renewSession && (await renewSession())) {
    // **Exactly once.** A second 401 after a successful renewal is not a stale
    // session — it is a request the account is not allowed to make, and
    // retrying it forever would turn one refusal into a loop.
    return send<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody | null);
  return body as T;
}

/** A request that renews and retries once if the session has expired. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, true);
}

/**
 * A request that never attempts renewal.
 *
 * **The auth endpoints themselves use this**, because renewing in order to
 * renew is a loop with no base case — and because a `401` from `/auth/google`
 * or `/auth/renew` is the answer, not a condition to recover from.
 */
export async function apiUnauthenticated<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, false);
}

/**
 * The same request, for a route that answers with text rather than JSON.
 *
 * **Added for feature 012's CSV export, and deliberately not left to the caller.**
 * The obvious alternative was a bare `fetch` in the export component, which would
 * have needed the base URL and the session token exported from this module — and
 * would have **silently opted that one route out of renewal**, so a player whose
 * session had just expired would see an export fail where every other action
 * quietly recovered.
 *
 * Sharing `send`'s renew-once rule is the whole point; only the body parsing
 * differs.
 */
export async function apiText(path: string, init: RequestInit = {}): Promise<string> {
  return sendText(path, init, true);
}

async function sendText(path: string, init: RequestInit, mayRenew: boolean): Promise<string> {
  const headers = new Headers(init.headers);
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);

  const res = await fetch(`${BASE}/v1${path}`, { ...init, headers });

  if (res.status === 401 && mayRenew && renewSession && (await renewSession())) {
    return sendText(path, init, false);
  }

  if (!res.ok) {
    // A failing text route still answers JSON errors — `errors.ts` is global.
    const body = (await res.json().catch(() => null)) as unknown;
    throw new ApiError(res.status, body as ApiErrorBody | null);
  }

  return res.text();
}
