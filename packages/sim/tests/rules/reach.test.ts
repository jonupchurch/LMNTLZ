import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { distance, inReach, rowsInReach } from '../../rules/reach.js';
import { ALL_ROWS, type BattleState, type Row } from '../../rules/state.js';
import { clearRows, fullBattle, heroStateFor, stateOf, withHero } from './fixtures.js';

/**
 * T029 — the exhaustive enumeration.
 *
 * **30 ordered row pairs × 64 occupancy patterns = 1,920 cases, no mocks.** The
 * domain is small enough to enumerate completely, so there is no reason to
 * sample it. Reach is the rule everything else in targeting stands on; a
 * property that holds on the cases somebody thought of is not the same claim.
 */
describe('distance, exhaustively', () => {
  /** One hero per occupied row, so occupancy is exactly the bit pattern. */
  const stateForPattern = (pattern: number): BattleState => {
    const heroes = ALL_ROWS.filter((_, i) => (pattern & (1 << i)) !== 0).map((row) =>
      heroStateFor(getHero('h01'), row <= 3 ? 'attacker' : 'defender', row, `r${row}`),
    );
    return stateOf(heroes);
  };

  const orderedPairs: { from: Row; to: Row }[] = ALL_ROWS.flatMap((from) =>
    ALL_ROWS.filter((to) => to !== from).map((to) => ({ from, to })),
  );

  it('enumerates 30 ordered pairs and 64 patterns', () => {
    expect(orderedPairs).toHaveLength(30);
    expect(Array.from({ length: 64 }, (_, i) => i)).toHaveLength(64);
  });

  it('counts occupied rows crossed, including the target and excluding the actor', () => {
    let checked = 0;

    for (let pattern = 0; pattern < 64; pattern++) {
      const state = stateForPattern(pattern);

      for (const { from, to } of orderedPairs) {
        const step = to > from ? 1 : -1;
        let expected = 0;
        for (let row = from + step; ; row += step) {
          if ((pattern & (1 << (row - 1))) !== 0) expected++;
          if (row === to) break;
        }

        expect(distance(state, from, to), `pattern ${pattern}, ${from}->${to}`).toBe(expected);
        checked++;
      }
    }

    expect(checked).toBe(1920);
  });

  it('is symmetric between any two rows', () => {
    for (let pattern = 0; pattern < 64; pattern++) {
      const state = stateForPattern(pattern);
      for (const { from, to } of orderedPairs) {
        // Excluding the actor's row and including the target's cancel out.
        const forward = distance(state, from, to);
        const back = distance(state, to, from);
        const selfOccupied = (pattern & (1 << (from - 1))) !== 0 ? 1 : 0;
        const targetOccupied = (pattern & (1 << (to - 1))) !== 0 ? 1 : 0;
        expect(forward - targetOccupied).toBe(back - selfOccupied);
      }
    }
  });

  it('is zero from a row to itself', () => {
    for (let pattern = 0; pattern < 64; pattern++) {
      const state = stateForPattern(pattern);
      for (const row of ALL_ROWS) expect(distance(state, row, row)).toBe(0);
    }
  });

  it('never exceeds the number of rows crossed', () => {
    for (let pattern = 0; pattern < 64; pattern++) {
      const state = stateForPattern(pattern);
      for (const { from, to } of orderedPairs) {
        expect(distance(state, from, to)).toBeLessThanOrEqual(Math.abs(to - from));
      }
    }
  });
});

/**
 * T030 — the three named cases.
 */
describe('the three cases the design names', () => {
  it('row 1 to row 4 is distance 3 at full formation — the back seat cannot attack', () => {
    const state = fullBattle();
    expect(distance(state, 1, 4)).toBe(3);
  });

  it('the same shot is distance 2 with the attacker’s row 3 empty', () => {
    // The line collapsing is what hands the back seat a job.
    const state = clearRows(fullBattle(), [3]);
    expect(distance(state, 1, 4)).toBe(2);
  });

  /**
   * **The case that fails on a natural implementation.**
   *
   * A reach-2 front-seat hero with `+1` reach sees **three** enemy rows, not
   * two. An implementation that wrote `Math.min(reach + mod, 2)` would look
   * defensive and quietly delete the rune. Feature 004 carries FR-020 for this.
   */
  // A reach-2 hero placed in the front seat. The default fixture squad is
  // Bramwen, who is reach 1 — the formation is the player's choice, so a reach-2
  // hero standing at the front is an ordinary board, not a contrived one.
  const REACH_2 = 'h18'; // Corvane, Dark tank

  it('confirms the premise — the hero under test really is reach 2', () => {
    expect(getHero(REACH_2).reach).toBe(2);
  });

  it('gives a reach-2 front-seat hero with +1 reach THREE enemy rows', () => {
    const base = fullBattle([REACH_2]);
    const front = base.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;

    const withRune = withHero(base, front.instanceId, { reachMod: 1 });
    const enemyRows = rowsInReach(withRune, front.instanceId).filter((r) => r >= 4);

    expect(enemyRows).toEqual([4, 5, 6]);
  });

  it('gives the same hero only two enemy rows without the rune', () => {
    const base = fullBattle([REACH_2]);
    const front = base.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;
    const enemyRows = rowsInReach(base, front.instanceId).filter((r) => r >= 4);

    expect(enemyRows).toEqual([4, 5]);
  });

  it('gives a reach-1 front-seat hero exactly one enemy row', () => {
    const base = fullBattle(['h01']); // Bramwen, reach 1
    const front = base.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;

    expect(getHero(front.heroId).reach).toBe(1);
    expect(rowsInReach(base, front.instanceId).filter((r) => r >= 4)).toEqual([4]);
  });
});

describe('a fallen hero does not hold its row', () => {
  it('opens the line as heroes fall', () => {
    const full = fullBattle();
    const back = full.heroes.find((h) => h.side === 'attacker' && h.row === 1)!;

    expect(inReach(full, back.instanceId, 4)).toBe(false);

    const collapsed = clearRows(full, [2, 3]);
    expect(distance(collapsed, 1, 4)).toBe(1);
    expect(inReach(collapsed, back.instanceId, 4)).toBe(true);
  });

  it('treats a row of only fallen heroes as empty', () => {
    const full = fullBattle();
    expect(distance(full, 1, 4)).toBe(3);

    const someDown = withHero(full, 'attacker-0', { hp: 0 });
    // Row 3 holds two heroes; one falling does not empty it.
    expect(distance(someDown, 1, 4)).toBe(3);

    const rowDown = withHero(someDown, 'attacker-1', { hp: 0 });
    expect(distance(rowDown, 1, 4)).toBe(2);
  });
});
