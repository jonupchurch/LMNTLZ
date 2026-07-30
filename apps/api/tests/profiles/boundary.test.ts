/**
 * What a profile must never contain (012 T006, T007).
 *
 * ### TL;DR
 *
 * A profile is the surface one player uses to size up another. This file asserts
 * the things it must *not* say — the opponent's email, what they have bought,
 * what they have in the bank, who is in either of their squads, and above all
 * anything at all about their Hidden battles.
 *
 * ### Absences are asserted against the whole serialised response
 *
 * Checking `expect(body.email).toBeUndefined()` tests one spelling of one field.
 * A leak arrives as a *nested* object somebody added — a `standing` blob, an
 * `account` sub-object — and every field-by-field assertion passes straight over
 * it. So the response is stringified and searched for the **values**, which no
 * amount of restructuring can hide.
 *
 * ### And the response is asserted to have succeeded first
 *
 * A `500` body contains no email either. That is the trap feature 007's
 * seed-leak sweep fell into: the protection failed *closed*, the endpoint
 * crashed, and every absence check passed trivially. **A test that asserts an
 * absence must first assert the operation succeeded.**
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { identities } from '../../src/db/schema/identities.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { DAY_MS, Ledger, dropAccounts, makeAccount, record } from './helpers.js';
import { signIn, type Signed } from './session.js';

const ledger = new Ledger();
const accountIds: string[] = [];

let viewer: Signed;
/** The player being looked at. Deliberately rich in things that must not leak. */
let target: { id: string; username: string };

const TARGET_EMAIL = 'leaky-target@example.invalid';
const TARGET_SUBJECT = 'sub-leak-canary-0f2a91';
const SHARD_BALANCE = 4321;

beforeAll(async () => {
  viewer = await signIn('boundary-viewer');
  accountIds.push(viewer.accountId);

  target = await makeAccount('boundary-target');
  accountIds.push(target.id);

  // An identity with an email on it — the single most damaging field to leak.
  await db().insert(identities).values({
    accountId: target.id,
    provider: 'google',
    providerSubject: TARGET_SUBJECT,
    email: TARGET_EMAIL,
  });

  await db()
    .insert(playerRatings)
    .values({ accountId: target.id, rating: 1412, gearScore: 4180, ratedBattles: 60 });

  // A shard balance, so "the profile does not show it" is testable at all.
  await db()
    .insert(shardLedger)
    .values({ accountId: target.id, delta: SHARD_BALANCE, reason: 'grant' });

  const now = Date.now();

  // Ten Visible and ten Hidden, interleaved. The Hidden ones are the canary.
  for (let i = 0; i < 20; i += 1) {
    await record(ledger, {
      attackerId: target.id,
      defenderId: viewer.accountId,
      zone: i % 2 === 0 ? 'visible' : 'hidden',
      concludedAt: new Date(now - i * DAY_MS),
    });
  }
});

afterAll(async () => {
  await ledger.drop();
  await dropAccounts(accountIds);
  await closeDb();
});

async function fetchProfile(): Promise<{ status: number; text: string; body: unknown }> {
  const res = await app.request(`/v1/players/${target.id}/profile`, {
    headers: { authorization: `Bearer ${viewer.token}` },
  });
  const text = await res.text();

  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

describe('the disclosure boundary (T006)', () => {
  it('answers 200 — every absence below is worthless without this', async () => {
    const { status, text } = await fetchProfile();

    expect(status, `Profile request failed: ${text}`).toBe(200);
  });

  it('shows the fields the profile is for', async () => {
    const { body } = await fetchProfile();
    const profile = body as Record<string, unknown>;

    expect(profile['username']).toBe(target.username);
    expect(profile['league']).toBe('gold');
    expect(profile['rating']).toBe(1412);
    expect(profile['gearScore']).toBe(4180);
    expect(profile['holdStreaks']).toEqual({ visible: 0, hidden: 0 });
    expect(Array.isArray(profile['recentBattles'])).toBe(true);
  });

  it('contains no email and no provider identity, anywhere in the response', async () => {
    const { status, text } = await fetchProfile();
    expect(status).toBe(200);

    for (const secret of [TARGET_EMAIL, TARGET_SUBJECT, 'google']) {
      expect(text.toLowerCase(), `"${secret}" appears in the profile response`).not.toContain(
        secret.toLowerCase(),
      );
    }
  });

  it('contains no shard balance and no entitlement', async () => {
    const { status, text } = await fetchProfile();
    expect(status).toBe(200);

    expect(text).not.toContain(String(SHARD_BALANCE));
    expect(text.toLowerCase()).not.toMatch(/shard|entitle|balance|purchase/);
  });

  it('contains no squad composition from either zone', async () => {
    const { status, text } = await fetchProfile();
    expect(status).toBe(200);

    // The fixture's hero ids, both sides. `/scout` may show these; this may not.
    for (const heroId of ['h01', 'h14', 'h07', 'h22']) {
      expect(text, `hero ${heroId} appears in a profile response`).not.toContain(heroId);
    }
    expect(text.toLowerCase()).not.toMatch(/squad|seats|front|middle|back/);
  });

  it('contains no Hidden battle and no gap where one would be (SC-001, SC-002)', async () => {
    const { status, text, body } = await fetchProfile();
    expect(status).toBe(200);

    /**
     * **Not a naked search for the word "hidden".** It legitimately appears once
     * — in `holdStreaks.hidden`, which is the single number the Hidden zone is
     * *supposed* to contribute and which is public by design. A substring scan
     * would either fail on that or, softened to pass, stop being an assertion.
     *
     * So the claim is made where it can be made precisely: **no battle entry
     * carries a zone at all**, and none of the entries is one of the Hidden
     * battles the fixture wrote.
     */
    const entries = (body as { recentBattles: Record<string, unknown>[] }).recentBattles;
    for (const entry of entries) {
      expect(Object.keys(entry)).not.toContain('zone');
      expect(JSON.stringify(entry)).not.toContain('hidden');
    }

    /**
     * The fixture is 10 Visible and 10 Hidden interleaved. A **filtered**
     * implementation returns 10 entries and the count itself is the disclosure.
     * A **selected** one returns all 10 Visible — which here is also 10, so the
     * count alone cannot tell them apart. What can: the entries must span ~20
     * days, not ~10, because the Visible ones are every *other* battle.
     */
    const battles = (body as { recentBattles: { concludedOn: string }[] }).recentBattles;
    expect(battles).toHaveLength(10);

    const span = Math.round(
      (Date.parse(battles[0]!.concludedOn) -
        Date.parse(battles[battles.length - 1]!.concludedOn)) /
        DAY_MS,
    );
    expect(
      span,
      `The 10 Visible battles are every other day across 20 days, so they must ` +
        `span ~18. A span of ~9 means the query took the last 10 of any zone.`,
    ).toBeGreaterThanOrEqual(14);
  });

  it('exposes only day-grained times, so intervals leak nothing', async () => {
    const { text } = await fetchProfile();

    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });
});

describe('profile and scout never share a serialiser (T007)', () => {
  /**
   * **A structural check, because the runtime one cannot see the future.** The
   * assertions above prove today's profile carries no composition. They would go
   * on passing the moment somebody made `profile` call `scout`'s serialiser with
   * a flag — right up until the flag was inverted.
   */
  it('the profiles module imports nothing from the squads/scout module', async () => {
    const sources = await Promise.all(
      ['publicProfile.ts', 'routes.ts', 'visibleRecord.ts', 'export.ts'].map((f) =>
        readFile(new URL(`../../src/profiles/${f}`, import.meta.url), 'utf8'),
      ),
    );

    for (const [i, source] of sources.entries()) {
      // Strip comments: this file's own prose names `scout` repeatedly, and a
      // scan that matches its own explanation can never fail.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      expect(
        code.length,
        `Comment stripping ate all of file ${i} — the scan would pass vacuously.`,
      ).toBeGreaterThan(200);

      expect(
        code,
        `A profiles source imports from squads/. Two routes, two disclosure ` +
          `rules — a shared serialiser is precisely how the Hidden squad leaks.`,
      ).not.toMatch(/from\s+['"][^'"]*squads\//);
      expect(code).not.toMatch(/\bscout\w*\s*\(/);
    }
  });

  it('no per-field visibility control exists (FR-001, FR-002)', async () => {
    const source = await readFile(
      new URL('../../src/profiles/publicProfile.ts', import.meta.url),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code.length).toBeGreaterThan(200);
    expect(code).not.toMatch(/\bhideProfileField|visibilityOf|isFieldVisible|showField\b/);

    // The only two fields that may ever be hidden, named in one place.
    const { HIDEABLE_FIELDS } = await import('../../src/profiles/publicProfile.js');
    expect([...HIDEABLE_FIELDS]).toEqual(['timeZone', 'languages']);
  });
});

describe('a profile that does not exist', () => {
  it('answers 404 rather than an empty profile', async () => {
    const res = await app.request(`/v1/players/${crypto.randomUUID()}/profile`, {
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    expect(res.status).toBe(404);
  });

  it('requires a session', async () => {
    const res = await app.request(`/v1/players/${target.id}/profile`);

    expect(res.status).toBe(401);
  });
});
