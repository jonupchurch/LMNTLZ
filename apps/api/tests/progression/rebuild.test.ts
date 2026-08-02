/**
 * Destruction on replacement (010 T019–T021, T023, T025).
 *
 * **This is the load-bearing rule of the whole economy.** A rune is destroyed when
 * it is replaced, which is why a balance change writes off real spend — and that
 * is the origin of the balance-upward rule (Constitution XIV). Everything else in
 * `06-progression.md` about nerfs, compensation grants and the cap's asymmetry
 * follows from this one behaviour.
 *
 * **The warning path is tested before the happy path**, deliberately: FR-009's
 * confirm is the part a player experiences as fairness, and the charge is the easy
 * half.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { runes, FULL_RUNE_COST, MAX_STAGE } from '../../src/db/schema/runes.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { placeStage, rebuildRune } from '../../src/progression/runes.js';
import { append, balance } from '../../src/progression/ledger.js';
import { setRuneSource, noRuneSource } from '../../src/matchmaking/gearScore.js';
import { installRuneSource } from '../../src/progression/install.js';
import { dropAccount, makeAccount, otherUtilityFor, utilityFor } from './helpers.js';

const HERO = 'h01';
let accountId: string;

beforeAll(async () => {
  installRuneSource();
  accountId = await makeAccount('rebuild');
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

/** A completed stage-4 rune in the common slot. */
async function completeRune(): Promise<void> {
  await fund(FULL_RUNE_COST);
  await placeStage(accountId, HERO, 'common', { luck: 20 });
  await placeStage(accountId, HERO, 'common', { luck: 10 });
  await placeStage(accountId, HERO, 'common', { luck: 5 });
  await placeStage(accountId, HERO, 'common', {}, utilityFor(HERO, 'common'));
}

describe('the warning, which is the part that has to be right', () => {
  it('refuses an unconfirmed rebuild', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);

    await expect(
      rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, false),
    ).rejects.toMatchObject({ code: 'needs-confirmation' });
  });

  it('names that the old rune is gone INCLUDING its utility effect', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);

    await expect(rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, false)).rejects.toThrow(
      /utility effect/i,
    );
  });

  it('names that the replacement is not necessarily an upgrade', async () => {
    // SC-007. A player who did not understand this has not consented to it.
    await completeRune();
    await fund(FULL_RUNE_COST);

    await expect(rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, false)).rejects.toThrow(
      /not necessarily an upgrade/i,
    );
  });

  it('changes nothing when it refuses', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);
    const before = await balance(accountId);

    await expect(rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, false)).rejects.toThrow();

    const [row] = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(row!.stage, 'the old rune survived').toBe(MAX_STAGE);
    expect(row!.allocations).toEqual({ luck: 35 });
    expect(await balance(accountId)).toBe(before);
  });
});

describe('the rebuild itself', () => {
  it('charges 650 exactly once, as one row', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);

    await rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, true, utilityFor(HERO, 'common'));

    const rows = await db()
      .select()
      .from(shardLedger)
      .where(eq(shardLedger.accountId, accountId));

    const rebuilds = rows.filter((r) => r.reason === 'rune-rebuild');
    expect(rebuilds, 'exactly one rebuild row').toHaveLength(1);
    expect(rebuilds[0]!.delta).toBe(-FULL_RUNE_COST);
  });

  /**
   * **The utility assertion changed shape in 021 and had to.** It read
   * `toBeNull()`, which was true only because a rebuild could not carry an effect
   * at all — the very defect 021 fixes. A rebuild now lands on stage 4 complete,
   * so *"the old rune is gone"* has to be said as **the new effect is there and
   * the old one is not**, which needs the two to differ.
   */
  it('destroys the old rune — all four stages — and leaves exactly one', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);

    const old = utilityFor(HERO, 'common');
    const replacement = otherUtilityFor(HERO, 'common', old);

    await rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, true, replacement);

    const rows = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(rows, 'the old rune was not destroyed').toHaveLength(1);
    expect(rows[0]!.allocations, 'the old allocation survived').toEqual({ might: 30, luck: 5 });
    expect(rows[0]!.utilityEffect, 'the rebuild did not place the chosen effect').toBe(replacement);
    expect(rows[0]!.utilityEffect, 'the old utility effect survived').not.toBe(old);
  });

  it('provides no refund path', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);
    const before = await balance(accountId);

    await rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, true, utilityFor(HERO, 'common'));

    // Commitment is the mechanic. Nothing comes back for the destroyed rune.
    expect(await balance(accountId)).toBe(before - FULL_RUNE_COST);
  });

  it('refuses when the balance will not cover a whole rune', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST - 1);

    await expect(
      rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, true, utilityFor(HERO, 'common')),
    ).rejects.toMatchObject({ code: 'insufficient-shards' });
  });

  it('refuses a rebuild of an empty slot', async () => {
    await fund(FULL_RUNE_COST);
    await expect(
      rebuildRune(accountId, HERO, 'secondary', { might: 30, luck: 5 }, true, utilityFor(HERO, 'secondary')),
    ).rejects.toMatchObject({ code: 'slot-mismatch' });
  });
});

describe('the gear score moves inside the transaction', () => {
  it('is recomputed by the rebuild, not left stale', async () => {
    await completeRune();
    await fund(FULL_RUNE_COST);

    const result = await rebuildRune(accountId, HERO, 'common', { might: 30, luck: 5 }, true, utilityFor(HERO, 'common'));

    // A rebuild always places the full 35, so the SCORE is unchanged — which is
    // exactly why "not necessarily an upgrade" is about the allocation and the
    // utility effect rather than about the number. A player trading 35 points of
    // luck for 35 of might gains nothing measurable and may well be worse off.
    expect(result.gearScore).toBe(Math.round(2.5 * 35));

    const [row] = await db()
      .select()
      .from(playerRatings)
      .where(eq(playerRatings.accountId, accountId));
    expect(row!.gearScore, 'the stored score disagrees with the returned one').toBe(
      result.gearScore,
    );
  });

  it('sees the rune the same transaction just wrote', async () => {
    // The bug this guards: recordPlacement reading through db() instead of the
    // transaction handle would score the account as it was BEFORE the placement —
    // silently, and only for the write that matters most.
    await fund(150);
    const result = await placeStage(accountId, HERO, 'primary', { might: 20 });

    expect(result.gearScore, 'scored as if the rune had not been placed').toBe(
      Math.round(2.5 * 20),
    );
  });

  it('leaves the score alone when there is no rune source installed', async () => {
    const undo = setRuneSource(noRuneSource);
    try {
      await fund(150);
      const result = await placeStage(accountId, HERO, 'primary', { might: 20 });

      // 009's rule: null is not zero, and the placeholder is never written.
      expect(result.gearScore).toBe(1_500);
      const rows = await db()
        .select()
        .from(playerRatings)
        .where(eq(playerRatings.accountId, accountId));
      expect(rows, 'the starter grant was written as a stored value').toHaveLength(0);
    } finally {
      undo();
    }
  });
});
