/**
 * **One player, two doors, one account.**
 *
 * The property being defended is that adding Steam later is a row, not a
 * migration — and the way that fails is not a compile error. It fails by
 * somebody reasonably deciding that two accounts holding the same person's
 * identities should be merged, and writing a merge.
 *
 * **A merge is unimplementable here.** It would have to reconcile two shard
 * ledgers, two rating histories and two guild memberships, and every one of
 * those is append-only by constitutional rule. There is no correct answer to
 * "what is the merged rating?", and whichever you pick, somebody's history is
 * now a fiction. `409` and a support path is the honest answer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { identities } from '../../src/db/schema/identities.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}-${Math.floor(Math.random() * 1e9)}`;
const created: string[] = [];
const restores: (() => void)[] = [];

/** A provider whose subject depends on the token, so tests can be two people. */
const tokenIsSubject = (name: 'google' | 'steam'): IdentityProvider => ({
  name,
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: name, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
});

beforeAll(() => {
  restores.push(overrideProvider('google', tokenIsSubject('google')));
  restores.push(overrideProvider('steam', tokenIsSubject('steam')));
});

afterAll(async () => {
  for (const r of restores) r();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

async function signIn(subject: string): Promise<{ session: string; accountId: string }> {
  const res = await post('/v1/auth/google', { idToken: `sub:${subject}` });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  if (!created.includes(body.account.id)) created.push(body.account.id);
  return { session: body.session.token, accountId: body.account.id };
}

describe('linking a second provider', () => {
  it('yields ONE account, not two', async () => {
    const { session, accountId } = await signIn(`link-a-${RUN}`);

    const res = await post('/v1/auth/link', { provider: 'steam', token: `sub:steam-${RUN}` }, session);
    expect(res.status).toBe(204);

    const rows = await db().select().from(identities).where(eq(identities.accountId, accountId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.provider).sort()).toEqual(['google', 'steam']);
  });

  it('is 409 when that subject already belongs to another account — and does NOT merge', async () => {
    const one = await signIn(`link-b1-${RUN}`);
    const two = await signIn(`link-b2-${RUN}`);
    expect(one.accountId).not.toBe(two.accountId);

    // Account one tries to claim account two's Google identity.
    const res = await post('/v1/auth/link', { provider: 'google', token: `sub:link-b2-${RUN}` }, one.session);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('subject-taken');

    // **Both accounts still exist, unchanged.** That is the assertion that
    // catches a merge — a 409 with a quiet merge behind it would pass a status
    // check and fail this.
    for (const id of [one.accountId, two.accountId]) {
      const [row] = await db().select().from(accounts).where(eq(accounts.id, id));
      expect(row, `account ${id} was removed`).toBeDefined();
    }
    const twoIdentities = await db()
      .select()
      .from(identities)
      .where(eq(identities.accountId, two.accountId));
    expect(twoIdentities).toHaveLength(1);
  });

  it('is 409 when this account already has that provider', async () => {
    const { session } = await signIn(`link-c-${RUN}`);
    const res = await post('/v1/auth/link', { provider: 'google', token: `sub:someone-else-${RUN}` }, session);

    expect(res.status).toBe(409);
  });

  it('needs a session — the account is never taken from the body', async () => {
    // A link endpoint that read an account id from the request would be the
    // most direct account takeover in the API: attach my identity to your
    // account, sign in as you.
    expect((await post('/v1/auth/link', { provider: 'steam', token: 'sub:x' })).status).toBe(401);
  });

  it('is 401 for an unverifiable token, before any row is touched', async () => {
    const { session, accountId } = await signIn(`link-d-${RUN}`);
    const res = await post('/v1/auth/link', { provider: 'steam', token: 'garbage' }, session);

    expect(res.status).toBe(401);
    const rows = await db().select().from(identities).where(eq(identities.accountId, accountId));
    expect(rows).toHaveLength(1);
  });
});

describe('unlinking', () => {
  it('refuses to remove the only way in', async () => {
    const { session, accountId } = await signIn(`unlink-a-${RUN}`);

    const res = await app.request('/v1/auth/link/google', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session}` },
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('last-provider');

    // The account would otherwise be unreachable forever — its runes, shards
    // and guild seat intact and with nobody able to sign in. There are no
    // passwords and no email-ownership proof to recover with.
    const rows = await db().select().from(identities).where(eq(identities.accountId, accountId));
    expect(rows).toHaveLength(1);
  });

  it('removes one when a second exists', async () => {
    const { session, accountId } = await signIn(`unlink-b-${RUN}`);
    await post('/v1/auth/link', { provider: 'steam', token: `sub:steam-unlink-${RUN}` }, session);

    const res = await app.request('/v1/auth/link/steam', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(res.status).toBe(204);

    const rows = await db().select().from(identities).where(eq(identities.accountId, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('google');
  });
});

// ---------------------------------------------------------------------------
// T027 / T032 / SC-003 — the seam, asserted structurally
// ---------------------------------------------------------------------------

const SRC = join(import.meta.dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('the provider-agnostic seam', () => {
  /**
   * Comments may discuss providers; code may not. **Applied to every file
   * scanned, including any added by hand below** — forgetting it on one entry
   * is how this suite first reported a failure that was purely a comment.
   */
  const codeOf = (path: string) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');

  /**
   * Everything outside `src/auth`, **except the identities table itself**.
   *
   * `db/schema/identities.ts` names both providers and must: it *is* the column
   * that stores them. Excluding it is not weakening the check, it is stating the
   * check correctly — SC-003 is about **logic** branching on a provider, and a
   * table definition branches on nothing. The `accounts` table is asserted
   * separately to mention neither, and that is where a `steam_id` column would
   * actually appear.
   */
  const outsideAuth = sourceFiles(SRC)
    .filter((p) => !p.includes(join('src', 'auth')))
    .filter((p) => !p.endsWith(join('schema', 'identities.ts')))
    .map((path) => ({
      path: path.slice(SRC.length + 1).replace(/\\/g, '/'),
      code: codeOf(path),
    }));

  it('scans files outside src/auth — an empty scan would pass vacuously', () => {
    expect(outsideAuth.length).toBeGreaterThan(0);
  });

  it('has no code outside src/auth that reads a provider (SC-003)', () => {
    // The measurable form of "adding Steam changes nothing outside this
    // feature". If a route, a repository or a service ever branches on
    // `provider`, adding a third one becomes a search-and-edit across the
    // codebase rather than one new row.
    for (const { path, code } of outsideAuth) {
      expect(/\bprovider\b/i.test(code), `${path} reads a provider outside src/auth`).toBe(false);
      expect(/\bsteam\b/i.test(code), `${path} names Steam outside src/auth`).toBe(false);
      expect(/\bgoogle\b/i.test(code), `${path} names Google outside src/auth`).toBe(false);
    }
  });

  it('has no steam_id column on accounts — Steam is a ROW', () => {
    // The schema half of the same claim. A `steam_id` column would make a third
    // provider a migration, and "which providers is this account linked to?" a
    // different query per provider.
    const schema = readFileSync(join(SRC, 'db/schema/accounts.ts'), 'utf8');
    expect(schema).not.toMatch(/steam/i);
    expect(schema).not.toMatch(/google/i);
    expect(schema).not.toMatch(/provider/i);
  });

  it('keeps Steam unwired — 501, and no verification code that could run', () => {
    const steam = readFileSync(join(SRC, 'auth/steam.ts'), 'utf8');

    // The seam is built. It must not be *finished* — 1.0 ships without it, and
    // a half-tested second sign-in path at launch buys nothing because there is
    // no Steam build to reach it from.
    expect(steam).toContain('501');
    expect(steam).not.toMatch(/await\s+fetch\(/);
    expect(steam).not.toMatch(/STEAM_WEB_API_KEY|publisherKey/);
  });

  it('never lets a Steam credential exist in this codebase', () => {
    // FR-016 / SC-007: the publisher key is a server secret and the browser
    // bundle must not be able to reach `steamworks.js` at all.
    const withSteam = [
      ...outsideAuth,
      { path: 'auth/steam.ts', code: codeOf(join(SRC, 'auth/steam.ts')) },
    ];
    for (const { path, code } of withSteam) {
      expect(/steamworks/i.test(code), `${path} imports steamworks.js`).toBe(false);
    }
  });
});
