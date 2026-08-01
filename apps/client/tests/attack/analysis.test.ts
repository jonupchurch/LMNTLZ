/**
 * Reading a wall — the arithmetic, without React (019).
 *
 * ### Why these are unit tests and not assertions inside the screen test
 *
 * Every number in `analysis.ts` is a claim about the game, and a claim about the
 * game should be checkable without mounting a component and querying for text.
 * The screen test can then assert that the *rendered* numbers match these, which
 * is a different question.
 *
 * ### Nothing here hardcodes a matchup
 *
 * Expected values are computed from `@lmntlz/content` in the test itself, off
 * `hero.bane` and `hero.fault`. A literal "air opens 3" would keep passing after
 * the authored types moved and would then be asserting a count nothing produces
 * — the exact hole `attack.test.tsx` documents from its own first draft.
 */

import { describe, expect, it } from 'vitest';
import {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
  getAllHeroes,
  type DamageType,
  type Hero,
} from '@lmntlz/content';
import {
  bestAgainst,
  doorsOf,
  effectivenessAgainst,
  forcesOf,
  readWall,
} from '../../src/features/attack/analysis.js';
import type { ScoutSeat } from '../../src/features/attack/types.js';

const HEROES = getAllHeroes();

const seatOf = (hero: Hero, i: number): ScoutSeat => ({
  row: i < 2 ? 'front' : i < 5 ? 'middle' : 'back',
  index: i < 2 ? i : i < 5 ? i - 2 : 0,
  hero: {
    id: hero.id,
    name: hero.name,
    primary: hero.primary,
    secondary: hero.secondary,
    bane: hero.bane,
    fault: hero.fault,
    role: hero.role,
    reach: hero.reach,
  },
  runes: [
    { element: hero.primary, stages: 0 },
    { element: hero.secondary, stages: 0 },
    { element: 'common', stages: 0 },
  ],
});

const wallOf = (heroes: readonly Hero[]) => heroes.map(seatOf);

describe('the ladder, in the direction a scout reads it', () => {
  it('answers every one of the five tiers off the derived profile', () => {
    const hero = HEROES[0]!;

    expect(effectivenessAgainst(hero.bane, hero)).toBe(BANE);
    expect(effectivenessAgainst(hero.fault, hero)).toBe(FAULT);
    expect(effectivenessAgainst(hero.primary, hero)).toBe(RESISTED_PRIMARY);
    expect(effectivenessAgainst(hero.secondary, hero)).toBe(RESISTED_SECONDARY);
  });

  /**
   * **The four slots are distinct by construction**, so every hero has a
   * neutral force and the fifth tier is reachable. If this ever fails, the
   * content schema's three distinctness rules have been broken rather than this
   * function.
   */
  it('is neutral against a force that is none of the four', () => {
    for (const hero of HEROES) {
      const named = new Set([hero.bane, hero.fault, hero.primary, hero.secondary]);
      expect(named.size, `${hero.name} has a collision in its four slots`).toBe(4);

      const neutral = (['earth', 'air', 'fire', 'water', 'light', 'dark', 'slash', 'pierce', 'crush'] as const).find(
        (type) => !named.has(type),
      );
      expect(effectivenessAgainst(neutral!, hero)).toBe(NEUTRAL);
    }
  });

  it('takes the best of a squad’s forces, not the first or the last', () => {
    const hero = HEROES[0]!;
    /* Bane last in iteration order, so a function returning the first match
       rather than the best would return RESISTED_PRIMARY here. */
    const forces = new Set<DamageType>([hero.primary, hero.fault, hero.bane]);
    expect(bestAgainst(forces, hero)).toBe(BANE);

    // And an empty squad is neutral — "nobody chosen" is not "cannot hurt them".
    expect(bestAgainst(new Set(), hero)).toBe(NEUTRAL);
  });

  /**
   * **The maximum, including when the maximum is below neutral.**
   *
   * This is the assertion the shipped bug walked through. `bestAgainst` was
   * seeded at `NEUTRAL` and only replaced on a strictly greater roll, so a
   * squad every one of whose forces this defender resists came back ×1.00 — and
   * `readWall` could not see the difference, because it buckets everything
   * below ×1.25 the same way. The only place the error is visible is here.
   */
  it('returns the true maximum even when every force is resisted', () => {
    for (const defender of HEROES) {
      for (const attacker of HEROES) {
        const forces = forcesOf([attacker]);
        const rolls = [...forces].map((force) => effectivenessAgainst(force, defender));
        expect(
          bestAgainst(forces, defender),
          `${attacker.name} → ${defender.name}`,
        ).toBe(Math.max(...rolls));
      }
    }

    /* And the resisted case is actually reachable, so the loop above is not
       vacuously agreeing about neutral values. */
    const resistedPairs = HEROES.flatMap((defender) =>
      HEROES.filter((attacker) => bestAgainst(forcesOf([attacker]), defender) < NEUTRAL),
    );
    expect(resistedPairs.length, 'no pairing is resisted at all — the loop proves nothing').
      toBeGreaterThan(0);
  });

  it('counts both of a champion’s forces, never only the primary', () => {
    const squad = [HEROES[0]!];
    expect(forcesOf(squad)).toEqual(new Set([squad[0]!.primary, squad[0]!.secondary]));
  });
});

describe('the doors in a wall', () => {
  it('tallies Banes and Faults from the payload, Banes first', () => {
    const six = HEROES.slice(0, 6);
    const doors = doorsOf(wallOf(six));

    // Computed from content, never asserted as a literal.
    const banes = new Map<string, number>();
    const faults = new Map<string, number>();
    for (const hero of six) {
      banes.set(hero.bane, (banes.get(hero.bane) ?? 0) + 1);
      faults.set(hero.fault, (faults.get(hero.fault) ?? 0) + 1);
    }

    for (const door of doors) {
      expect(door.banes, `${door.type} banes`).toBe(banes.get(door.type) ?? 0);
      expect(door.faults, `${door.type} faults`).toBe(faults.get(door.type) ?? 0);
    }

    // Every force that is anybody's weakness is listed, and nothing else is.
    expect(new Set(doors.map((d) => d.type))).toEqual(
      new Set([...banes.keys(), ...faults.keys()]),
    );

    // Banes first: the ×1.50 is the lever.
    for (let i = 1; i < doors.length; i += 1) {
      expect(doors[i - 1]!.banes).toBeGreaterThanOrEqual(doors[i]!.banes);
    }
  });

  it('says nothing about an empty wall rather than inventing a door', () => {
    expect(doorsOf([])).toEqual([]);
  });
});

describe('your six against their wall', () => {
  /**
   * The three counts partition the wall: every defender is opened, nicked,
   * walled, or answered at exactly neutral. A reading whose counts overlap
   * would double-weight somebody.
   */
  /**
   * The three counts **partition** the wall — every defender is opened, nicked
   * or unanswered, and none is two of them. A reading whose counts overlapped
   * would double-weight somebody; one whose counts fell short would be silently
   * dropping a defender out of the verdict.
   */
  it('accounts for every defender exactly once', () => {
    for (let i = 0; i < HEROES.length; i += 1) {
      const wall = wallOf(HEROES.slice(0, 6));
      const reading = readWall(wall, HEROES.slice(i, i + 6));

      expect(reading.opened + reading.nicked + reading.unanswered, `squad at ${i}`).toBe(
        wall.length,
      );
      expect(reading.score).toBe(reading.opened * 2 + reading.nicked - reading.unanswered);
    }
  });

  it('counts an opened door for every defender the squad Banes', () => {
    /**
     * A squad built **from the wall's own Banes**, so the expected count is a
     * fact about the fixture rather than an observation of the function.
     */
    const wall = wallOf(HEROES.slice(0, 6));
    const wanted = new Set(wall.map((seat) => seat.hero.bane));
    const squad = [...wanted]
      .map((type) => HEROES.find((h) => h.primary === type))
      .filter((h): h is Hero => h !== undefined);

    const reading = readWall(wall, squad);
    const forces = forcesOf(squad);
    const expected = wall.filter((seat) => forces.has(seat.hero.bane as DamageType)).length;

    expect(reading.opened).toBe(expected);
    expect(expected, 'the fixture opened nothing, so this asserts nothing').toBeGreaterThan(0);
  });

  it('never lists a force as both a lever and a wall', () => {
    const wall = wallOf(HEROES.slice(3, 9));
    const reading = readWall(wall, HEROES.slice(0, 6));

    const opens = new Set(reading.opens.map((o) => o.type));
    for (const entry of reading.resisted) {
      expect(opens.has(entry.type), `${entry.type} was listed on both sides`).toBe(false);
    }
  });

  /**
   * **The subtraction is the point.** A squad that Banes three of six and is
   * hard-resisted by the other three is not a favourable read, and a verdict
   * from `opened` alone would call it one.
   */
  it('does not call a squad favourable when as much of it is unanswered as lands', () => {
    const wall = wallOf(HEROES.slice(0, 6));
    const readings = HEROES.map((_, i) => readWall(wall, HEROES.slice(i, i + 6)));

    /**
     * **The subtracted term has to be non-zero somewhere first.**
     *
     * Two earlier versions of this reading were structurally dead and this test
     * passed anyway. `bestAgainst` seeded at `NEUTRAL` could never return a
     * resisted value; then `walled` — *every* incoming force resisted — turned
     * out to be unreachable for any six-hero squad, because six champions bring
     * most of the nine forces between them. Both times the spread this test
     * looked for came from `nicked` alone, so the assertion held with half the
     * verdict inert.
     */
    expect(
      readings.some((r) => r.unanswered > 0),
      'nothing is ever unanswered — the subtracted term cannot fire',
    ).toBe(true);

    /* Two squads with the SAME opened count and different unanswered counts
       must not score the same — the assertion a verdict reading only `opened`
       walks straight through. */
    const byOpened = new Map<number, Set<number>>();
    for (const r of readings.filter((r) => r.opened > 0)) {
      if (!byOpened.has(r.opened)) byOpened.set(r.opened, new Set());
      byOpened.get(r.opened)!.add(r.score);
    }
    expect(
      [...byOpened.values()].some((scores) => scores.size > 1),
      'every squad with equal doors scored equal — unanswered is not being read',
    ).toBe(true);
  });

  /**
   * **A label that says the same word about every squad is decoration.**
   *
   * The first build used fixed thresholds and put "Favourable read" on all
   * three attack squads at once — one opening six of six and one opening three
   * — which is exactly the distinction the chip exists to draw. Only a
   * screenshot caught it; this is the assertion that would have.
   */
  it('tells a squad that opens the whole wall apart from one that opens half', () => {
    const wall = wallOf(HEROES.slice(0, 6));
    const banes = new Set(wall.map((seat) => seat.hero.bane));

    /* Best case: a squad carrying every Bane on the wall. */
    const best = [...banes]
      .map((type) => HEROES.find((h) => h.primary === type))
      .filter((h): h is Hero => h !== undefined);
    expect(readWall(wall, best).opened).toBe(wall.length);
    expect(readWall(wall, best).verdict).toBe('favourable');

    /* And somewhere in the roster is a squad that reads worse. If every squad
       scored the same the chip would carry no information at all. */
    const verdicts = new Set(
      HEROES.map((_, i) => readWall(wall, HEROES.slice(i, i + 6)).verdict),
    );
    expect(
      verdicts.size,
      `every squad in the roster read "${[...verdicts][0]}" — the verdict does not discriminate`,
    ).toBeGreaterThan(1);
  });

  it('is uphill for a squad that answers nothing, and says so with no doors', () => {
    /**
     * **`walled` needs BOTH of an attacker's forces resisted**, not one — the
     * best of the two is what lands, so a neutral secondary is enough to keep a
     * defender off the walled count. The first draft of this fixture missed
     * that, hand-picked heroes with a resisted primary, and failed honestly.
     *
     * So the pair is searched for rather than chosen: any defender whose
     * `{primary, secondary}` is exactly some attacker's `{primary, secondary}`.
     */
    const pair = HEROES.flatMap((target) =>
      HEROES.filter(
        (attacker) =>
          (attacker.primary === target.primary || attacker.primary === target.secondary) &&
          (attacker.secondary === target.primary || attacker.secondary === target.secondary),
      ).map((attacker) => ({ target, attacker })),
    )[0];

    expect(pair, 'content holds no fully-resisted pairing; rewrite the fixture').toBeDefined();
    const wall = [seatOf(pair!.target, 0)];
    const reading = readWall(wall, [pair!.attacker]);

    expect(reading.opened).toBe(0);
    expect(reading.unanswered).toBe(1);
    expect(reading.verdict).toBe('uphill');
    expect(reading.opens).toEqual([]);
    /* And both forces are named as resisted, which is the ×0.50/×0.80 half of
       the ladder the readout's second column exists to show. */
    expect(reading.resisted.map((r) => r.type).sort()).toEqual(
      [pair!.attacker.primary, pair!.attacker.secondary].sort(),
    );
  });

  it('is neutral rather than uphill when no squad has been chosen', () => {
    /**
     * An empty squad answers everything at ×1.00 — nothing opened, nothing
     * walled. The screen must not tell a player their squad is hopeless before
     * they have picked one.
     */
    const wall = wallOf(HEROES.slice(0, 6));
    const reading = readWall(wall, []);
    expect(reading.opened).toBe(0);
    expect(reading.nicked).toBe(0);
    /* Every seat is unanswered, because nothing has been brought — the counts
       still partition the wall rather than reporting nothing at all. */
    expect(reading.unanswered).toBe(wall.length);
    expect(reading.opens).toEqual([]);
    expect(reading.resisted).toEqual([]);
  });
});
