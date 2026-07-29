/**
 * Session custody and silent renewal.
 *
 * Feature 005 built and tested the whole server half — issuing, rotation, reuse
 * detection, revocation — and **nothing on the client ever called any of it**
 * until now. What these cover is the half that only exists in the browser: what
 * is persisted, what is thrown away, and what happens on the two failures that
 * look identical from a component and are not.
 *
 * ### The distinction that most of this file is about
 *
 * A refused renewal (`401`) and an unreachable server (network error, `503`)
 * both leave the player unable to make a request. **Only the first means the
 * session is over.** Treating the second as a sign-out discards a perfectly
 * valid thirty-day token because somebody went through a tunnel, and the player
 * has no idea why they were logged out.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setSessionToken } from '../../src/lib/api.js';
import {
  hasStoredSession,
  renew,
  resetSessionForTests,
  restore,
  signInWithGoogle,
  signOut,
} from '../../src/lib/session.js';

const RENEWAL_KEY = 'lmntlz.renewal';

interface Call {
  readonly path: string;
  readonly authorization: string | null;
  readonly body: unknown;
}

const calls: Call[] = [];

/** A queued reply. `network: true` rejects the way a dead connection does. */
interface Reply {
  status?: number;
  body?: unknown;
  network?: boolean;
}

const replies = new Map<string, Reply[]>();

const willAnswer = (path: string, ...queue: Reply[]): void => {
  replies.set(path, [...(replies.get(path) ?? []), ...queue]);
};

const pair = (n: number) => ({
  session: { token: `session-${n}`, expiresAt: new Date(Date.now() + 900_000).toISOString() },
  renewal: { token: `renewal-${n}` },
  account: { id: 'acc-1', username: 'Reyna', createdAt: '2026-01-01T00:00:00.000Z' },
});

const pathsCalled = (): string[] => calls.map((c) => c.path);
const countOf = (path: string): number => pathsCalled().filter((p) => p === path).length;

beforeEach(() => {
  calls.length = 0;
  replies.clear();
  localStorage.clear();
  resetSessionForTests();

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^.*\/v1/, '');
    const headers = new Headers(init?.headers);

    calls.push({
      path,
      authorization: headers.get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    const reply = replies.get(path)?.shift() ?? { status: 200, body: {} };
    if (reply.network) throw new TypeError('Failed to fetch');

    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signing in', () => {
  it('spends the Google token and keeps only what has to outlive the page', async () => {
    willAnswer('/auth/google', { status: 200, body: pair(1) });

    const account = await signInWithGoogle('google-id-token');

    expect(account.username).toBe('Reyna');
    expect(calls[0]?.body).toEqual({ idToken: 'google-id-token' });

    /**
     * **The renewal token persists and the session token does not.** The
     * session token is on every request and worthless in fifteen minutes; the
     * renewal token is sent to exactly one endpoint and has to survive a
     * reload. Storing the wrong one of the two is the whole mistake.
     */
    expect(localStorage.getItem(RENEWAL_KEY)).toBe('renewal-1');
    expect(JSON.stringify(localStorage)).not.toContain('session-1');

    willAnswer('/roster', { status: 200, body: { heroes: [] } });
    await api('/roster');
    expect(calls[1]?.authorization).toBe('Bearer session-1');
  });
});

describe('an expired session renews itself', () => {
  it('renews on a 401 and retries the original request with the new token', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    setSessionToken('stale');

    willAnswer('/roster', { status: 401, body: { error: { code: 'unauthenticated', message: 'x' } } });
    willAnswer('/auth/renew', { status: 200, body: pair(2) });
    willAnswer('/roster', { status: 200, body: { heroes: ['aurelian'] } });

    const roster = await api<{ heroes: string[] }>('/roster');

    expect(roster.heroes).toEqual(['aurelian']);
    expect(pathsCalled()).toEqual(['/roster', '/auth/renew', '/roster']);

    // The retry must carry the NEW token. Retrying with the stale one would
    // loop, and the loop would look exactly like a slow request.
    expect(calls[2]?.authorization).toBe('Bearer session-2');
    expect(localStorage.getItem(RENEWAL_KEY)).toBe('renewal-2');
  });

  it('retries exactly once, so a genuine refusal is not a loop', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');

    const denied = { status: 401, body: { error: { code: 'unauthenticated', message: 'x' } } };
    willAnswer('/squads', denied, denied);
    willAnswer('/auth/renew', { status: 200, body: pair(2) });

    await expect(api('/squads')).rejects.toBeInstanceOf(ApiError);

    // Two attempts at the route and one renewal — never a third attempt.
    expect(countOf('/squads')).toBe(2);
    expect(countOf('/auth/renew')).toBe(1);
  });

  it('renews once for several requests that expire together', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');

    const denied = { status: 401, body: { error: { code: 'unauthenticated', message: 'x' } } };
    willAnswer('/roster', denied, { status: 200, body: {} });
    willAnswer('/squads', denied, { status: 200, body: {} });
    willAnswer('/auth/renew', { status: 200, body: pair(2) });

    await Promise.all([api('/roster'), api('/squads')]);

    /**
     * Single-flight. The server would survive a double renewal — a token
     * replayed inside its window returns the same pair byte-identically (005
     * case 2) — but a second round trip on every screen that loads two things
     * at once is a cost paid on every sign-in for nothing.
     */
    expect(countOf('/auth/renew')).toBe(1);
  });

  it('never tries to renew its way into the auth endpoints', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/google', {
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'bad token' } },
    });

    await expect(signInWithGoogle('forged')).rejects.toBeInstanceOf(ApiError);

    // Renewing in order to sign in is a loop with no base case.
    expect(countOf('/auth/renew')).toBe(0);
  });
});

describe('what a failed renewal means', () => {
  it('signs the player out when the renewal is REFUSED', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/renew', {
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'x' } },
    });

    expect(await renew()).toBe(false);

    // Expired, revoked, or its family killed by a reuse. The token is worthless
    // and keeping it means retrying it on every request forever.
    expect(localStorage.getItem(RENEWAL_KEY)).toBeNull();
    expect(hasStoredSession()).toBe(false);
  });

  it('keeps the token when the server could not be REACHED', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/renew', { network: true });

    expect(await renew()).toBe(false);

    /**
     * **The distinction this whole file exists for.** A dropped connection says
     * nothing about whether the token is valid, and discarding it would sign a
     * player out for going through a tunnel — then show them a landing page
     * with no explanation, on a session that was fine.
     */
    expect(localStorage.getItem(RENEWAL_KEY)).toBe('renewal-1');
    expect(hasStoredSession()).toBe(true);
  });

  it('keeps the token when the server is down', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/renew', {
      status: 503,
      body: { error: { code: 'maintenance', message: 'x' } },
    });

    expect(await renew()).toBe(false);
    expect(localStorage.getItem(RENEWAL_KEY)).toBe('renewal-1');
  });
});

describe('restoring on page load', () => {
  it('makes no request at all for a visitor who was never signed in', async () => {
    expect(hasStoredSession()).toBe(false);
    expect(await restore()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rebuilds the session from the stored renewal token', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/renew', { status: 200, body: pair(2) });

    const account = await restore();

    expect(account?.username).toBe('Reyna');
    expect(pathsCalled()).toEqual(['/auth/renew']);
  });
});

describe('signing out', () => {
  it('drops local state first and revokes the family after', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/revoke', { status: 204 });

    await signOut();

    expect(localStorage.getItem(RENEWAL_KEY)).toBeNull();
    expect(calls[0]?.path).toBe('/auth/revoke');
    expect(calls[0]?.body).toEqual({ renewal: 'renewal-1' });
  });

  it('still signs out locally when revocation cannot be delivered', async () => {
    localStorage.setItem(RENEWAL_KEY, 'renewal-1');
    willAnswer('/auth/revoke', { network: true });

    await expect(signOut()).resolves.toBeUndefined();

    /**
     * A sign-out that leaves the player signed in because the network was
     * unavailable is the wrong failure — especially on a shared machine, which
     * is the only reason anybody clicks it urgently.
     */
    expect(localStorage.getItem(RENEWAL_KEY)).toBeNull();
  });
});
