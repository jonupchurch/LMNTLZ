/**
 * What identity costs (012 T024–T026, T029).
 *
 * ### TL;DR
 *
 * A rename costs 325 shards — unless it is your first, or a moderator forced it,
 * both of which are free. A curated avatar is free. And the custom avatar's dual
 * price is **worse value than the best boost pass**, which is what FR-015 asks
 * for — 270 shards per dollar against the pass's 883.
 *
 * > That last one was first reported here as an unsatisfiable conflict. It was
 * > not; the number it rested on was wrong. See the SC-008 block at the bottom.
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
import {
  BOOST_SHARDS_PER_DAY,
  CATALOG,
  bestShardsPerDollar,
  noShardSku,
} from '../../src/payments/catalog.js';
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

describe('SC-008: the dual price is worse value than the best pass (T026, FR-015)', () => {
  /**
   * ### This test used to assert a conflict, and the conflict was my arithmetic
   *
   * I reported SC-008 as **unsatisfiable**: FR-015 wants a dual-priced item to be
   * worse shards-per-dollar than the best pass, `bestShardsPerDollar()` returned
   * **0**, and against zero every dual price is better.
   *
   * **The `0` was wrong.** It answered *"does any SKU hand over shards?"* — which
   * is `noShardSku()` and is still absolutely true — rather than *"what is the
   * best money→shards rate?"*, which is what FR-015 asks. A boost pass **doubles
   * shard income**, `+388/day` by `06-progression.md`'s own published figure, and
   * that is a conversion whatever the mechanism.
   *
   * Computed, the best pass is **~883/$** against the avatar's **270/$**. FR-015
   * holds with a 3.3× margin and nothing in the spec needed to move.
   */
  it('the avatar is worse shards-per-dollar than the best boost pass', () => {
    const avatar = impliedShardsPerDollar();
    const bestPass = bestShardsPerDollar();

    expect(avatar).toBe(270);
    expect(Math.round(bestPass)).toBe(883);

    expect(
      avatar,
      `FR-015: a dual-priced item must be worse value than the best pass. ` +
        `Avatar implies ${avatar}/$, best pass gives ${Math.round(bestPass)}/$.`,
    ).toBeLessThan(bestPass);
  });

  it('holds against EVERY pass that a rational buyer would pick, not just the best', () => {
    /**
     * The letter of FR-015 only asks about the best pass. Worth knowing how
     * broadly it holds: the 3-day pass at 233/$ is **worse** than the avatar, so
     * a player buying the shortest pass would do better buying an avatar. That is
     * not a violation — FR-015 names the best — but it is the kind of fact that
     * turns into a surprise later, so it is asserted rather than discovered.
     */
    const rates = CATALOG.map((s) => ({
      id: s.id,
      rate: (BOOST_SHARDS_PER_DAY * s.days) / (s.price / 100),
    }));
    const beaten = rates.filter((r) => r.rate < impliedShardsPerDollar()).map((r) => r.id);

    expect(
      beaten,
      'Passes offering worse shards-per-dollar than the avatar. Expected only ' +
        'the shortest; more than that means the curve has moved.',
    ).toEqual(['pass-3d']);
  });

  it('the audit claim survives the split: no SKU hands over shards', () => {
    // `noShardSku()` is the absolute one and stays absolute. The rate above is a
    // different question, and conflating them is what made FR-015 unfalsifiable.
    expect(noShardSku()).toBe(true);
  });

  /**
   * **The realised rate depends on playing, and the crossover is worth recording.**
   *
   * A pass only doubles income on battles actually fought. At roughly **31% of
   * typical volume — about 6 attacks a day** — the pass and the avatar are level,
   * and below that the avatar genuinely is the better money→shards path.
   *
   * Not a violation of FR-015, which compares against a typical player. Recorded
   * because it is a tuning fact that would otherwise be rediscovered by someone
   * puzzled at a light player's numbers.
   */
  it('names the play-rate parity point rather than leaving it implicit', () => {
    const yearly = CATALOG.find((s) => s.id === 'pass-364d')!;
    const fullRate = (BOOST_SHARDS_PER_DAY * yearly.days) / (yearly.price / 100);
    const parity = impliedShardsPerDollar() / fullRate;

    expect(parity).toBeGreaterThan(0.25);
    expect(parity).toBeLessThan(0.35);
    // ~31% of a typical 20-attack day is ~6 attacks.
    expect(Math.round(parity * 20)).toBe(6);
  });
});
