/**
 * The routes, driven through the **real Hono app** rather than by calling
 * handlers directly.
 *
 * Calling a handler tests the handler. Driving the app tests the routing, the
 * middleware order, the status codes, the JSON shapes and the 404 — and it is
 * the routing and the middleware order that are wrong in the ways nobody
 * notices. A handler that returns 403 correctly is worth nothing if the
 * middleware never runs.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import type { IdentityProvider } from '../../src/auth/provider.js';
import { InvalidProviderTokenError } from '../../src/auth/provider.js';

const SUBJECT = `test-subject-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
const created: string[] = [];
let restore: (() => void) | undefined;

/** A provider that accepts one token and rejects everything else. */
const fakeProvider = (subject = SUBJECT): IdentityProvider => ({
  name: 'google',
  verify: (token: string) => {
    if (token !== 'good-token') {
      return Promise.reject(new InvalidProviderTokenError('signature'));
    }
    return Promise.resolve({ provider: 'google' as const, subject, email: 'p@example.com' });
  },
});

beforeAll(() => {
  restore = overrideProvider('google', fakeProvider());
});

afterEach(() => {
  restore?.();
  restore = overrideProvider('google', fakeProvider());
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function signIn(): Promise<{ session: string; renewal: string; accountId: string }> {
  const res = await post('/v1/auth/google', { idToken: 'good-token' });
  const body = (await res.json()) as {
    session: { token: string };
    renewal: { token: string };
    account: { id: string };
  };
  if (!created.includes(body.account.id)) created.push(body.account.id);
  return { session: body.session.token, renewal: body.renewal.token, accountId: body.account.id };
}

describe('POST /v1/auth/google', () => {
  it('signs in, creates an account, and says so', async () => {
    const res = await post('/v1/auth/google', { idToken: 'good-token' });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, never>;
    created.push((body['account'] as unknown as { id: string }).id);

    expect(body['isNewAccount']).toBe(true);
    expect(body['session']).toHaveProperty('token');
    expect(body['renewal']).toHaveProperty('token');
    expect(body['account']).toHaveProperty('username');
  });

  it('returns the SAME account on the second sign-in', async () => {
    const first = await signIn();
    const res = await post('/v1/auth/google', { idToken: 'good-token' });
    const body = (await res.json()) as { account: { id: string }; isNewAccount: boolean };

    expect(body.account.id).toBe(first.accountId);
    expect(body.isNewAccount).toBe(false);
  });

  it('is 400 for a malformed request and 401 for a bad token — different things', async () => {
    // 400 says "your request is wrong"; 401 says "your credential is wrong".
    // Collapsing them sends a client debugging the wrong half of its code.
    expect((await post('/v1/auth/google', {})).status).toBe(400);
    expect((await post('/v1/auth/google', { idToken: 42 })).status).toBe(400);
    expect((await post('/v1/auth/google', { idToken: 'nope' })).status).toBe(401);
  });

  it('never says WHICH check failed', async () => {
    // A caller learning that its `aud` was wrong but its signature was fine has
    // been handed an oracle.
    const body = await (await post('/v1/auth/google', { idToken: 'nope' })).text();
    for (const leak of ['signature', 'aud', 'iss', 'exp', 'jwks', 'kid']) {
      expect(body.toLowerCase(), leak).not.toContain(leak);
    }
  });

  it('refuses a banned account with the scope and the expiry', async () => {
    const { accountId } = await signIn();
    const until = new Date(Date.now() + 86_400_000);
    await db()
      .update(accounts)
      .set({ bannedUntil: until, banScope: 'full' })
      .where(eq(accounts.id, accountId));

    const res = await post('/v1/auth/google', { idToken: 'good-token' });
    expect(res.status).toBe(403);

    const body = (await res.json()) as { scope: string; until: string };
    expect(body.scope).toBe('full');
    expect(new Date(body.until).getTime()).toBeCloseTo(until.getTime(), -3);

    await db()
      .update(accounts)
      .set({ bannedUntil: null, banScope: null })
      .where(eq(accounts.id, accountId));
  });

  it('lets an EXPIRED ban through — a timestamp, not a flag', async () => {
    // No job runs to lift a ban, so no job can fail and leave somebody banned
    // past their time.
    const { accountId } = await signIn();
    await db()
      .update(accounts)
      .set({ bannedUntil: new Date(Date.now() - 1000), banScope: 'full' })
      .where(eq(accounts.id, accountId));

    expect((await post('/v1/auth/google', { idToken: 'good-token' })).status).toBe(200);
  });
});

describe('POST /v1/auth/steam', () => {
  it('is 501 — the seam exists and is not wired', async () => {
    const res = await post('/v1/auth/steam', { ticket: 'anything' });
    expect(res.status).toBe(501);
  });
});

describe('POST /v1/auth/renew and /revoke', () => {
  it('renews to a new pair', async () => {
    const { renewal } = await signIn();
    const res = await post('/v1/auth/renew', { renewal });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { renewal: { token: string } };
    expect(body.renewal.token).not.toBe(renewal);
  });

  it('is 401 for an unknown renewal token', async () => {
    expect((await post('/v1/auth/renew', { renewal: 'nope' })).status).toBe(401);
  });

  it('revokes with 204, idempotently', async () => {
    const { renewal } = await signIn();

    expect((await post('/v1/auth/revoke', { renewal })).status).toBe(204);
    // Signing out twice is not an error.
    expect((await post('/v1/auth/revoke', { renewal })).status).toBe(204);
    // And the token is dead.
    expect((await post('/v1/auth/renew', { renewal })).status).toBe(401);
  });
});

describe('GET /v1/me', () => {
  it('needs a session', async () => {
    expect((await app.request('/v1/me')).status).toBe(401);
    expect(
      (await app.request('/v1/me', { headers: { authorization: 'Bearer nonsense' } })).status,
    ).toBe(401);
  });

  it('accepts `bearer` in any case', async () => {
    const { session } = await signIn();
    for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
      const res = await app.request('/v1/me', {
        headers: { authorization: `${scheme} ${session}` },
      });
      expect(res.status, scheme).toBe(200);
    }
  });

  it('returns the account and NEVER the subject, the email or a token', async () => {
    const { session } = await signIn();
    const res = await app.request('/v1/me', { headers: { authorization: `Bearer ${session}` } });

    expect(res.status).toBe(200);
    const text = await res.text();

    // Constitution XVII: storing is not exposing. The provider subject is
    // Google's identifier for this person and is nobody's business, including
    // their own client's.
    expect(text).not.toContain(SUBJECT);
    expect(text).not.toContain('p@example.com');
    expect(text).not.toContain(session);

    const body = JSON.parse(text) as { identities: { provider: string }[] };
    expect(body.identities[0]!.provider).toBe('google');
    expect(body.identities[0]).not.toHaveProperty('providerSubject');
    expect(body.identities[0]).not.toHaveProperty('email');
  });

  it('refuses a banned account holding a previously valid token', async () => {
    // **The reason the middleware hits the database.** Session tokens are
    // stateless and cannot be un-issued, so without this check a ban does not
    // take effect for up to fifteen minutes — which are precisely the minutes
    // somebody spends doing whatever got them banned.
    const { session, accountId } = await signIn();
    expect(
      (await app.request('/v1/me', { headers: { authorization: `Bearer ${session}` } })).status,
    ).toBe(200);

    await db()
      .update(accounts)
      .set({ bannedUntil: new Date(Date.now() + 86_400_000), banScope: 'chat' })
      .where(eq(accounts.id, accountId));

    const res = await app.request('/v1/me', { headers: { authorization: `Bearer ${session}` } });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { scope: string }).scope).toBe('chat');
  });
});

describe('the shared error shape', () => {
  it('is the same body for a 404 as for everything else', async () => {
    const res = await app.request('/v1/nope');
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(typeof body.error.message).toBe('string');
  });

  it('404s an unversioned path — a route that happens to work is a route somebody depends on', async () => {
    expect((await app.request('/me')).status).toBe(404);
    expect((await app.request('/auth/google', { method: 'POST' })).status).toBe(404);
  });
});
