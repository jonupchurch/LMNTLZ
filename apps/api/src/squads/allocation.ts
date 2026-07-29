/**
 * The allocation invariants (006 T006–T008).
 *
 * **Pure functions over plain data, deliberately.** Every rule here is a
 * property of a set of squads, not of the database — so they are testable
 * without a connection, callable from the route layer before a transaction
 * opens, and impossible to accidentally enforce differently in two places.
 *
 * The arithmetic that shapes all of it:
 *
 * ```
 * 27 heroes, all unlocked, identical for every player
 * 12 to defense (two zones of 6) — and those 12 cannot attack
 * up to 3 attack squads drawn from the remaining 15
 *
 *   3 x 6 = 18 > 15   →  overlap between attack squads is FORCED
 * ```
 *
 * That last line is the one to keep in mind. Overlap is not a permitted edge
 * case to be tolerated; it is the ordinary state of a full roster. A rule that
 * treats a hero appearing in two attack squads as a conflict makes the game
 * unplayable, and it would pass every test written with fewer than three squads.
 */

import { getHero, UnknownHeroError } from '@lmntlz/content';
import {
  MAX_ATTACK_SQUADS,
  ROW_CAPACITY,
  SQUAD_ROWS,
  SQUAD_SIZE,
  type SquadRow,
} from '../db/schema/squads.js';

export interface Seat {
  readonly row: SquadRow;
  readonly index: number;
  readonly heroId: string;
}

export interface SquadShape {
  readonly id: string;
  readonly kind: 'defense' | 'offense';
  readonly zone?: 'visible' | 'hidden' | undefined;
  readonly slotIndex?: number | undefined;
  readonly name?: string | undefined;
  readonly seats: readonly Seat[];
}

export type ShapeRejection =
  | 'wrong-size'
  | 'wrong-row-counts'
  | 'duplicate-seat'
  | 'duplicate-hero'
  | 'index-out-of-row'
  | 'unknown-hero';

export class InvalidSquadError extends Error {
  readonly status = 422 as const;
  readonly code: ShapeRejection;
  /** What was wrong, concretely — the route passes this straight to the player. */
  readonly detail: string;

  constructor(code: ShapeRejection, detail: string) {
    super(detail);
    this.name = 'InvalidSquadError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * **Exactly six heroes as 2 front, 3 middle, 1 back** (T006, FR-003).
 *
 * Checked in five separate ways rather than one, because each failure needs a
 * different sentence: "you have five heroes" and "you have three in the back
 * row" are both `422` and are not the same problem to the player.
 */
export function validateSquadShape(seats: readonly Seat[]): void {
  if (seats.length !== SQUAD_SIZE) {
    throw new InvalidSquadError(
      'wrong-size',
      `A squad is exactly ${SQUAD_SIZE} heroes; this one has ${seats.length}.`,
    );
  }

  const positions = new Set<string>();
  const heroes = new Set<string>();
  const perRow: Record<SquadRow, number> = { front: 0, middle: 0, back: 0 };

  for (const seat of seats) {
    const capacity = ROW_CAPACITY[seat.row];
    if (capacity === undefined) {
      throw new InvalidSquadError(
        'wrong-row-counts',
        `"${seat.row}" is not a row. Rows are ${SQUAD_ROWS.join(', ')}.`,
      );
    }

    if (!Number.isInteger(seat.index) || seat.index < 0 || seat.index >= capacity) {
      throw new InvalidSquadError(
        'index-out-of-row',
        `Seat ${seat.index} does not exist in the ${seat.row} row, which holds ${capacity}.`,
      );
    }

    const position = `${seat.row}:${seat.index}`;
    if (positions.has(position)) {
      throw new InvalidSquadError('duplicate-seat', `Two heroes are in ${seat.row} seat ${seat.index}.`);
    }
    positions.add(position);

    if (heroes.has(seat.heroId)) {
      throw new InvalidSquadError(
        'duplicate-hero',
        `${seat.heroId} is in this squad twice. A hero holds one seat per squad.`,
      );
    }
    heroes.add(seat.heroId);

    // A hero id the roster does not have is a client bug or a stale client, and
    // either way it must not reach the database — `hero_id` is deliberately not
    // a foreign key, so this IS the referential check.
    try {
      getHero(seat.heroId);
    } catch (err) {
      if (err instanceof UnknownHeroError) {
        throw new InvalidSquadError('unknown-hero', `There is no hero "${seat.heroId}".`);
      }
      throw err;
    }

    perRow[seat.row] += 1;
  }

  /**
   * **Unreachable today, and kept deliberately.**
   *
   * `ROW_CAPACITY` sums to exactly `SQUAD_SIZE`, so there are precisely six
   * legal positions. Six seats that are all in-bounds and all distinct must
   * therefore occupy every one of them, which forces the counts to 2/3/1 — the
   * checks above already guarantee what this asserts. Enumerated: of all
   * 6-position selections with valid, distinct positions, **zero** have wrong
   * row counts.
   *
   * It stays because it is the check that survives someone changing a capacity.
   * The moment the row widths stop summing to the squad size this becomes live,
   * and a formation bug is not something to discover from a battle.
   */
  for (const row of SQUAD_ROWS) {
    if (perRow[row] !== ROW_CAPACITY[row]) {
      throw new InvalidSquadError(
        'wrong-row-counts',
        `The ${row} row holds ${ROW_CAPACITY[row]}; this squad has ${perRow[row]}.`,
      );
    }
  }
}

/** Every hero id in a squad, in seat order. */
export const heroesOf = (squad: SquadShape): readonly string[] => squad.seats.map((s) => s.heroId);

/**
 * **Every hero committed to defense** — across *both* zones (T007, FR-007).
 *
 * The union, not either zone alone. A rule written against the Visible squad
 * only would pass every test that uses one zone, and the Hidden squad is the
 * one nobody looks at.
 */
export function defendingHeroes(squads: readonly SquadShape[]): ReadonlySet<string> {
  const committed = new Set<string>();
  for (const squad of squads) {
    if (squad.kind !== 'defense') continue;
    for (const seat of squad.seats) committed.add(seat.heroId);
  }
  return committed;
}

/** The 15 (or fewer) heroes that may still be drafted into an attack squad. */
export function availableForOffense(
  allHeroIds: readonly string[],
  squads: readonly SquadShape[],
): readonly string[] {
  const defending = defendingHeroes(squads);
  return allHeroIds.filter((id) => !defending.has(id));
}

export class HeroUnavailableError extends Error {
  readonly status = 409 as const;
  readonly code = 'hero_on_defense' as const;
  readonly heroId: string;
  readonly zone: 'visible' | 'hidden';

  constructor(heroId: string, zone: 'visible' | 'hidden') {
    super(`${heroId} is defending the ${zone} zone and cannot attack.`);
    this.name = 'HeroUnavailableError';
    this.heroId = heroId;
    this.zone = zone;
  }
}

/**
 * **A hero on either defense zone is unavailable to every offense squad, without
 * exception** (T007).
 *
 * Reports the zone, because *"Bramwen cannot attack"* is not actionable and
 * *"Bramwen is defending your Hidden zone"* is — especially for the Hidden
 * squad, which the player is not looking at.
 */
export function assertAvailableForOffense(
  heroIds: readonly string[],
  squads: readonly SquadShape[],
): void {
  const zoneOf = new Map<string, 'visible' | 'hidden'>();
  for (const squad of squads) {
    if (squad.kind !== 'defense' || !squad.zone) continue;
    for (const seat of squad.seats) zoneOf.set(seat.heroId, squad.zone);
  }

  for (const heroId of heroIds) {
    const zone = zoneOf.get(heroId);
    if (zone) throw new HeroUnavailableError(heroId, zone);
  }
}

export interface EvictedSquad {
  readonly id: string;
  readonly slotIndex: number | undefined;
  readonly name: string | undefined;
  /** Seats left after the hero is removed — always `SQUAD_SIZE - 1` here. */
  readonly remaining: number;
  /** Whether it was complete and valid before this move. */
  readonly wasReady: boolean;
}

export interface EvictionImpact {
  readonly heroId: string;
  /** **Every** affected squad. Never truncated, never sampled. */
  readonly squads: readonly EvictedSquad[];
  /** How many heroes remain for offense once this move commits. */
  readonly poolAfter: number;
  readonly squadsNeeded: number;
  readonly squadSize: number;
}

/**
 * What moving `heroId` to defense would break (T008, FR-008).
 *
 * **The result is complete or it is wrong.** Not "the first two", not "and 2
 * others" — every attack squad containing the hero, because truncation is
 * exactly what makes a player discover the third squad mid-battle. The common
 * case is *three*: 18 seats drawn from 15 heroes means a hero commonly sits in
 * all of them, so the plural path is the default and singular is the branch.
 *
 * Returns the impact rather than performing the move. The warning is a
 * confirmation shown **before** anything commits (research.md Q2), and a
 * function that both computed and applied would make that impossible to render.
 */
export function evictionImpact(
  heroId: string,
  squads: readonly SquadShape[],
  rosterSize: number,
): EvictionImpact {
  const affected = squads
    .filter((s) => s.kind === 'offense' && s.seats.some((seat) => seat.heroId === heroId))
    .map<EvictedSquad>((s) => ({
      id: s.id,
      slotIndex: s.slotIndex,
      name: s.name,
      remaining: s.seats.length - 1,
      wasReady: s.seats.length === SQUAD_SIZE,
    }));

  const defendingAfter = new Set(defendingHeroes(squads));
  defendingAfter.add(heroId);

  return {
    heroId,
    squads: affected,
    poolAfter: rosterSize - defendingAfter.size,
    squadsNeeded: MAX_ATTACK_SQUADS,
    squadSize: SQUAD_SIZE,
  };
}
