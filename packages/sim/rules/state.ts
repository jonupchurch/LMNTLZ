/**
 * The battle state every rule reads, and the row axis everything else derives
 * from.
 *
 * **Nothing in this package mutates the state it is given.** Every field is
 * `readonly`, and every rule is a function from state to a value. That is not
 * style — it is what makes `determinism.test.ts` able to evaluate the same state
 * a thousand times and demand byte-identical answers.
 */

import { getHero, type Hero } from '@lmntlz/content';

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

/**
 * One effect sitting on one hero (020).
 *
 * **Widened from four fields to eight, and `kind` stopped being a `string`.** The
 * original shape could say *that* something was there and nothing about what it
 * did — no magnitude, no stat, no snapshot. An untyped `kind` also meant a typo
 * produced a silently inert effect, which is the exact failure this feature exists
 * to end.
 *
 * `potency` is gone: it is the *contest* value, spent deciding whether the effect
 * lands, and carries no meaning afterwards. Keeping it on the landed instance
 * invited reading it as a magnitude.
 *
 * The catalog, the magnitudes and the transitions live in `status.ts`. This is
 * only the shape, because `state.ts` is what every other rule imports and a cycle
 * through the catalog would be gratuitous.
 */
export interface StatusInstance {
  /** A `StatusKind` from `status.ts`. Typed there; kept structural here to avoid a cycle. */
  readonly kind:
    | 'burn'
    | 'bleed'
    | 'poison'
    | 'buff'
    | 'debuff'
    | 'shred'
    | 'shield'
    | 'taunt'
    | 'fade'
    | 'stun'
    | 'silence'
    | 'mark'
    | 'reach';
  /** `Infinity` for a `Wears Through` shred — see `PERMANENT` in `status.ts`. */
  readonly turnsRemaining: number;
  /**
   * **Fixed at application and never recalculated.** Points for a stat change, a
   * fraction for a shred, absorbed HP for a shield, per-tick damage for a
   * damage-over-time effect.
   *
   * Snapshotting is what lets the applier die, be buffed or be debuffed without
   * changing the effect — a damage-over-time effect is a packet that pays out
   * across several turns, so it needs no fallback rule for a dead applier.
   */
  readonly magnitude: number;
  /** Named for the stat-modifier and shred families; `null` for every other kind. */
  readonly stat: keyof Hero['stats'] | null;
  readonly sourceInstanceId: string;
  /**
   * **Part of the identity, not provenance.** *The same source refreshes* is keyed
   * on (instance, power, kind); the instance alone would make two different powers
   * on one hero refresh each other.
   */
  readonly sourcePowerId: string;
  /** `0` flat; `0.5` for a Fire-House burn, which grows 50% of base per tick. */
  readonly escalation: number;
  /** Ticks already dealt. Drives escalation, and survives a duration extension. */
  readonly ticksDealt: number;
  /** `false` for Ember Saelith's burns and Umbriel's debuffs. They still expire. */
  readonly cleansable: boolean;
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
  return cappedStat(base[key], (hero.statMods[key] ?? 0) + statusPoints(hero, key));
}

/**
 * **Why the status contribution is summed here and not stored in `statMods`.**
 *
 * `statMods` is the *permanent* layer: `board.ts` writes a player's rune
 * allocations into it, and they last the whole battle. A buff written into the
 * same record would be indistinguishable from a rune — so expiring a 2-turn
 * `+10 Might` would subtract 10 from a bag that also holds a rune's 10, and the
 * player would silently lose what they paid for. It would only ever affect
 * players who own runes, and no test that existed before 020 would have seen it.
 *
 * Reading the temporary layer off `hero.statuses` instead makes expiry correct by
 * construction: dropping the status *is* the whole operation. Two writers to one
 * field is the failure mode being avoided.
 *
 * **Defined here rather than in `status.ts`, and re-exported from there.** This
 * module is the one every other rule imports, so owning the function here avoids
 * a value-level cycle. `status.ts` re-exports it so a reader finds it where they
 * expect — one implementation, two names for the same thing.
 */
export function statusPoints(hero: HeroState, key: keyof Hero['stats']): number {
  let total = 0;

  for (const s of hero.statuses) {
    if (s.stat !== key) continue;
    if (s.kind === 'buff') total += s.magnitude;
    else if (s.kind === 'debuff') total -= s.magnitude;
  }

  return total;
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

/**
 * `maxHp = Toughness × 8` (FR-016).
 *
 * **This constant is the game's pacing dial, and it was 50 until it was
 * measured.** At 50 the median battle ran **299 hero-turns into a 300-turn cap**
 * — 62% of battles never reached a wipe at all and were decided on pooled HP
 * share — while a typical hit took **3.8%** off a health bar and 90% of every
 * hit in the game landed under 10%. The hardest hit the roster could produce,
 * anywhere, was 28.7%.
 *
 * At 8, over 600 auto-played battles with both sides on the shipped AI:
 *
 * | | 50 | 8 |
 * |---|---|---|
 * | hero-turns, median | 299 (the cap) | **49** |
 * | ended on the cap | 62% | **0%** |
 * | normal hit | 3.8% | **26.3%** (p75 44%) |
 * | crit | 8.0% | **45.5%** (p90 100%) |
 * | hits under 10% of a bar | 90% | **10%** |
 *
 * **Nothing about relative balance moves.** Damage and healing are both
 * absolute — `Might × multiplier` — so scaling the pool scales both against it
 * identically, and every matchup ratio the design reasoned about is preserved.
 * That is precisely why this is the lever and `Might` is not: `Might` is capped
 * at 75 and tops out at 45 today, nowhere near the 6× of headroom needed.
 *
 * **The absolute damage numbers are unchanged** — a hit still lands for ~60. It
 * is the health bars that stopped being 1,250–2,000 points long.
 *
 * Two consequences are deliberate rather than overlooked, and both are asserted
 * in tests rather than left as prose: a tier-4 or tier-5 power can now one-shot
 * a full-health hero (`pairings.test.ts`), and a hero acts few enough times that
 * some of its six powers never fire (`firingProfile.ts`, `BATTLE_TURNS`).
 *
 * ### ⚠️ It lives here rather than in `damage.ts`, and that is deliberate
 *
 * The health pool is a property of a hero's **state**, not of the damage
 * pipeline — and three passives need to ask *"is this champion below half?"*
 * from inside `passives.ts`, which `damage.ts` imports. Reading it from there
 * would put a value-level cycle between the two halves of one pipeline, and a
 * cycle on a `const` is a temporal-dead-zone crash rather than a type error.
 *
 * `HeroState.maxHp` is a **snapshot taken when the board was built** and is not
 * the same number: a live `Toughness` buff moves this and never moves that. Every
 * rule asks this function.
 */
export const HP_PER_TOUGHNESS = 8;

export function maxHp(hero: HeroState): number {
  return effectiveStat(hero, getHero(hero.heroId).stats, 'toughness') * HP_PER_TOUGHNESS;
}
