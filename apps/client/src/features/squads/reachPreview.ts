/**
 * What a champion could touch from the seat it is sitting in (019 US2).
 *
 * ### This is not a second copy of the reach rule
 *
 * `SquadBuilder` refused to draw these labels, and the reason it gave was
 * right: writing "row 4 is in range" into a screen would be the reach rule
 * living in two places, correct on the day it was typed and silently wrong
 * afterwards (Constitution XIV).
 *
 * So this does not restate the rule — it **calls it**. `distance()` and
 * `inReach()` come from `@lmntlz/sim/rules`, the same module the server
 * resolves battles with, against a fabricated `BattleState`. If the reach rule
 * changes, these labels change with it, because there is no second
 * implementation to forget.
 *
 * ### The one assumption, and why it is stated on screen
 *
 * Distance counts **occupied** rows crossed, so the answer depends on a board
 * that a squad under construction does not have. This assumes the opening
 * position: **both sides at full six**. That is the honest default — it is the
 * only board state that is true of every battle, it is the worst case for
 * reach, and range only ever opens up from there as heroes fall.
 *
 * `SquadBoard` prints that assumption beside the preview rather than leaving a
 * player to infer it, because a reach-1 champion who "cannot reach row 4" can
 * in fact reach it the moment the enemy front rank dies.
 */

import {
  AXIS,
  AXIS_ROW_OF,
  DEFENDER_ROWS,
  distance,
  inReach,
  type BattleState,
  type HeroState,
  type Row,
  type Seat,
  type SquadRow,
} from '@lmntlz/sim/rules';

/**
 * Squad row → its number on the shared 1–6 axis.
 *
 * The axis is the export's own device: `ROW 1 · BACK`, `ROW 2 · MID`,
 * `ROW 3 · FRONT`, then `ENEMY ROWS 4–6` immediately to the right — so reach
 * becomes a direction you can see rather than a rule you have to hold.
 *
 * **Both of these were written out here**, and between them they restated the
 * whole axis a third and fourth time — `apps/api` held one copy, `BattleBoard`
 * a fifth, and every one of them could have inverted without a test noticing.
 * They read from `AXIS_ROW_OF` now, which is the same table the engine builds
 * its board from.
 */
export const ROW_NUMBER: Readonly<Record<SquadRow, Row>> = AXIS_ROW_OF.attacker;

/** The enemy's mirror: their front rank is the row nearest the contact line. */
const ENEMY_ROW_LABEL: Readonly<Record<number, { readonly name: string; readonly seats: number }>> =
  Object.freeze(
    Object.fromEntries(
      AXIS.filter((a) => a.side === 'defender').map((a) => [
        a.row,
        { name: a.squadRow, seats: a.seats },
      ]),
    ),
  );

/**
 * The far side at full formation — 2 in row 4, 3 in row 5, 1 in row 6.
 *
 * Expanded from `AXIS` rather than written as `[4, 4, 5, 5, 5, 6]`, which is
 * the formation and the axis restated together in one literal.
 */
const ENEMY_ROWS_AT_FULL: readonly Row[] = Object.freeze(
  AXIS.filter((a) => a.side === 'defender').flatMap((a) =>
    Array.from({ length: a.seats }, () => a.row),
  ),
);

const stand = (heroId: string, instanceId: string, side: HeroState['side'], row: Row): HeroState => ({
  heroId,
  instanceId,
  side,
  row,
  /* Standing is `hp > 0`; the value is irrelevant to occupancy and to reach. */
  hp: 1,
  maxHp: 1,
  accumulator: 0,
  cooldowns: {},
  statuses: [],
  statMods: {},
  reachMod: 0,
  /**
   * **No rune effects, deliberately, and this preview is honest without them.**
   * The only rune that touches reach is Air's `Further Than It Looks`, which rolls
   * at the start of a *battle* turn and lasts that turn. There is nothing for a
   * squad-builder preview to show: the champion's reach outside a battle is its
   * authored reach.
   */
  runeEffects: [],
  hasActed: false,
});

/**
 * The opening position: this squad in rows 1–3, a full enemy six in rows 4–6.
 *
 * The enemy heroes borrow the player's own ids. Nothing reads them — occupancy
 * is all `distance()` asks of the far side — and inventing an opponent would
 * mean choosing one, which is a scouting question this screen has no business
 * answering.
 */
function hypothetical(seats: readonly Seat[]): BattleState {
  const mine = seats.map((seat) =>
    stand(seat.heroId, `a-${seat.row}-${seat.index}`, 'attacker', ROW_NUMBER[seat.row]),
  );

  const filler = seats[0]?.heroId;
  const theirs: HeroState[] =
    filler === undefined
      ? []
      : ENEMY_ROWS_AT_FULL.map((row, index) =>
          stand(filler, `b-${row}-${index}`, 'defender', row),
        );

  return {
    heroes: [...mine, ...theirs],
    heroTurn: 1,
    turnOfInstance: null,
    engineVersion: '',
    contentVersion: '',
  };
}

export interface SeatReach {
  /** Enemy rows this seat can touch at the opening position. */
  readonly enemyRows: readonly Row[];
  /** Own rows it can touch — what a healer or a shield can actually cover. */
  readonly ownRows: readonly Row[];
}

/**
 * `HITS ROW 4` / `OWN ROWS 2,3 ONLY` — the caption under a seated champion.
 *
 * Reach is one rule for enemies and allies alike, so a seat that reaches
 * nobody across the line still reaches somebody on its own; saying only
 * "cannot attack" would read as "does nothing", which is wrong for every
 * support in the game.
 */
export function seatReach(seats: readonly Seat[], seat: Seat): SeatReach {
  const state = hypothetical(seats);
  const id = `a-${seat.row}-${seat.index}`;
  const own: Row[] = [];
  const enemy: Row[] = [];

  for (const row of [1, 2, 3, 4, 5, 6] as const) {
    if (!inReach(state, id, row)) continue;
    if (row <= 3) own.push(row);
    else enemy.push(row);
  }

  return { enemyRows: enemy, ownRows: own };
}

export interface EnemyRowReach {
  readonly row: Row;
  readonly name: string;
  readonly seats: number;
  /** How many of the seated squad can touch this row on turn one. */
  readonly reachers: number;
}

/** One entry per enemy row, for the reachability preview beside the board. */
export function enemyReach(seats: readonly Seat[]): readonly EnemyRowReach[] {
  const state = hypothetical(seats);

  return DEFENDER_ROWS.map((row) => {
    const meta = ENEMY_ROW_LABEL[row]!;
    const reachers = seats.filter((seat) =>
      inReach(state, `a-${seat.row}-${seat.index}`, row),
    ).length;
    return { row, name: meta.name, seats: meta.seats, reachers };
  });
}

/**
 * Occupied rows between a seat and an enemy row, exported for tests.
 *
 * Not used by the UI — it is here so a test can assert the board's numbers
 * against the engine's own arithmetic rather than against a second expectation
 * typed out by hand.
 */
export function seatDistance(seats: readonly Seat[], from: SquadRow, to: Row): number {
  return distance(hypothetical(seats), ROW_NUMBER[from], to);
}
