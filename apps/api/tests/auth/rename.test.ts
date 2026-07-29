/**
 * **A renamed player breaks nothing.**
 *
 * Trivial to assert today and it is the regression that catches somebody later
 * "simplifying" by keying a table on the username. When that happens it will not
 * look like a mistake — it will look like removing a redundant join — and the
 * damage only appears the first time somebody renames, by which point the
 * orphaned rows are real player history.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { identities } from '../../src/db/schema/identities.js';
import { renewalTokens } from '../../src/db/schema/renewalTokens.js';
import { usernameChanges } from '../../src/db/schema/usernameChanges.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';
import { renameAccount, RenameRejectedError } from '../../src/auth/rename.js';
import { RENAMES_PER_WINDOW, RENAME_COST_SHARDS } from '../../src/auth/username.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const created: string[] = [];
let restore: (() => void) | undefined;

const tokenIsSubject: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

beforeAll(() => {
  restore = overrideProvider('google', tokenIsSubject);
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
  return { session: body.session.token, accountId: body.account.id, username: body.account.username };
}

const putUsername = (username: string, token: string) =>
  app.request('/v1/me/username', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  });

describe('a rename orphans nothing', () => {
  it('leaves every attached record pointing at the same account', async () => {
    const { session, accountId } = await signIn(`ren-a-${RUN}`);

    // Records across several tables, exactly as a real account accumulates:
    // an identity from sign-in and a renewal-token family from the same.
    const before = {
      identities: await db().select().from(identities).where(eq(identities.accountId, accountId)),
      tokens: await db().select().from(renewalTokens).where(eq(renewalTokens.accountId, accountId)),
    };
    expect(before.identities.length).toBeGreaterThan(0);
    expect(before.tokens.length).toBeGreaterThan(0);

    expect((await putUsername(`Renamed${RUN}`, session)).status).toBe(200);

    const after = {
      identities: await db().select().from(identities).where(eq(identities.accountId, accountId)),
      tokens: await db().select().from(renewalTokens).where(eq(renewalTokens.accountId, accountId)),
    };

    // **Zero orphans.** Same counts, same account id, nothing dangling.
    expect(after.identities).toHaveLength(before.identities.length);
    expect(after.tokens).toHaveLength(before.tokens.length);
    for (const row of [...after.identities, ...after.tokens]) {
      expect(row.accountId).toBe(accountId);
    }
  });

  it('keeps the session valid — a rename is not a sign-out', async () => {
    // Tokens carry `sub: accountId`, which did not change. If a session died on
    // rename, the token would have been carrying the username.
    const { session } = await signIn(`ren-b-${RUN}`);
    await putUsername(`Steady${RUN}`, session);

    const me = await app.request('/v1/me', { headers: { authorization: `Bearer ${session}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { username: string }).username).toBe(`Steady${RUN}`);
  });

  it('records the previous name, so a stale report stays resolvable', async () => {
    const { session, accountId, username } = await signIn(`ren-c-${RUN}`);
    await putUsername(`Fresh${RUN}`, session);

    const [change] = await db()
      .select()
      .from(usernameChanges)
      .where(eq(usernameChanges.accountId, accountId));

    expect(change!.previousUsername).toBe(username);
    expect(change!.newUsername).toBe(`Fresh${RUN}`);
    expect(change!.forced).toBe(false);
  });
});

describe('the rename endpoint', () => {
  it('returns the display form exactly as typed', async () => {
    const { session } = await signIn(`ren-d-${RUN}`);
    const typed = `Reyna_TwoRivers${RUN}`.slice(0, 16);

    const res = await putUsername(typed, session);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { username: string }).username).toBe(typed);

    // And `/v1/me` agrees — never the folded key.
    const me = await app.request('/v1/me', { headers: { authorization: `Bearer ${session}` } });
    expect(((await me.json()) as { username: string }).username).toBe(typed);
  });

  it('is 422 with a specific reason for a bad name', async () => {
    const { session } = await signIn(`ren-e-${RUN}`);

    for (const [name, code] of [
      ['ab', 'too-short'],
      ['a'.repeat(20), 'too-long'],
      ['has space', 'charset'],
      ['_lead', 'leading-underscore'],
      ['admin', 'reserved'],
    ] as const) {
      const res = await putUsername(name, session);
      expect(res.status, name).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code, name).toBe(code);
    }
  });

  it('is 409 NAMING which rule matched', async () => {
    const holder = await signIn(`ren-f1-${RUN}`);
    const other = await signIn(`ren-f2-${RUN}`);
    const taken = `Held${RUN}`.slice(0, 16);
    expect((await putUsername(taken, holder.session)).status).toBe(200);

    // exact
    let res = await putUsername(taken, other.session);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { rule: string }).rule).toBe('exact');

    // case
    res = await putUsername(taken.toUpperCase(), other.session);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { rule: string }).rule).toBe('case');

    // confusable — the one a player cannot see by looking
    res = await putUsername(taken.replace('e', 'е'), other.session);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { rule: string }).rule).toBe('confusable');
  });

  it('needs a session, and has no path parameter that could name anybody else', async () => {
    expect(
      (
        await app.request('/v1/me/username', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'Nobody' }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('the allowance', () => {
  it('is free the first time and costs shards after', async () => {
    const { accountId } = await signIn(`ren-g-${RUN}`);

    const first = await renameAccount(accountId, `GA${RUN}`.slice(0, 16));
    expect(first.shardsCharged).toBe(0);

    const second = await renameAccount(accountId, `GB${RUN}`.slice(0, 16));
    expect(second.shardsCharged).toBe(RENAME_COST_SHARDS);
  });

  it('refuses a fourth change in the window, shards or not', async () => {
    // **Not an anti-spend measure.** A player willing to pay is still refused,
    // because a name that changes hourly defeats every human-scale mechanism
    // that depends on recognising an opponent.
    const { accountId } = await signIn(`ren-h-${RUN}`);

    for (let i = 0; i < RENAMES_PER_WINDOW; i++) {
      await renameAccount(accountId, `H${i}${RUN}`.slice(0, 16), { shardsAvailable: 1_000_000 });
    }

    await expect(
      renameAccount(accountId, `HX${RUN}`.slice(0, 16), { shardsAvailable: 1_000_000 }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('is 402 when shards are short', async () => {
    const { accountId } = await signIn(`ren-i-${RUN}`);
    await renameAccount(accountId, `IA${RUN}`.slice(0, 16)); // free

    await expect(
      renameAccount(accountId, `IB${RUN}`.slice(0, 16), { shardsAvailable: 0 }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('makes a FORCED rename free and does not spend the allowance', async () => {
    // Moderation's action, not the player's choice. Charging them for it, or
    // burning one of their three, would be a second punishment nobody decided on.
    const { accountId } = await signIn(`ren-j-${RUN}`);

    for (let i = 0; i < RENAMES_PER_WINDOW; i++) {
      await renameAccount(accountId, `J${i}${RUN}`.slice(0, 16), { shardsAvailable: 1_000_000 });
    }
    await expect(renameAccount(accountId, `JX${RUN}`.slice(0, 16))).rejects.toMatchObject({
      status: 429,
    });

    // The moderator can still act.
    const forced = await renameAccount(accountId, `Sanctioned${RUN}`.slice(0, 16), { forced: true });
    expect(forced.shardsCharged).toBe(0);
  });

  it('refuses a no-op rename rather than charging for it', async () => {
    const { accountId } = await signIn(`ren-k-${RUN}`);
    const name = `KA${RUN}`.slice(0, 16);
    await renameAccount(accountId, name);

    await expect(renameAccount(accountId, name)).rejects.toBeInstanceOf(RenameRejectedError);
  });
});
