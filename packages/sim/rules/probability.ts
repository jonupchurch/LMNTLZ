/**
 * Probabilities — computed, **never resolved** (FR-004, FR-020, FR-021).
 *
 * `CLAUDE.md` writes the accuracy contest as two `rand()` terms and annotates it
 * *"one draw, not two."* This is that fold, in closed form: exact, integer-only,
 * and `O(Na)` with `Na ≤ 112` — cheaper than the two draws it replaces.
 *
 * The fold is what makes FR-004 possible at all. A client can be told *"82%"*
 * without being able to find out whether this particular swing landed, because
 * the number and the outcome are computed in different packages on different
 * machines.
 */

import { getHero } from '@lmntlz/content';
import { cappedStat, effectiveStat, heroStateOf, type BattleState, type HeroState } from './state.js';
import { hitFloorFor, statBonusFor } from './passives.js';

/** FR-020. Applied **after** the fold — see `hitProbability`. */
export const MIN_HIT_PROBABILITY = 0.65;
export const MAX_HIT_PROBABILITY = 0.95;

/** `01-stats.md`: "a hero with Luck 15 rolls 1–22", and 15 × 1.5 = 22.5. */
export const LUCK_DIE_MULTIPLIER = 1.5;

/** The attacker's base edge. Not a tuning knob — see the note at the bottom. */
export const ATTACKER_EDGE = 20;

/**
 * Die size from `Luck`, floored, and **never below 1**.
 *
 * A `Luck` of 0 is not reachable on the authored roster, but the guard costs
 * nothing and its absence costs a division by zero in the middle of a battle.
 */
export function dieSize(luck: number): number {
  return Math.max(1, Math.floor(luck * LUCK_DIE_MULTIPLIER));
}

/**
 * The exact probability that `A > D + m`, where `A ~ U{1..Na}` and
 * `D ~ U{1..Nd}` are independent.
 *
 *   P = (1 / (Na·Nd)) · Σ_{a=1..Na} clamp(a − m − 1, 0, Nd)
 *
 * For each face `a` the attacker can roll, `clamp(a − m − 1, 0, Nd)` counts the
 * defender faces it beats. **Ties go to the defender**, which is the `− 1`.
 *
 * Unclamped on purpose: both callers clamp differently, or not at all.
 */
export function contestProbability(na: number, nd: number, m: number): number {
  let wins = 0;
  for (let a = 1; a <= na; a++) {
    const beaten = a - m - 1;
    wins += beaten <= 0 ? 0 : beaten >= nd ? nd : beaten;
  }
  return wins / (na * nd);
}

const clampProbability = (p: number): number =>
  p < MIN_HIT_PROBABILITY
    ? MIN_HIT_PROBABILITY
    : p > MAX_HIT_PROBABILITY
      ? MAX_HIT_PROBABILITY
      : p;

/**
 * **The `state` argument stopped being decorative** (020 US3).
 *
 * It has been accepted and ignored since 002. `No Ripple` grants Nix `Agility`
 * while nothing has landed on her this battle — a *conditional* stat, held by no
 * status and applied by nothing, so the only place it can be read is where the
 * stat is consumed. This is one of the two such places; the mitigation pair is
 * the other, in `damagePreview`.
 *
 * Every one of these is a pure read of the board. Nothing here draws.
 */
const statOf = (state: BattleState, hero: HeroState, key: 'perception' | 'agility' | 'luck' | 'resolve'): number =>
  cappedStat(effectiveStat(hero, getHero(hero.heroId).stats, key), statBonusFor(state, hero, key));

/**
 * The unclamped probability, exposed because the regression figures in
 * `research.md` Q2 are stated against it and `tools/verify-accuracy.py`
 * reproduces them.
 */
export function unclampedHitProbability(
  state: BattleState,
  attackerInstanceId: string,
  defenderInstanceId: string,
): number {
  const attacker = heroStateOf(state, attackerInstanceId);
  const defender = heroStateOf(state, defenderInstanceId);

  const m =
    statOf(state, defender, 'agility') - statOf(state, attacker, 'perception') - ATTACKER_EDGE;

  return contestProbability(
    dieSize(statOf(state, attacker, 'luck')),
    dieSize(statOf(state, defender, 'luck')),
    m,
  );
}

/**
 * **The clamp is applied after the fold, and the order is load-bearing** (FR-020).
 *
 * Clamping earlier — bounding the stats, or the margin — loses the property that
 * makes runes safe. An `Agility` + `Luck` defender at the 75 cap is a **98.2%
 * miss rate** unclamped: a literal invincibility build. The clamp sees that true
 * probability and refuses it. A clamp applied to the inputs would instead let
 * the build exist and merely slow it down.
 *
 * Reducing `Luck`'s die multiplier is explicitly the **wrong** lever: it
 * compresses rather than shifts, and at ×0.5 it creates 158 pairs that can never
 * hit each other at all.
 *
 * ### ⚠️ The one thing that goes above `MAX_HIT_PROBABILITY` (021, spec A-02)
 *
 * `Held in the Light` reads *"enemies below half HP **cannot dodge** your
 * attacks"*, and 95% is not *cannot*. A floor is therefore applied **after** the
 * clamp, and it is the only route past it.
 *
 * **Why an exception is safe here and an uncapped stat would not be**: the clamp
 * exists because `Agility` + `Luck` at the 75 cap is a 98.2% miss rate — an
 * invincibility build assembled out of stats a player buys. This is a single
 * authored effect with a stated condition, and it moves the number in the
 * direction the clamp already prefers. Nothing a player can stack reaches it.
 *
 * It is also why the catalog's rule is *capability, never magnitude*: "cannot
 * dodge" is a rule about what is possible, and expressing it as +40 `Perception`
 * would be a number that a bigger `Agility` simply out-buys.
 */
export function hitProbability(
  state: BattleState,
  attackerInstanceId: string,
  defenderInstanceId: string,
): number {
  const clamped = clampProbability(
    unclampedHitProbability(state, attackerInstanceId, defenderInstanceId),
  );

  const floor = hitFloorFor(
    state,
    heroStateOf(state, attackerInstanceId),
    heroStateOf(state, defenderInstanceId),
  );

  return floor === null ? clamped : Math.max(clamped, floor);
}

/**
 * The same fold with `m = Resolve_d − potency` and **no `+20`** (05-status.md).
 *
 * One implementation; the edge is a parameter. Two implementations of one
 * contest is how they drift.
 *
 * ### ⚠️ It is NOT clamped, and it used to be — corrected 2026-08-01
 *
 * This ran through `clampProbability` for as long as it has existed. Nothing in
 * production called it, so nothing was wrong in a battle; it became wrong the
 * moment the status engine started asking it whether a rider lands.
 *
 * The clamp is `MIN_HIT_PROBABILITY`/`MAX_HIT_PROBABILITY` — named for *hits*,
 * and justified above by a specific accuracy problem: `Agility` + `Luck` runes
 * can build a defender nothing can touch. `Resolve` cannot produce that, and the
 * floor it imposed here was catastrophic to the tier ladder. Measured over all
 * 729 pairs:
 *
 * | tier | potency | unclamped | clamped | `05-status.md` says |
 * |---|---|---|---|---|
 * | 1 | 20 | **31.2%** | 65.0% | 31% |
 * | 2 | 28 | 46.1% | 65.5% | — |
 * | 3 | 36 | 61.5% | 68.9% | — |
 * | 4 | 44 | 75.6% | 77.4% | — |
 * | 5 | 52 | **86.5%** | 86.5% | 87% |
 *
 * Unclamped reproduces the document exactly. Clamped, a tier-1 rider lands more
 * than **twice** as often as designed, and tiers 1–3 collapse into 65.0 / 65.5 /
 * 68.9 — three tiers that are supposed to be visibly different arriving as one.
 * *"Every tier strictly beats the one below"* is the sentence the whole catalog
 * is written against.
 *
 * **And the clamp was never the safety rail it looked like.** At every tier the
 * unclamped contest is deterministic in neither direction — 0 of 729 auto-land
 * and 0 of 729 can-never-land — which is the property `05-status.md` fits the
 * 20–60 potency band to achieve. Runes cannot break it either: raising the
 * target's `Resolve` *or* its `Luck` both push the probability down, so
 * investment by the defender only ever makes a rider harder to land.
 */
export function riderLandProbability(
  state: BattleState,
  sourceInstanceId: string,
  targetInstanceId: string,
  potency: number,
): number {
  const source = heroStateOf(state, sourceInstanceId);
  const target = heroStateOf(state, targetInstanceId);

  const m = statOf(state, target, 'resolve') - potency;

  return contestProbability(
    dieSize(statOf(state, source, 'luck')),
    dieSize(statOf(state, target, 'luck')),
    m,
  );
}

/**
 * `Luck × 0.5` percent, as a fraction (FR-021).
 *
 * **Rolled once per packet, not per target.** A row-hitting power that rolled
 * per head would crit far more often than its Luck says, and the multi-target
 * multipliers are priced against one roll.
 */
export function critChance(state: BattleState, attackerInstanceId: string): number {
  const attacker = heroStateOf(state, attackerInstanceId);
  return (statOf(state, attacker, 'luck') * 0.5) / 100;
}
