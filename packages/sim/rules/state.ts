/**
 * The battle state every rule reads, and the row axis everything else derives
 * from.
 *
 * **Nothing in this package mutates the state it is given.** Every field is
 * `readonly`, and every rule is a function from state to a value. That is not
 * style — it is what makes `determinism.test.ts` able to evaluate the same state
 * a thousand times and demand byte-identical answers.
 */

import type { Hero } from '@lmntlz/content';

// ---------------------------------------------------------------------------
// The absolute row axis  (T006)
// ---------------------------------------------------------------------------

/**
 * One shared 1–6 axis, and **getting its direction backwards inverts every reach
 * test while still looking plausible** — which is why it is written down once,
 * here, and never re-derived.
 *
 * ```
 *   attacker                          defender
 *   1        2        3     |     4        5        6
 *   back    middle   front  |   front    middle    back
 *   <------ away ---------- | ---------- away ------>
 * ```
 *
 * The numbering **ascends toward the enemy for the attacker and away from the
 * enemy for the defender.** So row 3 and row 4 are the two front lines facing
 * each other, and rows 1 and 6 are the two back seats — the furthest apart on
 * the board.
 *
 * A squad's 2 front · 3 middle · 1 back formation maps as:
 *   attacker — 2 heroes in row 3, 3 in row 2, 1 in row 1
 *   defender — 2 heroes in row 4, 3 in row 5, 1 in row 6
 *
 * That last paragraph is **executable, in `formation.ts` as `AXIS_ROW_OF`**.
 * It was prose here and a private table in `apps/api` until 019; anything that
 * needs the mapping imports it rather than reading this comment.
 */
export type Row = 1 | 2 | 3 | 4 | 5 | 6;

export type Side = 'attacker' | 'defender';

export const ATTACKER_ROWS: readonly Row[] = Object.freeze([1, 2, 3]);
export const DEFENDER_ROWS: readonly Row[] = Object.freeze([4, 5, 6]);
export const ALL_ROWS: readonly Row[] = Object.freeze([1, 2, 3, 4, 5, 6]);

export function sideOfRow(row: Row): Side {
  return row <= 3 ? 'attacker' : 'defender';
}

/** The front line of a side — the two rows that face each other across the gap. */
export function frontRowOf(side: Side): Row {
  return side === 'attacker' ? 3 : 4;
}

export function isRow(value: number): value is Row {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

// ---------------------------------------------------------------------------
// Heroes on the board
// ---------------------------------------------------------------------------

export interface StatusInstance {
  readonly kind: string;
  readonly turnsRemaining: number;
  readonly potency: number;
  readonly sourceInstanceId: string;
}

export interface HeroState {
  readonly heroId: string;
  /** Unique on the board. Two copies of the same hero are two instances. */
  readonly instanceId: string;
  readonly side: Side;
  readonly row: Row;
  /** **0 means it has LEFT the board** (FR-029) — not "is at zero and still there". */
  readonly hp: number;
  /** `Toughness × 50` (FR-016). */
  readonly maxHp: number;
  /** 0..<100. Internal (FR-014) — consumers get `turnQueue`, never this. */
  readonly accumulator: number;
  /** powerId -> turns remaining. */
  readonly cooldowns: Readonly<Record<string, number>>;
  readonly statuses: readonly StatusInstance[];
  /** **FLAT points, including Speed** (FR-015). Never percentages. */
  readonly statMods: Readonly<Partial<Record<keyof Hero['stats'], number>>>;
  /** e.g. +1 from a reach rune. `inReach` is never bounded by a constant. */
  readonly reachMod: number;
}

export interface BattleState {
  readonly heroes: readonly HeroState[];
  /** Counts toward the 300 cap (FR-031). */
  readonly heroTurn: number;
  readonly turnOfInstance: string | null;
  readonly engineVersion: string;
  readonly contentVersion: string;
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

export class UnknownInstanceError extends Error {
  constructor(instanceId: string) {
    super(`no hero instance "${instanceId}" on the board`);
    this.name = 'UnknownInstanceError';
  }
}

export function heroStateOf(state: BattleState, instanceId: string): HeroState {
  const found = state.heroes.find((h) => h.instanceId === instanceId);
  if (!found) throw new UnknownInstanceError(instanceId);
  return found;
}

/** **A hero at 0 HP has left the board.** It is not standing, not targetable. */
export function isStanding(hero: HeroState): boolean {
  return hero.hp > 0;
}

export function standingHeroes(state: BattleState): readonly HeroState[] {
  return state.heroes.filter(isStanding);
}

export function standingOnSide(state: BattleState, side: Side): readonly HeroState[] {
  return state.heroes.filter((h) => h.side === side && isStanding(h));
}

/**
 * **A row holding only fallen heroes is empty** (FR-029).
 *
 * This is the rule that makes reach open up as a battle wears on: the line
 * collapsing is what hands the back seat a job.
 */
export function isRowOccupied(state: BattleState, row: Row): boolean {
  return state.heroes.some((h) => h.row === row && isStanding(h));
}

/**
 * `01-stats.md`: **"Every stat is capped at 75. Anything past it is ignored."**
 *
 * The cap is a game rule, not a schema detail. Content enforces it on *authored*
 * values; this enforces it on the sum of authored plus modifications, which is
 * the only place a stat can actually exceed it during play.
 *
 * Three settled consequences rest on it holding here: overcapping is waste, so
 * gear must be spread rather than piled; mitigation alone never exceeds 50%
 * reduction, because `E` is bounded by the cap and `K` is also 75; and
 * Penetration 75 against Armor 75 gives ×1.00 rather than an amplification.
 */
export const STAT_CAP = 75;

/**
 * A stat after flat modifications, floored at 0 and **capped at 75**.
 *
 * Modifications are **flat points, including Speed** (FR-015). The turn-order
 * accumulator's base constant of 50 already normalizes Speed, so a percentage
 * would hand the fastest hero the largest absolute gain — the opposite of what
 * a buff of a fixed size should do.
 */
export function effectiveStat(
  hero: HeroState,
  base: Readonly<Hero['stats']>,
  key: keyof Hero['stats'],
): number {
  return cappedStat(base[key], hero.statMods[key] ?? 0);
}

/**
 * `base + points`, floored at 0 and capped at 75 — **the clamp on its own**.
 *
 * Extracted because three callers need it and only one of them has a `HeroState`.
 * `effectiveStat` is the battle-time reading (authored stats plus buffs and debuffs);
 * `board.ts` applies it to rune allocations when it builds `maxHp`; and the roster
 * drawer shows a player what their runes actually bought, which happens nowhere near a
 * battle.
 *
 * **All three must agree about what a 75 means**, and `board.ts` has already been
 * caught once holding its own copy of a constant that matched by coincidence. A screen
 * that showed Toughness 80 while the engine fought at 75 would make the cap look like
 * a display bug rather than the rule that makes overcapping waste — which is the whole
 * reason gear has to be spread rather than piled.
 */
export function cappedStat(base: number, points: number): number {
  const raw = base + points;
  return raw < 0 ? 0 : raw > STAT_CAP ? STAT_CAP : raw;
}
