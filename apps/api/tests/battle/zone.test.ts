/**
 * The zone is the server's to decide (007 T019, FR-002).
 *
 * ### Why a one-point error here would never be reported
 *
 * The ambush chance is displayed to the player as a percentage, and it is the
 * single lever deciding how often anybody's Hidden squad is ever seen. A `<=`
 * where a `<` belongs shifts every player's real rate one point above the number
 * on their screen — and nobody can tell, because the only way to measure your own
 * ambush rate is to fight several hundred battles and keep a tally.
 *
 * So the boundary is asserted at all four interesting points rather than
 * sampled: a distribution test would need thousands of draws to distinguish 20%
 * from 21%, and would still be flaky.
 */

import { describe, expect, it } from 'vitest';
import { AMBUSH_CAP, AMBUSH_CAP_AT, AMBUSH_PER_WIN, ambushChance } from '../../src/squads/ambush.js';
import { decideZone } from '../../src/battle/create.js';

describe('the ambush roll', () => {
  it('never ambushes on a cold streak, whatever the roll', () => {
    for (const roll of [0, 1, 50, 98, 99]) expect(decideZone(0, roll)).toBe('visible');
  });

  it('is exclusive at the boundary: a 10-win streak ambushes on 0..19 and not on 20', () => {
    const streak = 10;
    expect(ambushChance(streak)).toBe(streak * AMBUSH_PER_WIN);

    expect(decideZone(streak, 0)).toBe('hidden');
    expect(decideZone(streak, ambushChance(streak) - 1)).toBe('hidden');
    // The off-by-one. `<=` here gives 21 outcomes for a 20% chance.
    expect(decideZone(streak, ambushChance(streak))).toBe('visible');
    expect(decideZone(streak, 99)).toBe('visible');
  });

  it('counts exactly `chance` of the hundred rolls as an ambush', () => {
    /**
     * **The direct statement of what a percentage means**, and the assertion a
     * boundary check can still slip past — an implementation off by one at
     * *both* ends would satisfy the test above and fail this one.
     */
    for (const streak of [1, 7, 25, AMBUSH_CAP_AT]) {
      const hidden = Array.from({ length: 100 }, (_, roll) => decideZone(streak, roll)).filter(
        (z) => z === 'hidden',
      ).length;

      expect(hidden, `streak ${streak}`).toBe(ambushChance(streak));
    }
  });

  it('leaves the Visible squad reachable even at the cap', () => {
    /**
     * **The cap is not 90 by accident.** A player who could guarantee an ambush
     * would never fight a Visible squad again, and the Visible squad is the only
     * one anybody can choose to attack. Ten rolls in a hundred must still land
     * there at an unbeatable streak.
     */
    const enormous = AMBUSH_CAP_AT * 10;
    const visible = Array.from({ length: 100 }, (_, roll) => decideZone(enormous, roll)).filter(
      (z) => z === 'visible',
    ).length;

    expect(visible).toBe(100 - AMBUSH_CAP);
    expect(visible).toBeGreaterThan(0);
  });
});
