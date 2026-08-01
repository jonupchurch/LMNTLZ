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

import { getHero, type StatKey } from '@lmntlz/content';
import { AXIS_ROW_OF, HP_PER_TOUGHNESS, ROW_CAPACITY, cappedStat } from '@lmntlz/sim/rules';
import type { BattleState, HeroState, Side, SquadRow } from '@lmntlz/sim/rules';

/**
 * **The rows are `SquadRow`, not a local union.** Spelling the three names out
 * here made `SeatRow` a structurally-identical twin that TypeScript accepted
 * everywhere and that no rename would ever reach.
 */
export type SeatRow = SquadRow;

export interface SnapshotSeat {
  readonly row: SeatRow;
  readonly index: number;
  readonly heroId: string;
  /**
   * What this champion's runes are worth, **frozen into the battle**.
   *
   * ### Why it is in the snapshot rather than read at resolution time
   *
   * The defender is asleep. A battle that looked up live runes would resolve
   * differently depending on when each request arrived, and the same log would
   * replay into a different battle tomorrow — the exact reason the squads are
   * snapshotted at all (Constitution XVI). Buying a rune mid-battle must change
   * your *next* fight, never the one in progress.
   *
   * ### Absent means none, and that is honest for every battle already recorded
   *
   * Runes reached no battle before 019, so every stored snapshot was genuinely
   * fought without them. Defaulting an absent field to `{}` re-derives those
   * battles exactly as they were played rather than retroactively arming them —
   * which a replay would otherwise do, silently, to every past battle at once.
   */
  readonly runes?: RuneLoadout;
}

/**
 * One champion's rune contribution: flat stat points, plus whichever utility
 * effects the player has unlocked across the three slots.
 *
 * **Points are summed across slots before they arrive.** A slot is a purchase
 * boundary, not a combat one — the engine wants one number per stat, and the
 * 75 cap is applied by `effectiveStat` at read time rather than here, so a
 * buff on top of a capped stat behaves identically to one on a bare hero.
 */
export interface RuneLoadout {
  readonly statPoints: Readonly<Partial<Record<StatKey, number>>>;
  /** Utility effect ids, at most one per slot. Order is not significant. */
  readonly utility: readonly string[];
}

/**
 * A base stat plus flat rune points, clamped to the same ceiling
 * `effectiveStat` clamps to.
 *
 * **The constant is imported, never retyped.** `board.ts` has been caught once
 * already holding a literal `50` beside `HP_PER_TOUGHNESS`, where the two
 * agreeing was a coincidence nothing checked — see `hp` below.
 */
/* Was a local copy of the clamp; it now lives beside `effectiveStat` in
   `@lmntlz/sim/rules`, because the roster drawer needs the same reading and three
   copies of "what a 75 means" is exactly the drift this file has been caught in. */

/**
 * 2 front · 3 middle · 1 back, mapped onto the shared axis.
 *
 * **Both of these were local tables until 019, and both were copies.** The axis
 * map is now `AXIS_ROW_OF` in `@lmntlz/sim/rules` — the Codex draws the same
 * axis to teach the reach rule, and two tables that disagree about which
 * direction the numbers run is a diagram that teaches the opposite of what the
 * engine does, silently. `SEAT_COUNT` was a third copy of `ROW_CAPACITY`, which
 * had been sitting in `formation.ts` the whole time; the file's own comment on
 * `cappedStat` already records being caught holding a literal beside an
 * imported constant.
 */
const ROW_OF = AXIS_ROW_OF;
const SEAT_COUNT = ROW_CAPACITY;

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
    /**
     * **The engine's constant, never a copy of it.** This line held a literal
     * `50` alongside `HP_PER_TOUGHNESS` in `sim/rules`, and the two agreeing was
     * a coincidence nothing checked. Moving the pacing dial on its own would
     * have started every hero at 6.25x the max HP the engine computed —
     * `pooledHpShare` above 1, healing capped at a negative headroom, and
     * battles *longer* rather than shorter. Nothing would have thrown.
     *
     * ### Toughness runes have to land BEFORE `maxHp`, not after
     *
     * `maxHp` is `Toughness × 50` and it is computed once, here — nothing
     * downstream recomputes it. So a Toughness rune applied only through
     * `statMods` would raise the stat everywhere it is *read* and leave the
     * hero's health bar at the bare value: a champion with +35 Toughness
     * fighting on 1,000 HP instead of 2,750, with nothing anywhere reporting a
     * problem. It is the one stat whose rune has to be resolved eagerly.
     *
     * Capped exactly as `effectiveStat` caps, because the two must agree about
     * what a 75 means.
     */
    const toughness = cappedStat(hero.stats.toughness, seat.runes?.statPoints.toughness ?? 0);
    const hp = toughness * HP_PER_TOUGHNESS;

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
      /**
       * **The rune points, as flat modifiers** — which is what `statMods` is
       * for, and what `reachMod`'s own comment (*"e.g. +1 from a reach rune"*)
       * has been waiting for since the engine was written. It was `{}` for
       * every battle ever fought, so a completed 650-shard rune changed
       * precisely nothing in combat.
       *
       * The 75 cap is **not** applied here on purpose: `effectiveStat` clamps
       * at read time, so a champion at the cap and a champion pushed past it by
       * a rune respond identically to a debuff — which is the behaviour
       * `01-stats.md` describes ("anything past it is ignored", not "cannot be
       * granted").
       */
      statMods: { ...(seat.runes?.statPoints ?? {}) },
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
