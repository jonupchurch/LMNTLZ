/**
 * The squad formation — **2 front, 3 middle, 1 back**, and what makes a set of
 * seats legal.
 *
 * ### Why this is in `rules` and not in the API
 *
 * The squad builder has to tell a player *"the middle row is full"* while they
 * are dragging, which means the check runs on every pointer move. Three ways to
 * get that wrong:
 *
 * - **An endpoint per placement.** A network round trip to answer a question
 *   about six items already in memory.
 * - **A copy in the client.** Two implementations of one rule, and the day they
 *   disagree the client says a squad is fine and the server rejects it, with the
 *   player looking at a valid-looking squad and an error.
 * - **No local check at all.** Feedback only on save, which is the one moment a
 *   player has stopped thinking about placement.
 *
 * So it lives here: pure, no RNG, no server state, imported directly by both
 * halves. `apps/api` wraps it in the `422`; the client renders it inline. **One
 * implementation, two presentations** — which is the whole reason `rules` is a
 * separate subtree from `resolver`.
 */

import { getHero, UnknownHeroError } from '@lmntlz/content';

export const SQUAD_ROWS = ['front', 'middle', 'back'] as const;
export type SquadRow = (typeof SQUAD_ROWS)[number];

/** Seats per row. **Sums to `SQUAD_SIZE`, and several things rely on that.** */
export const ROW_CAPACITY: Readonly<Record<SquadRow, number>> = Object.freeze({
  front: 2,
  middle: 3,
  back: 1,
});

export const SQUAD_SIZE = 6;

export interface Seat {
  readonly row: SquadRow;
  readonly index: number;
  readonly heroId: string;
}

export type FormationFaultCode =
  | 'wrong-size'
  | 'wrong-row-counts'
  | 'duplicate-seat'
  | 'duplicate-hero'
  | 'index-out-of-row'
  | 'unknown-row'
  | 'unknown-hero';

export interface FormationFault {
  readonly code: FormationFaultCode;
  /** A sentence for the player. The API sends it; the builder renders it. */
  readonly detail: string;
  /** Which seat, when the fault is about one. */
  readonly seatIndex?: number;
  readonly heroId?: string;
}

const isRow = (value: string): value is SquadRow => (SQUAD_ROWS as readonly string[]).includes(value);

/**
 * **Returns the fault rather than throwing**, because the builder's normal state
 * is invalid — a squad under construction has fewer than six heroes almost all
 * the time, and an exception is the wrong shape for something that happens on
 * every drag.
 *
 * `null` means legal.
 */
export function validateFormation(seats: readonly Seat[]): FormationFault | null {
  if (seats.length !== SQUAD_SIZE) {
    return {
      code: 'wrong-size',
      detail: `A squad is exactly ${SQUAD_SIZE} champions; this one has ${seats.length}.`,
    };
  }

  const positions = new Set<string>();
  const heroes = new Set<string>();
  const perRow: Record<SquadRow, number> = { front: 0, middle: 0, back: 0 };

  for (const [seatIndex, seat] of seats.entries()) {
    if (!isRow(seat.row)) {
      return {
        code: 'unknown-row',
        detail: `"${seat.row}" is not a row. Rows are ${SQUAD_ROWS.join(', ')}.`,
        seatIndex,
      };
    }

    const capacity = ROW_CAPACITY[seat.row];
    if (!Number.isInteger(seat.index) || seat.index < 0 || seat.index >= capacity) {
      return {
        code: 'index-out-of-row',
        detail: `Seat ${seat.index} does not exist in the ${seat.row} row, which holds ${capacity}.`,
        seatIndex,
      };
    }

    const position = `${seat.row}:${seat.index}`;
    if (positions.has(position)) {
      return {
        code: 'duplicate-seat',
        detail: `Two champions are in ${seat.row} seat ${seat.index}.`,
        seatIndex,
      };
    }
    positions.add(position);

    if (heroes.has(seat.heroId)) {
      return {
        code: 'duplicate-hero',
        detail: `${seat.heroId} is in this squad twice. A champion holds one seat per squad.`,
        seatIndex,
        heroId: seat.heroId,
      };
    }
    heroes.add(seat.heroId);

    // `hero_id` is deliberately not a foreign key — the roster is generated
    // content in a package, not a table — so this IS the referential check.
    try {
      getHero(seat.heroId);
    } catch (err) {
      if (err instanceof UnknownHeroError) {
        return {
          code: 'unknown-hero',
          detail: `There is no champion "${seat.heroId}".`,
          seatIndex,
          heroId: seat.heroId,
        };
      }
      throw err;
    }

    perRow[seat.row] += 1;
  }

  /**
   * **Unreachable today, and kept deliberately.**
   *
   * `ROW_CAPACITY` sums to exactly `SQUAD_SIZE`, so there are precisely six
   * legal positions — six seats that are all in-bounds and all distinct must
   * occupy every one of them, which forces 2/3/1. Enumerated in the test: of all
   * 6-position selections with valid, distinct positions, **zero** have wrong
   * row counts.
   *
   * It stays because it is the check that survives someone changing a capacity,
   * and a formation bug is not a thing to discover from a battle.
   */
  for (const row of SQUAD_ROWS) {
    if (perRow[row] !== ROW_CAPACITY[row]) {
      return {
        code: 'wrong-row-counts',
        detail: `The ${row} row holds ${ROW_CAPACITY[row]}; this squad has ${perRow[row]}.`,
      };
    }
  }

  return null;
}

/**
 * **A power ranking is a permutation of 0–5, and nothing else.**
 *
 * Checked as a permutation rather than by length: `[0,1,2,3,4,4]` is six entries
 * all in range, and it leaves one power unreachable and another ranked twice.
 * The engine would resolve it into *something* — silently, and there is no
 * outcome that is right.
 */
export function isPowerRanking(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== SQUAD_SIZE) return false;
  const seen = new Set<number>();
  for (const n of value) {
    if (!Number.isInteger(n) || n < 0 || n >= SQUAD_SIZE || seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

/** Which seats a row still has free, for the builder's drop targets. */
export function freeSeatsInRow(row: SquadRow, seats: readonly Seat[]): number[] {
  const taken = new Set(seats.filter((s) => s.row === row).map((s) => s.index));
  return Array.from({ length: ROW_CAPACITY[row] }, (_, i) => i).filter((i) => !taken.has(i));
}
