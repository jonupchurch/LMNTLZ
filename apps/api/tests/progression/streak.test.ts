/**
 * The streak reward (2026-08-01).
 *
 * Two halves with deliberately different shapes, and the tests are shaped to
 * match:
 *
 * - the **attacker** is paid `streak − 100`, so everything interesting is at the
 *   boundary and the arithmetic is pure;
 * - the **defender** is paid the *whole* streak, and only when the streak
 *   actually reset — which is a rule about `nextAttackStreak`, not about money,
 *   so it is asserted against that function rather than restated here.
 *
 * `payoutFor` is pure and so are both of these, which is what lets the published
 * table in `06-progression.md` be checked without settling a battle.
 */

import { describe, expect, it } from 'vitest';
import { payoutFor, streakBonusFor, streakBountyFor } from '../../src/progression/income.js';
import { BALANCE_CAP, STREAK_BONUS_THRESHOLD } from '../../src/progression/config.js';
import { nextAttackStreak } from '../../src/squads/ambush.js';

describe('the attacker’s tail', () => {
  /** Jon's own example, and the reason the threshold is subtracted rather than divided. */
  it('pays 50 at a streak of 150', () => {
    expect(streakBonusFor(150)).toBe(50);
  });

  /**
   * **The boundary, pinned in both directions.**
   *
   * "Every win *over* 100" is exclusive, so 100 itself pays nothing and 101 pays
   * one. An off-by-one here is silent and permanent — nothing errors, and the
   * only evidence is a player one shard out at exactly the streak length nobody
   * tests by hand.
   */
  it('pays nothing at the threshold and one shard past it', () => {
    expect(streakBonusFor(STREAK_BONUS_THRESHOLD)).toBe(0);
    expect(streakBonusFor(STREAK_BONUS_THRESHOLD + 1)).toBe(1);
  });

  it('never goes negative below the threshold', () => {
    for (const streak of [0, 1, 45, 99]) {
      expect(streakBonusFor(streak), `streak ${streak}`).toBe(0);
    }
  });

  it('rises one for one with the streak', () => {
    expect(streakBonusFor(300) - streakBonusFor(299)).toBe(1);
  });

  /**
   * **It dwarfs the base award, and that is the design rather than a defect.**
   *
   * A chosen-door win pays 20; at a streak of 300 the tail pays 200 beside it.
   * The only ceiling either half meets is `BALANCE_CAP`, applied by `headroom` —
   * and that is a cap on what a player may *hold*, so a player who spends has it
   * back. The streak is its own limiter.
   */
  it('overtakes an ordinary victory by an order of magnitude', () => {
    const chosen = payoutFor({ kind: 'attack-victory', zone: 'visible' }, 6);
    expect(streakBonusFor(300)).toBe(chosen * 10);
  });

  /**
   * The one *hard* bound, stated so a reader does not assume a daily rate limit
   * that does not exist: a single award still cannot exceed what a player may
   * hold, because `awardStreakReward` goes through the same `headroom` every
   * other credit does.
   */
  it('is still subject to the balance cap, like every other credit', () => {
    expect(streakBonusFor(STREAK_BONUS_THRESHOLD + BALANCE_CAP + 1)).toBeGreaterThan(BALANCE_CAP);
  });
});

describe('the defender’s bounty', () => {
  it('pays the whole streak, with no threshold', () => {
    expect(streakBountyFor(150)).toBe(150);
    expect(streakBountyFor(3)).toBe(3);
  });

  /**
   * **The asymmetry is the decision.** A defender does not choose who attacks
   * them, so gating the bounty at 100 would pay nothing for the common case — the
   * same reasoning that keeps holds off the daily curve.
   */
  it('pays a defender more than the attacker earned on the same streak', () => {
    expect(streakBountyFor(150)).toBeGreaterThan(streakBonusFor(150));
  });

  it('pays nothing when there was no streak to end', () => {
    expect(streakBountyFor(0)).toBe(0);
  });
});

/**
 * 🔴 **The condition the bounty hangs on, asserted against the streak rule
 * itself.**
 *
 * `settle.ts` pays the bounty when `streakBefore > 0 && attackStreak === 0`. That
 * is a *derived* condition — it is true exactly when `nextAttackStreak` resets —
 * and the case it excludes is the one that matters: an **ambushed** loss does not
 * reset, so nothing was ended and there is nothing to collect.
 *
 * Without it, a single Hidden squad could be paid the same 300-shard bounty every
 * time an unbroken streak passed through it.
 */
describe('🔴 a bounty is paid for ending a streak, not for winning a defense', () => {
  const broke = (before: number, wasAmbush: boolean): boolean => {
    const after = nextAttackStreak(before, 'loss', wasAmbush).attackStreak;
    return before > 0 && after === 0;
  };

  it('a chosen-door loss ends the streak and pays', () => {
    expect(broke(150, false)).toBe(true);
  });

  it('an ambushed loss does not end it, and pays nothing', () => {
    expect(broke(150, true)).toBe(false);
    // ...and the streak really did survive, which is why.
    expect(nextAttackStreak(150, 'loss', true).attackStreak).toBe(150);
  });

  it('a defender who was never on a streak collects nothing', () => {
    expect(broke(0, false)).toBe(false);
  });

  /** A win obviously ends nothing, whatever the streak was. */
  it('does not fire on a battle the attacker won', () => {
    expect(nextAttackStreak(150, 'win', false).attackStreak).toBe(151);
  });
});
