/**
 * Melting a hero's runes down (2026-08-01).
 *
 * ### This reverses the rule the rest of the economy was built on
 *
 * `rebuild.test.ts` opens by calling destruction-without-refund *"the load-bearing
 * rule of the whole economy"*, and it was. A refund exists now, so the tests that
 * matter are the ones bounding it — the ways a refund could become a way to
 * **print shards**, inflate a league placement, or take runes without paying for
 * them.
 *
 * ### Nothing below writes a number the server also writes
 *
 * Amounts are derived from `STAGE_COSTS` and `REFUND_RATE` at test time. A test
 * asserting `520` would agree with a server that had hard-coded 520 and would go
 * on agreeing after the rate moved — which is the whole failure mode a served
 * config exists to prevent.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { runes, FULL_RUNE_COST, MAX_STAGE } from '../../src/db/schema/runes.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import {
  placeStage,
  quoteRefund,
  rebuildRune,
  refundHero,
  spentThroughStage,
} from '../../src/progression/runes.js';
import { append, balance, lifetimeEarned } from '../../src/progression/ledger.js';
import { BALANCE_CAP, REFUND_RATE } from '../../src/progression/config.js';
import { installRuneSource } from '../../src/progression/install.js';
import { dropAccount, makeAccount } from './helpers.js';

const HERO = 'h01';
const OTHER = 'h02';
let accountId: string;

beforeAll(async () => {
  installRuneSource();
  accountId = await makeAccount('refund');
});

afterEach(async () => {
  await db().delete(runes).where(eq(runes.accountId, accountId));
  await db().delete(shardLedger).where(eq(shardLedger.accountId, accountId));
  await db().delete(playerRatings).where(eq(playerRatings.accountId, accountId));
});

afterAll(async () => {
  await dropAccount(accountId);
  await closeDb();
});

const fund = (amount: number): Promise<void> => append(accountId, amount, 'grant');

/** A completed stage-4 rune in one slot. */
async function completeRune(hero = HERO, slot: 'primary' | 'secondary' | 'common' = 'common') {
  await fund(FULL_RUNE_COST);
  await placeStage(accountId, hero, slot, { luck: 20 });
  await placeStage(accountId, hero, slot, { luck: 10 });
  await placeStage(accountId, hero, slot, { luck: 5 });
  await placeStage(accountId, hero, slot, {});
}

const runeRows = (hero: string) =>
  db()
    .select()
    .from(runes)
    .where(and(eq(runes.accountId, accountId), eq(runes.heroId, hero)));

describe('the quote, before anything is destroyed', () => {
  it('values a rune at what its CURRENT stage cost', async () => {
    await completeRune();

    const quote = await quoteRefund(accountId, HERO);

    expect(quote.invested).toBe(spentThroughStage(MAX_STAGE));
    expect(quote.refund).toBe(Math.floor(spentThroughStage(MAX_STAGE) * REFUND_RATE));
    expect(quote.rate).toBe(REFUND_RATE);
  });

  it('lists every placed slot and no empty ones', async () => {
    await completeRune(HERO, 'common');
    await fund(FULL_RUNE_COST);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const quote = await quoteRefund(accountId, HERO);

    expect(quote.slots.map((s) => s.slot).sort()).toEqual(['common', 'primary']);
    expect(quote.invested).toBe(spentThroughStage(MAX_STAGE) + spentThroughStage(1));
  });

  it('quotes nothing for a champion with no runes', async () => {
    const quote = await quoteRefund(accountId, HERO);
    expect(quote.slots).toHaveLength(0);
    expect(quote.invested).toBe(0);
    expect(quote.refund).toBe(0);
  });
});

describe('the confirmation, which is the only thing between a player and three destroyed runes', () => {
  it('refuses without it', async () => {
    await completeRune();

    await expect(refundHero(accountId, HERO, false)).rejects.toMatchObject({
      code: 'needs-confirmation',
    });
  });

  it('and the refusal changes nothing at all', async () => {
    await completeRune();
    const before = await balance(accountId);

    await expect(refundHero(accountId, HERO, false)).rejects.toThrow();

    expect(await balance(accountId), 'the refusal paid out').toBe(before);
    expect(await runeRows(HERO), 'the refusal destroyed runes').toHaveLength(1);
  });

  it('names the count and both numbers, so the dialog need not compute them', async () => {
    await completeRune();

    await expect(refundHero(accountId, HERO, false)).rejects.toThrow(
      new RegExp(`${Math.floor(spentThroughStage(MAX_STAGE) * REFUND_RATE)}`),
    );
  });

  it('refuses a champion that has nothing to refund', async () => {
    await expect(refundHero(accountId, HERO, true)).rejects.toMatchObject({
      code: 'slot-mismatch',
    });
  });
});

describe('the refund itself', () => {
  it('pays the rate and destroys every rune on the champion', async () => {
    await completeRune(HERO, 'common');
    await fund(FULL_RUNE_COST);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const invested = spentThroughStage(MAX_STAGE) + spentThroughStage(1);
    const before = await balance(accountId);

    const result = await refundHero(accountId, HERO, true);

    expect(result.destroyed).toBe(2);
    expect(result.refund).toBe(Math.floor(invested * REFUND_RATE));
    expect(result.balance).toBe(before + result.refund);
    expect(await balance(accountId)).toBe(before + result.refund);
    expect(await runeRows(HERO)).toHaveLength(0);
  });

  it('leaves other champions alone', async () => {
    await completeRune(HERO, 'common');
    await completeRune(OTHER, 'common');

    await refundHero(accountId, HERO, true);

    expect(await runeRows(HERO)).toHaveLength(0);
    expect(await runeRows(OTHER), 'a refund reached another champion').toHaveLength(1);
  });

  /**
   * **The one that stops it printing shards.** A slot rebuilt three times cost
   * three full runes and holds one; paying back a fraction of *lifetime* spend
   * would return shards for value already destroyed, and rebuild-then-refund
   * would become an income source.
   */
  it('pays for what is placed, never for what was already destroyed', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);
    await rebuildRune(accountId, HERO, 'common', { luck: 20, might: 15 }, true);

    /* Two full runes have been bought; one rune is standing. */
    const quote = await quoteRefund(accountId, HERO);
    expect(quote.invested).toBe(spentThroughStage(MAX_STAGE));

    const before = await balance(accountId);
    const result = await refundHero(accountId, HERO, true);

    expect(result.refund).toBe(Math.floor(spentThroughStage(MAX_STAGE) * REFUND_RATE));
    expect(await balance(accountId)).toBe(before + result.refund);
  });

  /**
   * Place → refund → place → refund must run **down**, or the loop is free money
   * and the 20% is not a sink at all.
   */
  it('loses the player shards on every cycle', async () => {
    await fund(FULL_RUNE_COST * 4);
    const opening = await balance(accountId);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await placeStage(accountId, HERO, 'common', { luck: 20 });
      await refundHero(accountId, HERO, true);
    }

    const closing = await balance(accountId);
    expect(closing, 'the refund loop did not lose shards').toBeLessThan(opening);
  });
});

describe('what the credit must not do', () => {
  /**
   * It is the player's own spend returning. Capping it would confiscate shards
   * already paid, from exactly the heavily-invested players who are the only ones
   * with runes worth melting — `cap.ts` makes the same argument for grants.
   */
  it('bypasses the balance cap', async () => {
    await completeRune();
    await fund(BALANCE_CAP);

    const before = await balance(accountId);
    expect(before).toBeGreaterThanOrEqual(BALANCE_CAP);

    const result = await refundHero(accountId, HERO, true);

    expect(await balance(accountId), 'the refund was swallowed by the cap').toBe(
      before + result.refund,
    );
    expect(result.refund).toBeGreaterThan(0);
  });

  /**
   * `lifetimeEarned` is what graduates a player out of the starter league. A
   * refund that counted would let somebody place and melt in a loop until they
   * graduated without ever winning a battle.
   */
  it('never counts as lifetime earned', async () => {
    await completeRune();
    const before = await lifetimeEarned(accountId);

    await refundHero(accountId, HERO, true);

    expect(await lifetimeEarned(accountId), 'a refund graduated the player').toBe(before);
  });

  /** Gear score reads placed runes, so melting them must lower it. */
  it('drops the gear score it was propping up', async () => {
    await completeRune();
    const armed = await refundHero(accountId, HERO, true);

    await completeRune();
    const quote = await quoteRefund(accountId, HERO);
    expect(quote.slots).toHaveLength(1);

    const melted = await refundHero(accountId, HERO, true);
    expect(melted.gearScore).toBe(armed.gearScore);
    expect(melted.gearScore).toBe(0);
  });
});
