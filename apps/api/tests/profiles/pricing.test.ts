/**
 * What identity costs (012 T024–T026, T029).
 *
 * ### TL;DR
 *
 * A rename costs 325 shards — unless it is your first, or a moderator forced it,
 * both of which are free. A curated avatar is free. And this file records an
 * arithmetic conflict the spec has not resolved: **FR-012's dual price and
 * FR-015's value rule cannot both hold** while the catalog sells no shards.
 *
 * ### The important assertion is that the ledger actually moves
 *
 * `renameAccount` has computed and *reported* a 325-shard charge since feature
 * 005 and never debited anything, and the route called it in a way that could not
 * even check affordability. The response said one thing and the balance said
 * another, which nothing failed on. So the test that matters here is not "the
 * cost is 325" — it is "the balance went down by 325".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { balance } from '../../src/progression/ledger.js';
import { bestShardsPerDollar } from '../../src/payments/catalog.js';
import {
  AVATAR_COST_CENTS,
  AVATAR_COST_SHARDS,
  CURATED_AVATARS,
  RENAME_COST_SHARDS,
  impliedShardsPerDollar,
  renameWithCharge,
} from '../../src/profiles/identity.js';
import { dropAccounts } from './helpers.js';
import { signIn, type Signed } from './session.js';

const accountIds: string[] = [];
let player: Signed;

const GRANT = 5_000;

beforeAll(async () => {
  player = await signIn('pricing');
  accountIds.push(player.accountId);

  await db()
    .insert(shardLedger)
    .values({ accountId: player.accountId, delta: GRANT, reason: 'grant' });
});

afterAll(async () => {
  await dropAccounts(accountIds);
  await closeDb();
});

const name = (tag: string): string => `Px${tag}${Math.floor(Math.random() * 1e6)}`;

describe('the rename charge (T026, FR-011)', () => {
  it('the first rename is free — a generated placeholder is not the player`s choice', async () => {
    const before = await balance(player.accountId);

    const result = await renameWithCharge(player.accountId, name('a'));

    expect(result.shardsCharged).toBe(0);
    expect(await balance(player.accountId)).toBe(before);
  });

  it('a voluntary rename costs 325 shards AND the balance moves', async () => {
    const before = await balance(player.accountId);

    const result = await renameWithCharge(player.accountId, name('b'));

    expect(result.shardsCharged).toBe(RENAME_COST_SHARDS);
    expect(RENAME_COST_SHARDS).toBe(325);

    const after = await balance(player.accountId);
    expect(
      after,
      `The route has reported shardsCharged: 325 since feature 005 while ` +
        `debiting nothing. Balance went ${before} → ${after}.`,
    ).toBe(before - 325);
  });

  it('a forced rename is free and writes no ledger row (SC-007)', async () => {
    const before = await balance(player.accountId);
    const rowsBefore = await db()
      .select({ id: shardLedger.id })
      .from(shardLedger)
      .where(eq(shardLedger.accountId, player.accountId));

    const result = await renameWithCharge(player.accountId, name('c'), { forced: true });

    expect(result.shardsCharged).toBe(0);
    expect(await balance(player.accountId)).toBe(before);

    const rowsAfter = await db()
      .select({ id: shardLedger.id })
      .from(shardLedger)
      .where(eq(shardLedger.accountId, player.accountId));

    expect(
      rowsAfter.length,
      'A zero-delta row would show up in the player`s own export as a charge ' +
        'they can see and cannot explain.',
    ).toBe(rowsBefore.length);
  });

  it('refuses with 402 when the player cannot afford it', async () => {
    const broke = await signIn('pricing-broke');
    accountIds.push(broke.accountId);

    // Burn the first free rename, then try a paid one with a zero balance.
    await renameWithCharge(broke.accountId, name('d'));

    const res = await app.request('/v1/me/username', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${broke.token}` },
      body: JSON.stringify({ username: name('e') }),
    });

    expect(res.status).toBe(402);
    expect(await balance(broke.accountId)).toBe(0);
  });

  it('the route charges — not just the function (the wire)', async () => {
    const rich = await signIn('pricing-route');
    accountIds.push(rich.accountId);
    await db()
      .insert(shardLedger)
      .values({ accountId: rich.accountId, delta: GRANT, reason: 'grant' });

    await renameWithCharge(rich.accountId, name('f')); // burn the free one
    const before = await balance(rich.accountId);

    const res = await app.request('/v1/me/username', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${rich.token}` },
      body: JSON.stringify({ username: name('g') }),
    });

    expect(res.status).toBe(200);
    expect(
      await balance(rich.accountId),
      'PUT /v1/me/username must call renameWithCharge. If this passes at ' +
        'before-325 only when the function is called directly, the route is ' +
        'still calling renameAccount and nothing is charged in production.',
    ).toBe(before - 325);
  });
});

describe('curated avatars are free and need no review (T027)', () => {
  it('sets one with no charge and no submission', async () => {
    const before = await balance(player.accountId);

    const res = await app.request('/v1/me/avatar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
      body: JSON.stringify({ avatarKey: 'fire' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ current: { kind: 'curated', value: 'fire' } });
    expect(await balance(player.accountId)).toBe(before);
  });

  it('refuses a key outside the curated set', async () => {
    const res = await app.request('/v1/me/avatar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
      body: JSON.stringify({ avatarKey: '../../etc/passwd' }),
    });

    expect(res.status).toBe(422);
  });

  it('serves the set and says custom uploads are unavailable', async () => {
    const res = await app.request('/v1/me/avatar', {
      headers: { authorization: `Bearer ${player.token}` },
    });

    const body = (await res.json()) as {
      curated: string[];
      customAvailable: boolean;
      customPrice: { shards: number; cents: number };
    };

    expect(body.curated).toEqual([...CURATED_AVATARS]);
    expect(body.customPrice).toEqual({ shards: AVATAR_COST_SHARDS, cents: AVATAR_COST_CENTS });
    expect(
      body.customAvailable,
      'Custom uploads need feature 016`s review queue. Offering an upload ' +
        'nobody can approve charges players for a permanently pending image.',
    ).toBe(false);
  });
});

describe('the harm-only rejection enum (T025, Constitution XVIII)', () => {
  it('has no low-quality member, so taste cannot be submitted as a reason', async () => {
    const { HARM_REASONS } = await import('../../src/db/schema/avatarSubmissions.js');

    expect([...HARM_REASONS]).not.toContain('low-quality');
    expect(HARM_REASONS.some((r) => /quality|ugly|taste|bad/i.test(r))).toBe(false);
    // And it is not empty, which would make the assertion above vacuous.
    expect(HARM_REASONS.length).toBeGreaterThan(2);
  });
});

describe('⚠️ SC-008 is currently unsatisfiable, and this test says so (T026)', () => {
  /**
   * **This asserts the conflict rather than pretending it is resolved.**
   *
   * FR-015: a dual-priced item must be **worse** shards-per-dollar than the best
   * boost pass. `bestShardsPerDollar()` is **0** by design — no product converts
   * money into shards.
   *
   * FR-012: a custom avatar costs **$5 or 1,350 shards**. That implies 270 shards
   * per dollar, because paying the money *saves* the shards and saved shards buy
   * runes. 270 > 0, so the item is *better* value than the best pass and FR-015
   * fails on the only dual-priced item in the game.
   *
   * The two requirements cannot both hold. Which one moves is a design decision,
   * so this test locks the arithmetic in place and fails the moment either side
   * changes — at which point somebody has to look.
   */
  it('records that the implied rate beats the best pass, which FR-015 forbids', () => {
    expect(bestShardsPerDollar()).toBe(0);
    expect(impliedShardsPerDollar()).toBe(270);

    expect(
      impliedShardsPerDollar() > bestShardsPerDollar(),
      'If this is now false, the conflict has been resolved — delete this test ' +
        'and assert FR-015 properly.',
    ).toBe(true);
  });
});
