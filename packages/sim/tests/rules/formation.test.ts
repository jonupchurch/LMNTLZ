/**
 * The formation rules, and the line between a squad that is **unfinished** and
 * one that is **impossible**.
 *
 * ### Why this file exists now
 *
 * `validateFormation` had no direct test. It was covered through the API's save
 * route, which is real coverage but the wrong shape for a pure function that
 * both halves of the app import — a fault here reaches the client and the server
 * identically, and the route test only ever sees it through a `422`.
 *
 * That mattered the moment the size check was split out of it so a half-built
 * defense could be stored. The refactor is exactly the kind that keeps every
 * integration test green while quietly changing what a squad is allowed to be.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import {
  ROW_CAPACITY,
  SQUAD_ROWS,
  SQUAD_SIZE,
  validateFormation,
  validatePlacement,
  type Seat,
} from '../../rules/index.js';

const IDS = getAllHeroes().map((h) => h.id);

/** The one legal arrangement of six: 2 front, 3 middle, 1 back. */
const SIX: Seat[] = [
  { row: 'front', index: 0, heroId: IDS[0]! },
  { row: 'front', index: 1, heroId: IDS[1]! },
  { row: 'middle', index: 0, heroId: IDS[2]! },
  { row: 'middle', index: 1, heroId: IDS[3]! },
  { row: 'middle', index: 2, heroId: IDS[4]! },
  { row: 'back', index: 0, heroId: IDS[5]! },
];

/**
 * Placements that are wrong at **any** size. Each is a seat that cannot exist,
 * as against a squad that is merely short — which is the whole distinction the
 * two functions encode.
 */
const IMPOSSIBLE: readonly { readonly name: string; readonly code: string; readonly seats: Seat[] }[] =
  [
    {
      name: 'a row that is not a row',
      code: 'unknown-row',
      seats: [{ row: 'flank' as Seat['row'], index: 0, heroId: IDS[0]! }],
    },
    {
      name: 'a seat past the end of its row',
      code: 'index-out-of-row',
      seats: [{ row: 'back', index: 1, heroId: IDS[0]! }],
    },
    {
      name: 'a fractional index',
      code: 'index-out-of-row',
      seats: [{ row: 'front', index: 0.5, heroId: IDS[0]! }],
    },
    {
      name: 'two champions in one seat',
      code: 'duplicate-seat',
      seats: [
        { row: 'front', index: 0, heroId: IDS[0]! },
        { row: 'front', index: 0, heroId: IDS[1]! },
      ],
    },
    {
      name: 'one champion in two seats',
      code: 'duplicate-hero',
      seats: [
        { row: 'front', index: 0, heroId: IDS[0]! },
        { row: 'middle', index: 0, heroId: IDS[0]! },
      ],
    },
    {
      name: 'a champion who does not exist',
      code: 'unknown-hero',
      seats: [{ row: 'front', index: 0, heroId: 'h99' }],
    },
  ];

describe('a squad that may fight', () => {
  it('accepts the 2/3/1 formation', () => {
    expect(validateFormation(SIX)).toBeNull();
  });

  it('requires exactly six, and says how many it found', () => {
    for (const n of [0, 1, 5]) {
      const fault = validateFormation(SIX.slice(0, n));
      expect(fault?.code, `${n} champions`).toBe('wrong-size');
      expect(fault?.detail).toContain(`${n}`);
    }
  });

  it('rejects a seventh champion, who has nowhere legal to stand', () => {
    expect(validateFormation([...SIX, { row: 'front', index: 0, heroId: IDS[6]! }])?.code).toBe(
      'wrong-size',
    );
  });

  it.each(IMPOSSIBLE)('rejects $name', ({ code, seats }) => {
    /* Padded to six so the size check cannot be what fails — the claim is that
       the placement rule fires, not that the count does. */
    const padded = [...seats, ...SIX.filter((s) => !seats.some((x) => x.heroId === s.heroId))].slice(
      0,
      SQUAD_SIZE,
    );
    expect(validateFormation(padded)?.code).toBe(code);
  });

  /**
   * The `wrong-row-counts` branch documents itself as unreachable, and this is
   * the reason: `ROW_CAPACITY` sums to `SQUAD_SIZE`, so six distinct in-bounds
   * positions have to be *all* the positions, which is 2/3/1 by construction.
   *
   * Asserted rather than trusted, because the branch stays for the day somebody
   * changes a capacity — and on that day this is the test that explains why.
   */
  it('cannot be given wrong row counts while the capacities sum to six', () => {
    const total = SQUAD_ROWS.reduce((sum, row) => sum + ROW_CAPACITY[row], 0);
    expect(total).toBe(SQUAD_SIZE);
  });
});

describe('a squad that may be stored', () => {
  /**
   * **The point of the split.** A player moving a champion between zones leaves
   * the source zone short; before this, that zone could not be saved until a
   * replacement was found, so the reorganisation had to be completed in one
   * sitting or abandoned.
   */
  it('accepts every prefix of a legal squad, down to none at all', () => {
    for (let n = 0; n <= SQUAD_SIZE; n += 1) {
      expect(validatePlacement(SIX.slice(0, n)), `${n} champions`).toBeNull();
    }
  });

  it('accepts an empty squad specifically, which is how a zone is cleared', () => {
    expect(validatePlacement([])).toBeNull();
    expect(validateFormation([])?.code, 'and it still cannot fight').toBe('wrong-size');
  });

  /**
   * **Nothing else was relaxed**, and this is the assertion that says so. Each
   * of these is checked at its own natural size — one or two seats — which is
   * precisely the size at which the old code never ran these rules at all,
   * because it returned `wrong-size` before reaching them.
   */
  it.each(IMPOSSIBLE)('still rejects $name at partial size', ({ code, seats }) => {
    expect(validatePlacement(seats)?.code).toBe(code);
  });

  /**
   * The two functions must not disagree about a *complete* squad — one rule
   * engine, two entry points. If a fault is reachable from one and not the
   * other at six champions, the save and the battle have different opinions
   * about the same squad.
   */
  it('agrees with the battle rule on anything already six strong', () => {
    expect(validatePlacement(SIX)).toBeNull();
    expect(validateFormation(SIX)).toBeNull();

    for (const { seats } of IMPOSSIBLE) {
      const padded = [
        ...seats,
        ...SIX.filter((s) => !seats.some((x) => x.heroId === s.heroId)),
      ].slice(0, SQUAD_SIZE);
      expect(validatePlacement(padded)?.code).toBe(validateFormation(padded)?.code);
    }
  });
});
