/**
 * **A token grants exactly one player's access, and never more.**
 *
 * This is the test for the failure that does not look like a failure. Every
 * route below works correctly for the player who owns the token — which is the
 * only case anybody writes a test for, because it is the only case anybody
 * thinks to try. The bug is what happens when a *valid* token meets *somebody
 * else's* data, and that requires deliberately being two people.
 *
 * Also the response-shape sweep (T047): no response anywhere may carry a
 * provider subject, an email, or a token hash. Storing is not exposing
 * (Constitution XVII), and the difference is one careless `select *`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { renewalTokens } from '../../src/db/schema/renewalTokens.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';
import { bearerFrom } from '../../src/auth/middleware.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const created: string[] = [];
let restore: (() => void) | undefined;

const EMAIL_A = `alice-${RUN}@example.test`;
const EMAIL_B = `bob-${RUN}@example.test`;

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({
          provider: 'google' as const,
          subject: token.slice(4),
          email: token.includes('alice') ? EMAIL_A : EMAIL_B,
        })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

beforeAll(() => {
  restore = overrideProvider('google', provider);
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

async function signIn(subject: string) {
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:${subject}` }),
  });
  const body = (await res.json()) as {
    session: { token: string };
    renewal: { token: string };
    account: { id: string; username: string };
  };
  if (!created.includes(body.account.id)) created.push(body.account.id);
  return { ...body.account, session: body.session.token, renewal: body.renewal.token };
}

describe('bearer parsing', () => {
  it('accepts any casing and rejects everything else', () => {
    expect(bearerFrom('Bearer abc')).toBe('abc');
    expect(bearerFrom('bearer abc')).toBe('abc');
    expect(bearerFrom('  BEARER   abc  ')).toBe('abc');

    for (const bad of [undefined, '', 'abc', 'Basic abc', 'Bearer', 'Bearer  ']) {
      expect(bearerFrom(bad), String(bad)).toBeNull();
    }
  });
});

describe("a token grants only its own player's access", () => {
  it('returns the holder, never the other player', async () => {
    const alice = await signIn(`alice-${RUN}`);
    const bob = await signIn(`bob-${RUN}`);
    expect(alice.id).not.toBe(bob.id);

    const asAlice = await app.request('/v1/me', {
      headers: { authorization: `Bearer ${alice.session}` },
    });
    const body = (await asAlice.json()) as { id: string };

    expect(body.id).toBe(alice.id);
    expect(body.id).not.toBe(bob.id);
  });

  it('renames the holder even when another account is named in the body', async () => {
    // **The escalation attempt.** A handler reading `accountId` from the body
    // would rename Bob. The convention guard greps for that shape; this proves
    // the behaviour rather than the absence of a string.
    const alice = await signIn(`alice2-${RUN}`);
    const bob = await signIn(`bob2-${RUN}`);
    const bobBefore = bob.username;

    const res = await app.request('/v1/me/username', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${alice.session}` },
      body: JSON.stringify({ username: `Claimed${RUN}`.slice(0, 16), accountId: bob.id, targetId: bob.id }),
    });
    expect(res.status).toBe(200);

    const [bobRow] = await db().select().from(accounts).where(eq(accounts.id, bob.id));
    const [aliceRow] = await db().select().from(accounts).where(eq(accounts.id, alice.id));

    expect(bobRow!.username, "Bob's name changed — the body was trusted").toBe(bobBefore);
    expect(aliceRow!.username).toBe(`Claimed${RUN}`.slice(0, 16));
  });

  it('cannot link an identity onto another account by naming it', async () => {
    const alice = await signIn(`alice3-${RUN}`);
    const bob = await signIn(`bob3-${RUN}`);

    await app.request('/v1/auth/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${alice.session}` },
      body: JSON.stringify({ provider: 'steam', token: 'sub:steamX', accountId: bob.id }),
    });

    // Whatever the status, the identity must not have landed on Bob.
    const me = await app.request('/v1/me', { headers: { authorization: `Bearer ${bob.session}` } });
    const body = (await me.json()) as { identities: { provider: string }[] };
    expect(body.identities.map((i) => i.provider)).toEqual(['google']);
  });

  it("cannot revoke another player's session without their token", async () => {
    const alice = await signIn(`alice4-${RUN}`);
    const bob = await signIn(`bob4-${RUN}`);

    // Revocation is keyed on the renewal token itself, which Alice does not
    // hold. There is no account parameter to abuse.
    await app.request('/v1/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${alice.session}` },
      body: JSON.stringify({ renewal: 'not-bobs-token', accountId: bob.id }),
    });

    const still = await app.request('/v1/me', {
      headers: { authorization: `Bearer ${bob.session}` },
    });
    expect(still.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// T047 — the response-shape sweep
// ---------------------------------------------------------------------------

describe('no response carries a subject, an email or a token hash', () => {
  it('holds across every endpoint that returns a body', async () => {
    const alice = await signIn(`sweep-${RUN}`);
    const subject = `sweep-${RUN}`;

    const responses = await Promise.all([
      app.request('/v1/me', { headers: { authorization: `Bearer ${alice.session}` } }),
      app.request('/v1/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: `sub:${subject}` }),
      }),
      app.request('/v1/auth/renew', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ renewal: alice.renewal }),
      }),
      app.request('/v1/health'),
      app.request('/v1/nope'),
    ]);

    const [stored] = await db()
      .select({ tokenHash: renewalTokens.tokenHash })
      .from(renewalTokens)
      .where(eq(renewalTokens.accountId, alice.id))
      .limit(1);

    // Asserted rather than `!`-ed: if this row were missing, every "does the
    // response contain the hash?" check below would compare against `undefined`
    // and pass vacuously — a sweep that proves nothing while looking thorough.
    expect(stored?.tokenHash, 'no stored token to check responses against').toBeTruthy();
    const tokenHash = stored!.tokenHash;

    for (const res of responses) {
      const text = await res.text();

      // The provider subject is Google's identifier for this person. We store
      // it because identity requires it; exposing it hands one player a stable
      // cross-service handle on another.
      expect(text, 'a response leaked the provider subject').not.toContain(subject);
      expect(text, 'a response leaked an email').not.toContain(EMAIL_A);
      expect(text, 'a response leaked an email').not.toContain(EMAIL_B);
      expect(text, 'a response leaked a token hash').not.toContain(tokenHash);
      expect(text.toLowerCase()).not.toContain('providersubject');
      expect(text.toLowerCase()).not.toContain('tokenhash');
      expect(text.toLowerCase()).not.toContain('usernamekey');
    }
  });
});
