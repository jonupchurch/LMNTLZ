/**
 * A squad snapshot becomes a board (007, feeding T018 and T020).
 *
 * ### One shared 1–6 axis, and the direction is the thing to get right
 *
 * ```
 *   attacker                          defender
 *   1        2        3     |     4        5        6
 *   back    middle   front  |   front    middle    back
 * ```
 *
 * The numbering **ascends toward the enemy for the attacker and away from the
 * enemy for the defender**, so rows 3 and 4 are the two front lines facing each
 * other and rows 1 and 6 are the two furthest-apart back seats. Getting the
 * direction backwards inverts every reach test while still looking plausible —
 * which is why `@lmntlz/sim/rules` writes it down once and this file maps onto
 * it rather than restating it.
 *
 * ### Instance ids are positional, and that is deliberate
 *
 * `a-front-0`, `d-middle-2`. Two copies of the same champion are two instances,
 * so an id cannot be the hero id; and a random id would make an action log
 * unreadable and a replay impossible to check by eye. **The seat a hero
 * occupies never changes during a battle**, so its position is a stable name.
 *
 * ### Built from the snapshot, never from the live squad
 *
 * The defender's squad is frozen into the battle row at creation (FR-001). A
 * defender editing their squad mid-battle must not reach a fight already in
 * progress, and the only way to guarantee that is for this function to have no
 * access to anything but the snapshot it is handed.
 */

import { getHero } from '@lmntlz/content';
import type { BattleState, HeroState, Row, Side } from '@lmntlz/sim/rules';

export type SeatRow = 'front' | 'middle' | 'back';

export interface SnapshotSeat {
  readonly row: SeatRow;
  readonly index: number;
  readonly heroId: string;
}

/** 2 front · 3 middle · 1 back, mapped onto the shared axis. */
const ROW_OF: Readonly<Record<Side, Readonly<Record<SeatRow, Row>>>> = Object.freeze({
  attacker: { front: 3, middle: 2, back: 1 },
  defender: { front: 4, middle: 5, back: 6 },
});

const SEAT_COUNT: Readonly<Record<SeatRow, number>> = Object.freeze({
  front: 2,
  middle: 3,
  back: 1,
});

export class MalformedSquadError extends Error {
  constructor(side: Side, detail: string) {
    super(`the ${side} squad snapshot is not a legal formation: ${detail}`);
    this.name = 'MalformedSquadError';
  }
}

export const instanceIdOf = (side: Side, seat: SnapshotSeat): string =>
  `${side === 'attacker' ? 'a' : 'd'}-${seat.row}-${seat.index}`;

/**
 * **Validated here even though feature 006 validated it on the way in.**
 *
 * A snapshot is a `jsonb` column, so nothing between the two enforces a shape,
 * and a malformed one would surface as a battle with five heroes or two heroes
 * in one seat — a fight that is wrong rather than a request that failed. It is
 * cheaper to refuse at creation than to discover mid-battle.
 */
function seatsOf(side: Side, seats: readonly SnapshotSeat[]): HeroState[] {
  const seen = new Set<string>();

  for (const seat of seats) {
    const limit = SEAT_COUNT[seat.row];
    if (limit === undefined) throw new MalformedSquadError(side, `unknown row "${seat.row}"`);
    if (!Number.isInteger(seat.index) || seat.index < 0 || seat.index >= limit) {
      throw new MalformedSquadError(side, `${seat.row} seat ${seat.index} does not exist`);
    }
    const key = `${seat.row}:${seat.index}`;
    if (seen.has(key)) throw new MalformedSquadError(side, `two heroes in ${key}`);
    seen.add(key);
  }

  const expected = SEAT_COUNT.front + SEAT_COUNT.middle + SEAT_COUNT.back;
  if (seats.length !== expected) {
    throw new MalformedSquadError(side, `${seats.length} heroes, expected ${expected}`);
  }

  return seats.map((seat) => {
    const hero = getHero(seat.heroId);
    const hp = hero.stats.toughness * 50;

    return {
      heroId: seat.heroId,
      instanceId: instanceIdOf(side, seat),
      side,
      row: ROW_OF[side][seat.row],
      hp,
      maxHp: hp,
      /**
       * **Zero for everybody, so the opening turn order is Speed alone.** A
       * staggered start would be a hidden advantage nobody could see in the
       * projected turn queue, and the queue is the only thing the player has to
       * plan against.
       */
      accumulator: 0,
      /** Every power available at turn 1 except those behind a tier gate. */
      cooldowns: {},
      statuses: [],
      statMods: {},
      reachMod: 0,
    };
  });
}

export function buildInitialState(
  attacker: readonly SnapshotSeat[],
  defender: readonly SnapshotSeat[],
  versions: { readonly engineVersion: string; readonly contentVersion: string },
): BattleState {
  return {
    heroes: [...seatsOf('attacker', attacker), ...seatsOf('defender', defender)],
    /**
     * **One, not zero.** `gateTurnFor` compares against this, and an off-by-one
     * here would open every battle with a tier-5 available — the exact thing the
     * gates exist to prevent, and it would look like a balance problem rather
     * than an initialisation bug.
     */
    heroTurn: 1,
    turnOfInstance: null,
    engineVersion: versions.engineVersion,
    contentVersion: versions.contentVersion,
  };
}
