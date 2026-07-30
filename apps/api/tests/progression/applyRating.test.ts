/**
 * `applyRating` against a real column (010 T030, T033).
 *
 * **This file exists because its absence shipped a bug.** `rating.test.ts` covers
 * the arithmetic exhaustively and every case is pure, so the whole ladder was
 * green while `applyRating` could not write a single row: `ratingDeltas` returns
 * one decimal on purpose, Drizzle bound that fraction as the column's `integer`
 * type, and Postgres rejected `-17.7` before the surrounding `round()` ran. The
 * battle suite caught it two features away, as a 500.
 *
 * > **A pure test and a persistence test are different claims.** Any function
 * > whose output crosses a type boundary needs the second one, and the arithmetic
 * > being right is exactly what makes the gap invisible.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { applyRating, ratingDeltas, ratingOf, standingFor } from '../../src/progression/rating.js';
import { STARTING_RATING } from '../../src/progression/config.js';
import { dropAccounts, makeAccount } from './helpers.js';

let attacker: string;
let defender: string;

beforeAll(async () => {
  attacker = await makeAccount('rate-a');
  defender = await makeAccount('rate-d');
});

afterEach(async () => {
  await db().delete(playerRatings).where(eq(playerRatings.accountId, attacker));
  await db().delete(playerRatings).where(eq(playerRatings.accountId, defender));
});

afterAll(async () => {
  await dropAccounts([attacker, defender]);
  await closeDb();
});

describe('a fractional delta survives the round trip', () => {
  it('writes a one-decimal delta without a type error', async () => {
    // -17.7 is the exact value that failed. Any fraction reproduces it.
    await applyRating(attacker, defender, { attacker: 17.7, defender: -17.7 });

    expect(await ratingOf(attacker)).toBe(STARTING_RATING + 18);
    expect(await ratingOf(defender)).toBe(STARTING_RATING - 18);
  });

  it('accumulates fractions across battles rather than rounding each to nothing', async () => {
    // Ten near-even battles at +0.6 each. Rounding per write would store +1 each
    // time (or 0), and the ladder would drift away from the arithmetic.
    for (let i = 0; i < 10; i += 1) {
      await applyRating(attacker, defender, { attacker: 0.6, defender: -0.6 });
    }

    const rating = await ratingOf(attacker);
    expect(rating, `ten +0.6 deltas landed at ${rating}`).toBeGreaterThan(STARTING_RATING + 3);
  });

  it('creates the row on first rating and counts the battle', async () => {
    await applyRating(attacker, defender, { attacker: 5, defender: -5 });

    const standing = await standingFor(attacker);
    expect(standing.rating).toBe(STARTING_RATING + 5);
    expect(standing.ratedBattles).toBe(1);
  });

  it('increments rated battles on every subsequent battle', async () => {
    await applyRating(attacker, defender, { attacker: 5, defender: -5 });
    await applyRating(attacker, defender, { attacker: 5, defender: -5 });
    await applyRating(attacker, defender, { attacker: 5, defender: -5 });

    expect((await standingFor(attacker)).ratedBattles).toBe(3);
  });
});

describe('an unrated account', () => {
  it('reads as the starting rating with zero rated battles', async () => {
    const standing = await standingFor(attacker);

    // Zero battles puts them in the provisional K band, which is exactly where a
    // player who has never been rated belongs.
    expect(standing.rating).toBe(STARTING_RATING);
    expect(standing.ratedBattles).toBe(0);
  });

  it('starts everybody at 1000', () => {
    expect(STARTING_RATING).toBe(1_000);
  });
});

describe('the deltas a real battle produces', () => {
  it('persists what ratingDeltas computed', async () => {
    const deltas = ratingDeltas({
      attacker: STARTING_RATING,
      defender: STARTING_RATING,
      attackerRatedBattles: 0,
      defenderRatedBattles: 0,
      attackerWon: true,
      zone: 'hidden',
    });

    await applyRating(attacker, defender, deltas);

    // Provisional K=40, even ratings, Hidden doubles the winner: +40 / -20.
    expect(deltas).toEqual({ attacker: 40, defender: -20 });
    expect(await ratingOf(attacker)).toBe(STARTING_RATING + 40);
    expect(await ratingOf(defender)).toBe(STARTING_RATING - 20);
  });
});
