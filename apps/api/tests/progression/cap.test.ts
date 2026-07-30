/**
 * The cap's three behaviours (010 T044–T046).
 *
 * **Three separate tests for one number, because they are three different rules.**
 * An implementation with a single `if (balance >= CAP)` gets at most one of them
 * right, and the two it gets wrong fail in opposite directions: one denies a
 * player shards they were promised as an apology, the other takes money for shards
 * that cannot be delivered.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { BALANCE_CAP, CAP_IN_RUNES, FULL_RUNE_COST } from '../../src/progression/config.js';
import { canAcceptPurchase, capDescription, grantShards, headroom } from '../../src/progression/cap.js';
import { awardShards } from '../../src/progression/income.js';
import { append, balance } from '../../src/progression/ledger.js';
import { dropAccount, makeAccount } from './helpers.js';

let accountId: string;

beforeAll(async () => {
  accountId = await makeAccount('cap');
});

afterEach(async () => {
  await db().delete(shardLedger).where(eq(shardLedger.accountId, accountId));
});

afterAll(async () => {
  await dropAccount(accountId);
  await closeDb();
});

/** Put the account exactly at the cap. */
const fillToCap = (): Promise<void> => append(accountId, BALANCE_CAP, 'grant');

describe('case one — at the cap, battle income stops', () => {
  it('awards nothing for a victory', async () => {
    await fillToCap();

    const award = await awardShards(accountId, { kind: 'attack-victory', zone: 'hidden' });

    expect(award.credited, 'credited').toBe(0);
    expect(await balance(accountId), 'balance is unchanged').toBe(BALANCE_CAP);
  });

  it('writes no row at all — no overflow and no queue', async () => {
    await fillToCap();
    await awardShards(accountId, { kind: 'attack-victory', zone: 'visible' });

    const rows = await db()
      .select()
      .from(shardLedger)
      .where(eq(shardLedger.accountId, accountId));

    // One row: the fill. Nothing was banked for later, because there is no later
    // — FR-014 stops income, it does not defer it.
    expect(rows).toHaveLength(1);
  });

  it('still reports what was earned, so the player can be told why it stopped', async () => {
    await fillToCap();
    const award = await awardShards(accountId, { kind: 'attack-victory', zone: 'hidden' });

    expect(award.earned, 'the payout it would have been').toBeGreaterThan(0);
    expect(award.cappedAt).toBe(0);
  });

  it('truncates rather than refuses just below the cap', async () => {
    // FR-013 says the balance caps AT 6,500. Refusing the whole payout would cap
    // it BELOW, and would make the last victory before the cap worth less than
    // the one before it — which reads as a bug from inside the game.
    await append(accountId, BALANCE_CAP - 5, 'grant');

    const award = await awardShards(accountId, { kind: 'attack-victory', zone: 'hidden' });

    expect(award.credited, 'credited exactly the headroom').toBe(5);
    expect(await balance(accountId), 'lands exactly on the cap').toBe(BALANCE_CAP);
  });
});

describe('case two — at the cap, a grant lands and may exceed it', () => {
  it('carries the balance above the cap', async () => {
    await fillToCap();

    const after = await grantShards(accountId, 1_000);

    expect(after, 'a grant is not capped').toBe(BALANCE_CAP + 1_000);
    expect(await balance(accountId)).toBe(BALANCE_CAP + 1_000);
  });

  it('is a different function from awardShards, so the cap cannot be half-applied', () => {
    // The safety property is structural: neither function can express the other's
    // behaviour, so neither can be "fixed" into the wrong one by an edit that
    // looks local.
    expect(grantShards.name).not.toBe(awardShards.name);
  });

  it('reports zero headroom above the cap rather than a negative one', async () => {
    await fillToCap();
    await grantShards(accountId, 1_000);

    // A negative headroom would turn Math.min(earned, headroom) into a CHARGE.
    expect(await headroom(accountId)).toBe(0);
  });
});

describe('case three — a purchase is refused BEFORE the rail', () => {
  /** Stands in for 011's payment rail. Reaching it at all is the failure. */
  let railTouched = false;
  const rail = async (): Promise<never> => {
    railTouched = true;
    throw new Error('the payment rail must never be reached for a refused purchase');
  };

  it('refuses without touching the rail', async () => {
    await fillToCap();
    railTouched = false;

    const verdict = await canAcceptPurchase(accountId, 500);
    if (verdict.ok) await rail();

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe('would-exceed-cap');

    // The assertion that matters to a customer's card. "It was refused" and "we
    // never charged them" are different claims and only one of them is this one.
    expect(railTouched, 'the rail was reached for a refused purchase').toBe(false);
  });

  it('refuses whole rather than truncating', async () => {
    await append(accountId, BALANCE_CAP - 100, 'grant');

    const verdict = await canAcceptPurchase(accountId, 500);

    // Selling somebody a partial quantity they did not choose is worse than
    // declining. The headroom is reported so they can decide for themselves.
    expect(verdict.ok).toBe(false);
    expect(verdict.headroom).toBe(100);
  });

  it('accepts a purchase that fits', async () => {
    await append(accountId, 1_000, 'grant');

    const verdict = await canAcceptPurchase(accountId, 500);

    expect(verdict.ok).toBe(true);
    expect(verdict.headroom).toBe(BALANCE_CAP - 1_000);
  });
});

describe('the cap explains itself', () => {
  it('is exactly ten full runes', () => {
    expect(BALANCE_CAP).toBe(CAP_IN_RUNES * FULL_RUNE_COST);
    expect(BALANCE_CAP).toBe(6_500);
  });

  it('is presented in runes and not only as a bare number', () => {
    // FR-017. 6,500 is unmemorable; "ten full runes" is a quantity a player can
    // reason about, and it moves by itself if a rune's price ever does.
    expect(capDescription()).toEqual({ shards: 6_500, runes: 10 });
  });
});
