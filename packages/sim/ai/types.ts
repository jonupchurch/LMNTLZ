/**
 * The two-list surface a defender configures, and nothing else.
 *
 * A `SquadMemberConfig` is the whole of a player's control over how the engine
 * plays one hero: **a targeting pair and a power ranking**, plus an ally rule for
 * the champions that own a friendly power. Deliberately small — `07-defense-ai.md`
 * rejects opening scripts because a ranking governs every turn from one setting
 * while a three-power script configures about a third of a hero's fight and then
 * runs out.
 */

import type { Hero } from '@lmntlz/content';
import type { PowerRanking } from '../rules/firingProfile.js';

/**
 * Re-exported from `rules`, **not defined here**.
 *
 * `firingProfile` takes a ranking and lives in `rules` because the client needs
 * it. `rules` cannot import from `ai` — the dependency runs the other way and
 * the purity test enforces it — so the type belongs upstream and this is the
 * server-side surface for it.
 */
export type { PowerRanking };

/**
 * How a defender says who to hit.
 *
 * **Every rule sorts; none filters** (FR-009). That is what makes "the AI had no
 * legal target" unreachable: a preference cannot empty a set, so the worst a bad
 * rule can do is pick badly.
 */
export type TargetRule =
  // --- by role -------------------------------------------------------------
  | 'strikers-first'
  | 'tanks-first'
  | 'ranged-first'
  | 'buffers-first'
  // --- by state ------------------------------------------------------------
  | 'lowest-current-hp'
  | 'highest-current-hp'
  | 'lowest-hp-percentage'
  | 'most-damaged'
  | 'highest-might'
  | 'least-mitigation'
  | 'most-mitigation'
  // --- by distance ---------------------------------------------------------
  /**
   * **Three entries, not two.** `02-squads.md` derives a two-entry menu from
   * "at base reach a champion sees at most two enemy rows", but the Air rune
   * `Further Than It Looks` grants +1 reach and puts a reach-2 front seat in
   * range of three. `middle` degrades to `furthest` when fewer than three rows
   * are reachable — never to `nearest`, which would invert the instruction.
   */
  | 'nearest'
  | 'middle'
  | 'furthest'
  // --- the optimizer, as a stated plan rather than only as tiebreak 3 -------
  | 'best-type-matchup';

/** Every rule, for exhaustiveness tests and for building the builder's menu. */
export const TARGET_RULES: readonly TargetRule[] = Object.freeze([
  'strikers-first',
  'tanks-first',
  'ranged-first',
  'buffers-first',
  'lowest-current-hp',
  'highest-current-hp',
  'lowest-hp-percentage',
  'most-damaged',
  'highest-might',
  'least-mitigation',
  'most-mitigation',
  'nearest',
  'middle',
  'furthest',
  'best-type-matchup',
]);

export interface SquadMemberConfig {
  /**
   * A pair, in order: primary then fallback.
   *
   * **The fallback is the rule that usually fires.** A single role rule leaves
   * the target undefined 49–80% of the time — *"Buffers first"* finds no Buffer
   * in four turns out of five, because there are 3 Buffers in 27 heroes. A menu
   * that let a player pick one rule would be a menu that mostly did nothing.
   */
  readonly targeting: readonly [primary: TargetRule, fallback: TargetRule];
  readonly ranking: PowerRanking;
  /**
   * Present **only** when the champion owns a friendly power (FR-004).
   *
   * A single choice rather than a pair: the ally menu discriminates far better
   * than the enemy one, because it sorts five allies rather than up to six
   * enemies and *lowest HP percentage* almost always names exactly one.
   *
   * Optional so the interface stays honest about which champions face the
   * decision — `needsAllyRule` is the predicate, and a config carrying an
   * `allyRule` for a champion with no friendly power is a configuration bug
   * that would otherwise sit there looking meaningful.
   */
  readonly allyRule?: TargetRule;
}

/** Does this champion ever face the ally decision? (FR-004, T038) */
export function needsAllyRule(hero: Hero): boolean {
  return hero.powers.some((power) => power.friendly);
}
