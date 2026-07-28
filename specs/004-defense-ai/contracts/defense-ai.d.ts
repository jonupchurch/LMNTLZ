/**
 * Feature 004 — the engine plays EVERY defense squad.
 *
 * Two homes, and the split is load-bearing:
 *
 *   @lmntlz/sim/rules   firingProfile   — pure, shared, needed CLIENT-SIDE by the
 *                                         squad builder (feature 006 FR-018)
 *   @lmntlz/sim/ai      everything else — server only, because it makes CHOICES
 *
 * A firing profile is not a choice. It is arithmetic over the cooldown ladder —
 * a pure function of (hero, ranking) with no randomness and no server state.
 * Putting it in `ai/` would force an endpoint and a round trip on every drag of a
 * ranking widget. See plan.md.
 */

import type { Hero, Role } from '@lmntlz/content';
import type { BattleState, Row } from '@lmntlz/sim/rules';
import type { Seed } from '@lmntlz/sim/resolver';

// ===========================================================================
// @lmntlz/sim/rules — pure, shared, client-safe
// ===========================================================================

/** Highest priority first. Six tier indices, each exactly once. */
export type PowerRanking = readonly [number, number, number, number, number, number];

export interface FiringProfileEntry {
  readonly tier: number;
  readonly powerId: string;
  /** Times it fires across the horizon. ZERO means the ranking has silently
   *  switched this power off — the case FR-018 exists to surface. */
  readonly fires: number;
  readonly share: number;          // fires / turns
}

/**
 * Which powers actually fire under a chosen ranking.
 *
 * SIMULATES. The naive closed form `1/(cooldown+1)` is correct ONLY for the
 * top-ranked power and badly wrong below it — a power's share is its availability
 * IN THE GAPS everything above it leaves. See research.md Q2.
 *
 * Uses the engine's own cooldown-tick semantics, imported from `rules`, not
 * reimplemented — which is how SC-003's agreement requirement is met by
 * construction rather than by two implementations staying in step.
 *
 * @param turns Horizon. DEFAULTS TO 9 — a hero takes ~8.5 turns in a real 6v6.
 *              The characterisation sweep passes 60 for continuity with the
 *              recorded analysis and reports both. A 60-turn profile does not
 *              describe a game anyone plays (research.md Finding 3).
 */
export function firingProfile(
  hero: Hero,
  ranking: PowerRanking,
  turns?: number,
): readonly FiringProfileEntry[];

/** The rank-1 closed form. EXACT, verified over 27 heroes x 120 orderings.
 *  Exists as the TEST for `firingProfile`, not as a faster path. */
export function rankOneFiringCount(cooldown: number, gateTurn: number, turns: number): number;

// ===========================================================================
// @lmntlz/sim/ai — server only
// ===========================================================================

export type TargetRule =
  // by role
  | 'strikers-first' | 'tanks-first' | 'ranged-first' | 'buffers-first'
  // by state
  | 'lowest-current-hp' | 'highest-current-hp' | 'lowest-hp-percentage'
  | 'most-damaged' | 'highest-might'
  | 'least-mitigation' | 'most-mitigation'
  // by distance — THREE entries, not two. `middle` degrades to `furthest` when
  // fewer than three rows are reachable, which a +1 reach rune makes possible.
  | 'nearest' | 'middle' | 'furthest'
  // the optimizer, available as a stated plan rather than only as tiebreak 3
  | 'best-type-matchup';

export interface SquadMemberConfig {
  /** A pair, in order. A single rule leaves the target undefined 49-80% of the
   *  time, so the fallback is the rule that usually fires. */
  readonly targeting: readonly [primary: TargetRule, fallback: TargetRule];
  readonly ranking: PowerRanking;
  /** Present ONLY when the champion owns a friendly power. A single choice, not a
   *  pair — the ally menu discriminates far better than the enemy one. */
  readonly allyRule?: TargetRule;
}

/**
 * TIEBREAK ORDER, and where the rules/resolver seam falls:
 *   1  primary rule        defender    rules
 *   2  fallback rule       defender    rules
 *   3  best type matchup   engine      rules
 *   4  nearest row         defender    rules   (indirectly, via placement)
 *   5  seeded random       engine      RESOLVER
 *
 * So the client can preview which champions are legal targets and which one the
 * configuration prefers, and cannot always predict which is struck.
 *
 * `candidates` ARRIVES ALREADY FILTERED by stages 1-3 (reach, filters,
 * compulsion). This function SORTS. It never filters. That signature choice is
 * what makes FR-009 unbreakable: the function is structurally incapable of
 * returning "no target" when one was passed in.
 *
 * A TAUNT BEATS A PRIORITY, ALWAYS — compulsion is stage 3 and resolves before
 * this is called at all.
 */
export function chooseTarget(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  config: SquadMemberConfig,
  candidates: readonly string[],
): { readonly targetInstanceId: string; readonly drawsConsumed: bigint };

/**
 * Highest-ranked power that is off cooldown AND past its gate.
 *
 * The tier-0 auto-attack has cooldown 0 and no gate, so a legal choice always
 * exists and no fallback rule is needed. Returns `pass` only when NO power the
 * hero owns has a legal target in reach — never as a tactical choice.
 *
 * DOES NOT re-rank to chase a matchup. It could notice a lower-ranked power would
 * be super-effective, and it must not: the ranking is the defender's lever and an
 * optimizer that overrides it collapses every defense toward the same choice.
 * POWER PREFERENCE RESOLVES FIRST, THEN TARGETING — type effectiveness depends on
 * the power, so the power must be known before the target can be scored.
 */
export function choosePower(
  state: BattleState,
  actorInstanceId: string,
  config: SquadMemberConfig,
): { readonly powerId: string } | { readonly pass: true };

/** Friendly selection. Reach applies unchanged — a heal is range-limited exactly
 *  as an attack is. Taunt and fade do NOT apply, being properties of enemy
 *  targeting, so this is stage 1 and stage 4 only. */
export function chooseAlly(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  config: SquadMemberConfig,
  candidates: readonly string[],
): { readonly targetInstanceId: string; readonly drawsConsumed: bigint };

/**
 * Applied to a squad saved with no configuration. An unconfigured defense must be
 * COMPETENT, not incoherent — randomness is a tiebreak of last resort, never a
 * default strategy.
 *
 * Rankings are drawn from the universally safe set, so no default can ever
 * silently switch a power off. THE ROLE->ORDERING MAPPING IS A PROPOSAL; the
 * safety is measured. Re-derive after the hero-numbers pass: a one-point shift in
 * the tier-4/5 ladder wipes the safe set entirely (research.md Finding 2).
 */
export function roleDefaults(role: Role): SquadMemberConfig;

/** The 12 universally safe orderings, as measured. ALL 12 END IN TIER 0 — that is
 *  the structural rule, and it is provable: a power fires only when everything
 *  above it is on cooldown, and tier 0 never is.
 *
 *  ELEVEN of twelve end `1·0`. `4·3·2·1·5·0` — the Tank default — ends `5·0`.
 *  `07-defense-ai.md` claims all twelve do; it is wrong by one. */
export function safeOrderings(): readonly PowerRanking[];

/** Is this ranking safe for this hero at this horizon? Powers the squad builder's
 *  warning. Pass the horizon the PLAYER experiences, not 60. */
export function isSafeOrdering(hero: Hero, ranking: PowerRanking, turns?: number): boolean;
