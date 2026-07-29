/**
 * The cross-origin policy.
 *
 * ### Why this exists, given the API could have been served same-origin
 *
 * The client is a **separate Vercel project**, so the browser build is
 * cross-origin. That much was a choice, and it could have gone the other way.
 * **The Steam build is cross-origin whether anyone chooses it or not** — the
 * bundle loads from disk, so there is no shared origin to fall back on and there
 * never will be. A same-origin web deployment would have postponed this file by
 * one release, not removed it. `apps/client/src/lib/api.ts` treats its base URL
 * as configuration for the same reason.
 *
 * ### Four decisions, none of which should be re-derived
 *
 * **The allowlist is exact-match, and it comes from the environment.** Not a
 * prefix, not a suffix, not a pattern. `startsWith('https://lmntlz')` also
 * matches `https://lmntlz.attacker.example`, and a suffix test on `.vercel.app`
 * hands the API to everybody who can deploy to Vercel — which is everybody.
 *
 * **`Access-Control-Allow-Credentials` is never sent.** Sessions are bearer
 * tokens held in memory, never cookies, so credentials mode buys nothing that is
 * used. Leaving it off means that even if a hostile origin somehow reached the
 * allowlist, the browser still would not attach cookies or client certificates
 * to the request — the mistake would cost one unauthenticated call rather than a
 * session.
 *
 * **`Origin: null` is refused.** That is what a sandboxed iframe and a `file://`
 * page send, so allowing it allows all of them at once, indistinguishably.
 * Electron will serve the bundle over a custom protocol with a real origin; that
 * origin joins the allowlist when it exists, and it is not `null`.
 *
 * **A request carrying no `Origin` at all is not a CORS request** and passes
 * through untouched — curl, the uptime check, any server-to-server caller. A
 * browser policy does not govern them and must not refuse them.
 */

import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

export const CORS_ORIGINS_VAR = 'CORS_ALLOWED_ORIGINS';

/**
 * Parse the comma-separated allowlist.
 *
 * **`*` and `null` are dropped rather than honoured.** They are the two values
 * that turn an allowlist into an open door, and the only way either arrives here
 * is a mistake — a copied snippet, or a shell that expanded a bare `*` against
 * the working directory. Dropping them silently means the failure mode of that
 * mistake is "cross-origin stops working", which somebody notices in a minute,
 * rather than "everything is permitted", which nobody notices at all.
 *
 * Trailing slashes are stripped from the *configuration*, because people write
 * `https://example.com/` in an env var. A browser never sends one.
 */
export function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, '').toLowerCase())
    .filter((entry) => entry.length > 0 && entry !== '*' && entry !== 'null');
}

let cached: { readonly raw: string | undefined; readonly list: readonly string[] } | null = null;

/**
 * Read the allowlist for this request.
 *
 * **Read per request, not once at module load**, so a test can set the variable
 * and a redeploy is not required to change it. Memoized on the raw string, so
 * the parse happens once per distinct value rather than once per request.
 */
function allowlist(): readonly string[] {
  const raw = process.env[CORS_ORIGINS_VAR];
  if (!cached || cached.raw !== raw) cached = { raw, list: parseAllowedOrigins(raw) };
  return cached.list;
}

/**
 * **Registered before every route, so a preflight is answered before auth runs.**
 *
 * A browser sends `OPTIONS` with no `Authorization` header — it is asking
 * permission to send the real request, and it has not sent a credential yet. If
 * `requireSession` sees that preflight first it answers `401`, the browser
 * treats the preflight as failed, and **every authenticated cross-origin call in
 * the game fails with an error message about CORS rather than about auth.**
 * Hono's `cors` returns the preflight response itself and never calls `next`,
 * which is what makes the ordering sufficient.
 */
export function corsMiddleware(): MiddlewareHandler {
  return cors({
    origin: (origin) => (allowlist().includes(origin.toLowerCase()) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Exactly what `apps/client/src/lib/api.ts` sends. A wider list is a longer
    // sentence describing what an attacker may put in a request.
    allowHeaders: ['content-type', 'authorization'],
    // 24h. The preflight is a round trip before the round trip; caching it is
    // most of the cost of cross-origin, and the policy changes on redeploys.
    maxAge: 86_400,
    credentials: false,
  });
}
