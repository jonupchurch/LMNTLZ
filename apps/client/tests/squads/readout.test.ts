/**
 * The SQUAD READOUT's four readings, and the reach preview beside the board
 * (019 US2).
 *
 * These are the only new *claims about the game* the squad screen makes, so
 * they are the only part of it a unit test can carry real signal about. The
 * rest is layout, which `design-audit.py` counts and a human reads.
 *
 * **Every expectation below is computed from `@lmntlz/content`, never typed
 * out.** A test that hardcoded "Bramwen's bane is Air" would be a second
 * authoring of the weakness table — the exact thing Constitution XV forbids —
 * and it would pass on the day it was written and lie afterwards.
 */

import { describe, expect, it } from 'vitest';
import { counter, DAMAGE_TYPES, getAllHeroes, type Hero } from '@lmntlz/content';
import { SQUAD_SIZE, type Seat } from '@lmntlz/sim/rules';
import {
  coverage,
  headline,
  reachSpread,
  sharedDoors,
  tempo,
  vulnerability,
} from '../../src/features/squads/analysis.js';
import { enemyReach, seatDistance, seatReach } from '../../src/features/squads/reachPreview.js';

const HEROES = getAllHeroes();
const six = (): readonly Hero[] => HEROES.slice(0, SQUAD_SIZE);

/** The 2/3/1 formation, in the order the server serves it. */
const seatsFrom = (heroes: readonly Hero[]): Seat[] => [
  { row: 'front', index: 0, heroId: heroes[0]!.id },
  { row: 'front', index: 1, heroId: heroes[1]!.id },
  { row: 'middle', index: 0, heroId: heroes[2]!.id },
  { row: 'middle', index: 1, heroId: heroes[3]!.id },
  { row: 'middle', index: 2, heroId: heroes[4]!.id },
  { row: 'back', index: 0, heroId: heroes[5]!.id },
];

describe('collective vulnerability', () => {
  it('counts a Bane and a Fault separately, because they are not the same threat', () => {
    const squad = six();
    const rows = vulnerability(squad);

    for (const row of rows) {
      expect(row.banes).toBe(squad.filter((h) => counter(h.primary) === row.type).length);
      expect(row.faults).toBe(squad.filter((h) => counter(h.secondary) === row.type).length);
    }
  });

  it('accounts for every champion exactly once on each side of the derivation', () => {
    const squad = six();
    const rows = vulnerability(squad);

    /**
     * `counter` is a bijection over all nine, so the six Banes and the six
     * Faults must each land somewhere and nowhere twice. A readout that dropped
     * one would look completely plausible.
     */
    expect(rows.reduce((n, r) => n + r.banes, 0)).toBe(SQUAD_SIZE);
    expect(rows.reduce((n, r) => n + r.faults, 0)).toBe(SQUAD_SIZE);
    expect(rows).toHaveLength(DAMAGE_TYPES.length);
  });

  it('weights a Bane above a Fault, in the ratio the battle uses', () => {
    /* Two squads of one: one baned by Air, one faulted by it. Same count,
       different weight — 1.50 against 1.25. */
    const baned = HEROES.filter((h) => h.bane === 'air').slice(0, 1);
    const faulted = HEROES.filter((h) => h.fault === 'air' && h.bane !== 'air').slice(0, 1);
    expect(baned).toHaveLength(1);
    expect(faulted).toHaveLength(1);

    const a = vulnerability(baned).find((r) => r.type === 'air')!;
    const b = vulnerability(faulted).find((r) => r.type === 'air')!;

    expect(a.weight).toBeGreaterThan(b.weight);
    expect(a.weight).toBeCloseTo(1);
    expect(b.weight).toBeCloseTo(1.25 / 1.5);
  });

  it('is empty, not broken, for an empty squad', () => {
    for (const row of vulnerability([])) {
      expect(row).toMatchObject({ banes: 0, faults: 0, weight: 0 });
    }
  });
});

describe('shared doors', () => {
  it('fires on a second champion with the same Bane and not on a shared Fault', () => {
    const pair = HEROES.filter((h) => h.bane === HEROES[0]!.bane).slice(0, 2);
    expect(pair.length).toBe(2);
    expect(sharedDoors(pair).map((d) => d.type)).toEqual([pair[0]!.bane]);

    /* One of each Bane is a closed formation however the Faults fall — which
       is the distinction the callout rests on. */
    const distinct: Hero[] = [];
    for (const hero of HEROES) {
      if (!distinct.some((h) => h.bane === hero.bane)) distinct.push(hero);
      if (distinct.length === SQUAD_SIZE) break;
    }
    expect(distinct).toHaveLength(SQUAD_SIZE);
    expect(sharedDoors(distinct)).toEqual([]);
  });
});

describe('damage coverage', () => {
  it('is the union of both authored forces, not just the House', () => {
    const squad = six();
    const expected = new Set(squad.flatMap((h) => [h.primary, h.secondary]));
    expect(coverage(squad).covered).toEqual(expected);
    expect(coverage(squad).count).toBe(expected.size);
  });

  it('never claims more than the nine', () => {
    expect(coverage(HEROES).count).toBeLessThanOrEqual(DAMAGE_TYPES.length);
  });
});

describe('tempo', () => {
  it('reads as pure sustain when nothing waits, and pure burst when everything does', () => {
    const instant = synth([{ cooldown: 0, gateTurn: 1, multiplier: 2 }]);
    const slow = synth([{ cooldown: 3, gateTurn: 1, multiplier: 2 }]);
    const gated = synth([{ cooldown: 0, gateTurn: 3, multiplier: 2 }]);

    expect(tempo([instant]).burst).toBe(0);
    expect(tempo([instant]).band).toBe('sustain');
    expect(tempo([slow]).burst).toBe(1);
    expect(tempo([slow]).band).toBe('burst');
    /* A gate is a wait too — a tier-5 power on turn 5 is not "available". */
    expect(tempo([gated]).burst).toBe(1);
  });

  it('weights by damage rather than counting powers', () => {
    /* Three trivial fast powers against one enormous slow one. Counting says
       25% burst; weighting says the squad is built around the slow one. */
    const hero = synth([
      { cooldown: 0, gateTurn: 1, multiplier: 0.5 },
      { cooldown: 0, gateTurn: 1, multiplier: 0.5 },
      { cooldown: 0, gateTurn: 1, multiplier: 0.5 },
      { cooldown: 4, gateTurn: 1, multiplier: 6 },
    ]);
    expect(tempo([hero]).burst).toBeCloseTo(6 / 7.5);
    expect(tempo([hero]).band).toBe('burst');
  });

  it('ignores powers that deal no damage, because they have no share of a damage total', () => {
    const hero = synth([
      { cooldown: 0, gateTurn: 1, multiplier: 1 },
      { cooldown: 5, gateTurn: 1, multiplier: null },
    ]);
    expect(tempo([hero]).burst).toBe(0);
  });

  it('does not divide by zero on a squad with nothing to measure', () => {
    expect(tempo([]).burst).toBe(0);
    expect(tempo([synth([{ cooldown: 0, gateTurn: 1, multiplier: null }])]).burst).toBe(0);
  });
});

describe('reach spread', () => {
  it('splits the squad by reach and loses nobody', () => {
    const squad = six();
    const spread = reachSpread(squad);
    expect(spread.long + spread.short).toBe(squad.length);
    expect(spread.long).toBe(squad.filter((h) => h.reach === 2).length);
  });
});

describe('the headline', () => {
  it('says something about an empty squad rather than an empty sentence', () => {
    expect(headline([])).toMatch(/nobody/i);
  });

  it('names a shared door when there is one', () => {
    const pair = HEROES.filter((h) => h.bane === HEROES[0]!.bane).slice(0, 2);
    expect(headline(pair)).toMatch(/shared door/i);
  });
});

// ---------------------------------------------------------------------------
// The reach preview
// ---------------------------------------------------------------------------

describe('the reachability preview calls the engine rather than restating it', () => {
  const seats = seatsFrom(six());

  it('agrees with distance() on the opening position, row by row', () => {
    /**
     * **The assertion the whole module exists to earn.** At full formation the
     * back seat is three occupied rows from the enemy front, the middle two,
     * the front one — so a seat reaches an enemy row exactly when the engine's
     * own `distance()` is within its reach. Computed both ways here; a second
     * implementation would agree with itself and not with this.
     */
    for (const seat of seats) {
      const hero = HEROES.find((h) => h.id === seat.heroId)!;
      const reach = seatReach(seats, seat);
      for (const row of [4, 5, 6] as const) {
        const within = seatDistance(seats, seat.row, row) <= hero.reach;
        expect(reach.enemyRows.includes(row)).toBe(within);
      }
    }
  });

  /**
   * ### The assertions above are not enough on their own
   *
   * They compare `seatReach` with `seatDistance`, and both read the same
   * fabricated board — so they agree with each other however wrong that board
   * is. Deleting the enemy back rank from the model passed all of them.
   *
   * Everything below is anchored to a distance the *game* fixes, so a mistake
   * in the fabrication has somewhere to show up.
   */
  it('puts the back seat three occupied rows from the enemy front', () => {
    /* The priced consequence `reach.ts` documents: a reach-2 back seat still
       cannot attack while both of its own lines stand. */
    expect(seatDistance(seats, 'back', 4)).toBe(3);
    expect(seatDistance(seats, 'middle', 4)).toBe(2);
    expect(seatDistance(seats, 'front', 4)).toBe(1);
  });

  it('models a full enemy six, so the far rank is genuinely out of reach', () => {
    /**
     * **Row 6 is unreachable by anybody at the opening position** — three
     * occupied rows from the front seat against a maximum reach of 2 — and
     * that is what the design draws beside the board. It is also the one
     * reading that catches a half-populated opponent: drop the enemy back
     * rank and row 6 becomes reachable, which no test comparing the module
     * against itself can see.
     */
    expect(seatDistance(seats, 'front', 6)).toBe(3);
    expect(seatDistance(seats, 'front', 5)).toBe(2);

    const rows = enemyReach(seats);
    expect(rows.find((r) => r.row === 6)!.reachers).toBe(0);
    /* And the near rank is reachable, so "0" is a reading rather than a floor
       every row happens to sit on. */
    expect(rows.find((r) => r.row === 4)!.reachers).toBeGreaterThan(0);
  });

  it('reports own rows in both directions, because a heal is range-limited too', () => {
    const middle = seats.find((s) => s.row === 'middle')!;
    const reach = seatReach(seats, middle);
    /* Row 2 is its own; 1 and 3 are one occupied row away in either direction,
       so every champion in the middle reaches both of its own neighbours. */
    expect(reach.ownRows).toContain(1);
    expect(reach.ownRows).toContain(3);
  });

  it('counts how many of the six can touch each enemy row', () => {
    const rows = enemyReach(seats);
    expect(rows.map((r) => r.row)).toEqual([4, 5, 6]);
    expect(rows.map((r) => r.seats)).toEqual([2, 3, 1]);

    for (const row of rows) {
      const expected = seats.filter((seat) => {
        const hero = HEROES.find((h) => h.id === seat.heroId)!;
        return seatDistance(seats, seat.row, row.row) <= hero.reach;
      }).length;
      expect(row.reachers).toBe(expected);
    }
  });

  it('reaches nobody from an empty board rather than throwing', () => {
    expect(enemyReach([]).every((r) => r.reachers === 0)).toBe(true);
  });
});

/** A hero with authored powers replaced, for the tempo cases. */
function synth(
  powers: readonly { cooldown: number; gateTurn: number; multiplier: number | null }[],
): Hero {
  const base = HEROES[0]!;
  return {
    ...base,
    powers: powers.map((p, i) => ({
      ...base.powers[0]!,
      id: `synthetic-${i}`,
      cooldown: p.cooldown,
      gateTurn: p.gateTurn,
      multiplier: p.multiplier,
    })) as unknown as Hero['powers'],
  };
}
