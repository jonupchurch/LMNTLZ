/**
 * **The boost pass pays** (011 T045–T049).
 *
 * ### TL;DR
 *
 * The thing the store sells doubles your income for the first ten attack wins
 * and first ten defense holds each day. Until this file existed it doubled
 * nothing at all — the purchase worked, the receipt arrived, and the shards
 * were the ordinary amount.
 *
 * ### The defect this closes, and why nothing caught it
 *
 * `awardShards()` computed `base × zone × dailyTier × starter`. There was no
 * boost term, and **`entitlementFor()` had no caller outside `payments/`**. So
 * a bought pass granted a row, sent a receipt, and paid exactly normal income.
 *
 * That is the seam-with-no-caller defect again, in its worst shape. The other
 * instances in this project were loud — an unreachable screen, a route nothing
 * called. This one **takes money and appears to work**: every payments test
 * passed, every income test passed, and the only symptom was a number nobody
 * had a reference for.
 *
 * ### T045 says to assert the positive case first, and it is right
 *
 * A test that only checks *"a non-holder is unchanged"* passes against the
 * broken code. It would have been written, reviewed, merged and been worth
 * nothing. So the first `describe` below is a holder being paid double, and
 * every negative case sits underneath it.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { entitlementGrants } from '../../src/db/schema/entitlements.js';
import {
  BOOST_MULTIPLIER,
  BOOSTED_EVENTS_PER_DAY,
  DEFENSE_HOLD,
  HIDDEN_MULTIPLIER,
  BALANCE_CAP,
} from '../../src/progression/config.js';
import { applyNotification } from '../../src/payments/webhook.js';
import { awardShards, payoutFor } from '../../src/progression/income.js';
import { append, balance } from '../../src/progression/ledger.js';
import { dropAccount, makeAccount } from './helpers.js';
import { notification } from '../payments/fixtures.js';

/**
 * **The real clock, and it has to be** — `shard_ledger.created_at` is
 * `defaultNow()`, so the database stamps every row with *its* time while this
 * file would be reading with a fixed one.
 *
 * The first version pinned `NOW` to `2026-08-01T12:00Z`. `victoriesToday`
 * counts rows since `dayStart(NOW)`, the rows landed on the real day, and the
 * count came back **0 forever** — so every victory was paid as the day's first
 * and the tier never moved off 1.5×. It failed on victory 6 expecting 40 and
 * getting 60, which is 20 × 1.5 × 2: the boost was working and the *tier* was
 * reading a different clock.
 *
 * A `defaultNow()` column is a second clock, and a test that supplies its own
 * is comparing two of them.
 */
const NOW = new Date();

let holder: string;
let plain: string;

beforeAll(async () => {
  holder = await makeAccount('boostHolder');
  plain = await makeAccount('boostPlain');
}, 60_000);

afterEach(async () => {
  for (const id of [holder, plain]) {
    await db().delete(shardLedger).where(eq(shardLedger.accountId, id));
    await db().delete(entitlementGrants).where(eq(entitlementGrants.accountId, id));
  }
});

afterAll(async () => {
  await dropAccount(holder);
  await dropAccount(plain);
  await closeDb();
});

/**
 * A live pass, **granted through the real write path**.
 *
 * The first version of this file hand-inserted an `entitlementGrants` row and
 * every case failed on `provider_event_id violates not-null`. That was the
 * database catching a fixture that did not match production — and
 * `payments/grantPath.test.ts` already asserts the same rule from the other
 * side: **exactly one file in `src` may insert a grant**, because a second
 * inserter is a second place to get idempotency wrong.
 *
 * So this calls `applyNotification`, which is what the webhook calls, and the
 * second attempt failed too: `provider_event_id` is a **foreign key into
 * `payment_events`**, so a grant cannot exist without the event that bought it.
 * `grantFromNotification` alone does not claim the event; `applyNotification`
 * does, and that ordering is the idempotency design rather than a detail.
 *
 * Two rejections from the schema before the fixture matched production, which
 * is the schema doing its job — and the reason to reach for the real path
 * rather than a shortcut that would have tested a database nobody has.
 *
 * The pass starts a day before `NOW` and runs its SKU's days from there.
 */
const grantPass = async (accountId: string, sku = 'pass-28d'): Promise<void> => {
  await applyNotification(
    notification({
      accountId,
      sku,
      occurredAt: new Date(NOW.getTime() - 86_400_000),
    }),
  );
};

/** A pass that has already run out by `NOW`. */
const grantExpired = async (accountId: string): Promise<void> => {
  await applyNotification(
    notification({
      accountId,
      sku: 'pass-3d',
      occurredAt: new Date(NOW.getTime() - 40 * 86_400_000),
    }),
  );
};

const win = (accountId: string, zone: 'visible' | 'hidden' = 'visible') =>
  awardShards(accountId, { kind: 'attack-victory', zone }, null, NOW);

const hold = (accountId: string, zone: 'visible' | 'hidden' = 'visible') =>
  awardShards(accountId, { kind: 'defense-hold', zone }, null, NOW);

// ---------------------------------------------------------------------------
// The positive case, first (T045)
// ---------------------------------------------------------------------------

describe('a holder is paid double', () => {
  it('doubles the first attack victory of the day', async () => {
    await grantPass(holder);
    const award = await win(holder);

    /**
     * The whole point. Before Phase 8 this credited `ATTACK_VICTORY × 1.5`
     * (the day's first-five tier) and the pass contributed nothing.
     */
    const unboosted = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false);
    expect(award.credited).toBe(unboosted * BOOST_MULTIPLIER);
  });

  it('doubles a defense hold too', async () => {
    await grantPass(holder);
    const award = await hold(holder);

    expect(award.credited).toBe(DEFENSE_HOLD * BOOST_MULTIPLIER);
  });

  it('reaches the balance, not only the return value', async () => {
    await grantPass(holder);
    await win(holder);

    /* A function that returned the right number and appended the wrong one
       would satisfy every assertion above. */
    const unboosted = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false);
    expect(await balance(holder)).toBe(unboosted * BOOST_MULTIPLIER);
  });
});

// ---------------------------------------------------------------------------
// The documented composition (T046)
// ---------------------------------------------------------------------------

describe('the composition emerges rather than being special-cased', () => {
  /**
   * `06-progression.md`: *chosen ×1 · chosen boosted ×2 · ambush ×2 · ambush
   * boosted ×4*. The ×4 is written nowhere in `income.ts` — it falls out of
   * `zone × boost`, and this asserts that it does.
   */
  it('chosen 1x, chosen boosted 2x, ambush 2x, ambush boosted 4x', () => {
    const chosen = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false);
    const chosenBoosted = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, true);
    const ambush = payoutFor({ kind: 'attack-victory', zone: 'hidden' }, 1, 1, false);
    const ambushBoosted = payoutFor({ kind: 'attack-victory', zone: 'hidden' }, 1, 1, true);

    expect(chosenBoosted).toBe(chosen * 2);
    expect(ambush).toBe(chosen * 2);
    expect(ambushBoosted, 'the 4x must emerge from zone x boost').toBe(chosen * 4);
  });

  it('and the factors are the constants, not coincidences', () => {
    expect(BOOST_MULTIPLIER).toBe(2);
    expect(HIDDEN_MULTIPLIER).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The cap is ten, and it is per kind (T048)
// ---------------------------------------------------------------------------

describe('the cap is ten a day, per kind', () => {
  it('is 10 — not 5, and not 20', () => {
    /**
     * **Deliberately misaligned with the 5-victory bonus tier**, and a reader
     * who "fixes" that alignment fails right here. Aligning them would make the
     * pass exactly "extend the return bonus", collapsing its value for anybody
     * who plays past five wins and making the two mechanisms impossible to tune
     * apart.
     */
    expect(BOOSTED_EVENTS_PER_DAY).toBe(10);
  });

  it('boosts victories 1..10 and stops at 11', async () => {
    await grantPass(holder);

    const credits: number[] = [];
    for (let i = 0; i < BOOSTED_EVENTS_PER_DAY + 1; i += 1) {
      credits.push((await win(holder)).credited);
    }

    for (let n = 1; n <= BOOSTED_EVENTS_PER_DAY; n += 1) {
      const expected = payoutFor({ kind: 'attack-victory', zone: 'visible' }, n, 1, true);
      expect(credits[n - 1], `victory ${n}`).toBe(expected);
    }

    const eleventh = payoutFor(
      { kind: 'attack-victory', zone: 'visible' },
      BOOSTED_EVENTS_PER_DAY + 1,
      1,
      false,
    );
    expect(credits[BOOSTED_EVENTS_PER_DAY], 'victory 11 is still boosted').toBe(eleventh);
  });

  it('ten attack wins do not consume the defense allowance', async () => {
    await grantPass(holder);

    for (let i = 0; i < BOOSTED_EVENTS_PER_DAY; i += 1) await win(holder);

    /**
     * The storefront table states the two caps separately — *first 10
     * victories* and *first 10 holds*. One shared counter would silently halve
     * what the pass grants to anyone who both attacks and defends, which is
     * everyone.
     */
    const award = await hold(holder);
    expect(award.credited).toBe(DEFENSE_HOLD * BOOST_MULTIPLIER);
  });
});

// ---------------------------------------------------------------------------
// The cap and the starter multiplier (T047)
// ---------------------------------------------------------------------------

describe('it composes with the balance cap exactly as the unboosted path does', () => {
  it('truncates to the headroom rather than refusing the payout', async () => {
    await grantPass(holder);

    /* Leave less room than one boosted ambush pays. */
    const boostedAmbush = payoutFor({ kind: 'attack-victory', zone: 'hidden' }, 1, 1, true);
    const room = Math.floor(boostedAmbush / 2);
    await append(holder, BALANCE_CAP - room, 'grant');

    const award = await win(holder, 'hidden');

    /**
     * **Credits the headroom, not zero and not the full amount.** Refusing the
     * whole payout would make the last victory before the cap worth less than
     * the one before it, which reads as a bug from inside the game — and a
     * boosted player would hit it sooner, so the boost must not change the rule.
     */
    expect(award.earned).toBe(boostedAmbush);
    expect(award.credited).toBe(room);
    expect(await balance(holder)).toBe(BALANCE_CAP);
  });

  it('multiplies the starter bonus rather than replacing it', () => {
    const starter = 1.5;
    const withStarter = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, starter, false);
    const both = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, starter, true);

    /* Both are multipliers on the same base; a player who bought a pass during
       their starter window gets what both say they give. */
    expect(both).toBe(withStarter * BOOST_MULTIPLIER);
  });
});

// ---------------------------------------------------------------------------
// The negatives, which prove nothing on their own
// ---------------------------------------------------------------------------

describe('a non-holder is unchanged', () => {
  it('pays the ordinary rate', async () => {
    const award = await win(plain);
    const unboosted = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false);

    expect(award.credited).toBe(unboosted);
  });

  it('an expired pass does not pay', async () => {
    /* A 3-day pass bought 40 days ago. */
    await grantExpired(plain);

    const award = await win(plain);
    expect(award.credited).toBe(
      payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false),
    );
  });

  it('a revoked pass does not pay', async () => {
    await grantPass(plain);
    /**
     * Revoked through the column rather than through a second notification,
     * because what is under test here is the *income* path's reaction to a
     * revoked grant. The refund flow itself is `payments/`' own suite.
     */
    await db()
      .update(entitlementGrants)
      .set({ revokedAt: NOW })
      .where(eq(entitlementGrants.accountId, plain));

    /* A refund removes the grant's days wherever they sat — the boost has to
       go with them, or a refunded pass keeps paying. */
    const award = await win(plain);
    expect(award.credited).toBe(
      payoutFor({ kind: 'attack-victory', zone: 'visible' }, 1, 1, false),
    );
  });

  it('a loss pays nothing, pass or no pass', async () => {
    await grantPass(plain);
    const award = await awardShards(plain, { kind: 'loss', zone: 'visible' }, null, NOW);

    /* Nothing multiplies zero into something. */
    expect(award.credited).toBe(0);
    expect(await balance(plain)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The caller assertion (T049)
// ---------------------------------------------------------------------------

describe('the seam has a caller', () => {
  it('the income path reads the entitlement', async () => {
    /**
     * **This is the check that was missing**, and it is a behavioural one
     * rather than a grep: two accounts, identical events, different results —
     * which can only happen if `awardShards` consulted the entitlement.
     *
     * A source scan for `entitlementFor` outside `payments/` would also work
     * and would keep passing against a call whose result was discarded.
     */
    await grantPass(holder);

    const boosted = await win(holder);
    const ordinary = await win(plain);

    expect(
      boosted.credited,
      'the income path is not reading the entitlement — a bought pass pays nothing',
    ).toBeGreaterThan(ordinary.credited);
    expect(boosted.credited).toBe(ordinary.credited * BOOST_MULTIPLIER);
  });
});
