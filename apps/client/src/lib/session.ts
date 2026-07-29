/**
 * Who is signed in, and how they stay that way.
 *
 * Feature 005 built the whole server half — Google ID token verification, our
 * own token pair, rotation with reuse detection, revocation. **Nothing ever
 * called it.** No task in 005, 006 or 007 wired a client to it, and every user
 * story since has quietly assumed a session exists. This is that wiring.
 *
 * ### Two tokens, two custody rules, for two different reasons
 *
 * | | Lifetime | Where it lives | Why |
 * |---|---|---|---|
 * | session | 15 minutes | **memory only** | it is sent on every request, so it is the one an injected script would want, and it is worthless 15 minutes later |
 * | renewal | 30 days sliding | `localStorage` | it has to outlive the page, and nothing else here does |
 *
 * **`localStorage` is a real exposure and it is the deliberate choice**, so it
 * is worth writing down rather than discovering later. An HTTP-only cookie
 * would be strictly safer against script injection, and the API refuses cookies
 * on purpose: `cors.ts` sets `credentials: false`, because the Steam build
 * loads from disk with no origin a cookie could be scoped to. Moving to cookies
 * is not a storage change, it is a change to the origin model for every
 * deployment.
 *
 * What makes it acceptable is that a stolen renewal token is **detectable and
 * self-limiting**: tokens rotate on every use, and using an old one after its
 * successor has been used kills the entire family (005 case 3). A thief and the
 * player cannot both keep using it — the second one to renew ends the session
 * for both, which turns silent long-term theft into an incident the player
 * notices.
 *
 * ### The renewal replay window is what makes concurrency safe
 *
 * `POST /auth/renew` returns **the same pair, byte-identical**, for a token
 * replayed inside its window (005 case 2). So two requests renewing at once is
 * survivable rather than fatal. `renew()` still single-flights — a redundant
 * round trip is worth avoiding — but the safety comes from the server, not from
 * this file getting the concurrency right.
 */

import { ApiError, apiUnauthenticated, setRenewHandler, setSessionToken } from './api.js';

const RENEWAL_KEY = 'lmntlz.renewal';

export interface Account {
  readonly id: string;
  readonly username: string;
  readonly createdAt: string;
}

/** The body both `/auth/google` and `/auth/renew` return. */
interface AuthPair {
  readonly session: { readonly token: string; readonly expiresAt: string };
  readonly renewal: { readonly token: string };
  readonly account: Account;
}

/**
 * Every `localStorage` access is wrapped.
 *
 * It throws rather than returning null in more situations than it looks: a
 * browser with site data disabled, private mode on some engines, and a quota
 * that a completely unrelated key filled. **A player who cannot persist a
 * renewal token should still be able to play** — they simply sign in again
 * after a reload — so a storage failure degrades the session rather than
 * breaking the app.
 */
function readRenewal(): string | null {
  try {
    return globalThis.localStorage?.getItem(RENEWAL_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeRenewal(token: string | null): void {
  try {
    if (token === null) globalThis.localStorage?.removeItem(RENEWAL_KEY);
    else globalThis.localStorage?.setItem(RENEWAL_KEY, token);
  } catch {
    // Signed in for this page load only. See above.
  }
}

let account: Account | null = null;

export const currentAccount = (): Account | null => account;

/**
 * Whether a session is worth trying to rebuild — **synchronously**.
 *
 * The app uses this to pick its first render. Without it every visitor sees a
 * "restoring…" frame before the landing page, for a session that was never
 * going to exist; with it, only somebody who was actually signed in waits.
 */
export const hasStoredSession = (): boolean => readRenewal() !== null;

/** Take a freshly issued pair into custody. */
function adopt(pair: AuthPair): Account {
  setSessionToken(pair.session.token);
  writeRenewal(pair.renewal.token);
  account = pair.account;
  return pair.account;
}

/** Drop everything. **Local only** — revoking on the server is `signOut`. */
function forget(): void {
  setSessionToken(null);
  writeRenewal(null);
  account = null;
}

/**
 * Exchange a Google ID token for a session.
 *
 * The ID token is Google's, short-lived, and never stored — it is spent
 * immediately and the pair that comes back is what persists.
 */
export async function signInWithGoogle(idToken: string): Promise<Account> {
  const pair = await apiUnauthenticated<AuthPair>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  return adopt(pair);
}

let inFlight: Promise<boolean> | null = null;

/**
 * Trade the stored renewal token for a new pair.
 *
 * **Single-flight.** Concurrent callers await the same request rather than
 * racing; see the header for why a slip here would be survivable anyway.
 */
export function renew(): Promise<boolean> {
  inFlight ??= (async () => {
    try {
      const token = readRenewal();
      if (!token) return false;

      const pair = await apiUnauthenticated<AuthPair>('/auth/renew', {
        method: 'POST',
        body: JSON.stringify({ renewal: token }),
      });
      adopt(pair);
      return true;
    } catch (err) {
      /**
       * **A refused renewal is a sign-out; anything else is not.** A `401` means
       * the token is expired, revoked, or its family was killed — the session is
       * genuinely over and the stored token is now worthless. A network failure
       * or a `503` means the server could not answer, and discarding a valid
       * renewal token over a dropped connection would sign a player out for
       * being on a train.
       */
      if (err instanceof ApiError && err.status === 401) forget();
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Rebuild a session on page load, if there is one to rebuild.
 *
 * Returns the account, or `null` for a visitor. **No request at all when
 * nothing is stored** — a first-time visitor reaches the landing page without
 * waiting on the network.
 */
export async function restore(): Promise<Account | null> {
  if (!readRenewal()) return null;
  return (await renew()) ? account : null;
}

/**
 * Sign out here and on the server.
 *
 * **Local state is dropped first and unconditionally.** Revocation can fail —
 * offline, server down — and a sign-out that leaves the player signed in
 * because the network was unavailable is the wrong failure. The token is
 * discarded either way; `revoke` is idempotent, so a family that outlives one
 * failed call is cleaned up by its own expiry.
 */
export async function signOut(): Promise<void> {
  const token = readRenewal();
  forget();
  if (!token) return;

  try {
    await apiUnauthenticated<void>('/auth/revoke', {
      method: 'POST',
      body: JSON.stringify({ renewal: token }),
    });
  } catch {
    // Already signed out locally. Nothing to tell the player.
  }
}

/**
 * Installed once, on import.
 *
 * `api.ts` cannot renew on its own — it holds no renewal token by design — so
 * the two halves are joined here rather than by one module reaching into the
 * other. Importing this module anywhere is what makes every `api()` call
 * survive an expired session.
 */
setRenewHandler(renew);

/** Test-only: reset module state between cases. */
export function resetSessionForTests(): void {
  forget();
  inFlight = null;
}
