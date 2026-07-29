/**
 * Targeting — four ordered stages, and two invariants that make deadlock
 * unreachable (FR-008 … FR-011).
 *
 *   reach → filters → compulsion → choice
 *
 * This module performs the first three and **stops**. Choice belongs to whoever
 * is playing: a person for their own squad, feature 004's ranking for a defense.
 */

import { getHero, type Power } from '@lmntlz/content';
import { heroStateOf, isStanding, type BattleState, type HeroState } from './state.js';
import { inReach } from './reach.js';

export type TargetingStage = 'reach' | 'filter' | 'compulsion' | 'choice';

export interface TargetingResult {
  /**
   * Survivors of stages 1–3, in no meaningful order.
   *
   * **Feature 004 sorts this; it never filters it.** That division is what makes
   * "the AI had no legal target" unreachable — a ranking cannot empty a set.
   */
  readonly candidates: readonly string[];
  /** Set when a compulsion applied. Overrides any preference. */
  readonly compelled: string | null;
  /** Filters that were **ignored** because applying them would have emptied the set. */
  readonly filtersIgnored: readonly string[];
}

/**
 * A restriction on who may be targeted — `fade`, and anything later that behaves
 * like it. Returns the subset it permits.
 */
export interface TargetFilter {
  readonly name: string;
  readonly permits: (candidates: readonly HeroState[], state: BattleState) => readonly HeroState[];
}

/** A compulsion — `taunt`, and anything later that behaves like it. */
export interface Compulsion {
  readonly name: string;
  readonly instanceId: string;
}

const powerOf = (hero: HeroState, powerId: string): Power => {
  const found = getHero(hero.heroId).powers.find((p) => p.id === powerId);
  if (!found) throw new Error(`hero "${hero.heroId}" has no power "${powerId}"`);
  return found;
};

/**
 * Stage 1 — reach, and the **only** place the ally/enemy distinction appears.
 *
 * The power's `friendly` flag selects the pool. **Nothing else about the path
 * differs** (FR-008): a heal is range-limited exactly as an attack is, by the
 * same function, with the same rules about empty rows.
 */
export function poolFor(
  state: BattleState,
  actor: HeroState,
  power: Power,
): readonly HeroState[] {
  const wantSide = power.friendly ? actor.side : actor.side === 'attacker' ? 'defender' : 'attacker';

  return state.heroes.filter(
    (h) =>
      h.side === wantSide &&
      isStanding(h) &&
      // A friendly power may target its own caster; a hostile one obviously not.
      (power.friendly || h.instanceId !== actor.instanceId) &&
      inReach(state, actor.instanceId, h.row),
  );
}

/**
 * The first three stages.
 *
 * Two invariants, and both exist because the alternative is a battle that stops
 * (FR-010):
 *
 * 1. **A filter that would empty the set is ignored**, and recorded in
 *    `filtersIgnored`. Once a faded Buffer is the only thing an attacker can
 *    reach, fade stops applying — otherwise the attacker has a legal move it is
 *    forbidden from making.
 * 2. **A compulsion naming somebody outside the set does not apply.** A taunting
 *    tank two rows out of reach cannot compel anyone; the taunt is simply not in
 *    force for that attacker.
 *
 * Their interaction falls out rather than being special-cased: a compulsion and
 * a restriction naming the same hero **cancel**, because the filter runs first
 * and removes the hero, and then the compulsion finds its target absent.
 */
export function legalTargets(
  state: BattleState,
  actorInstanceId: string,
  powerId: string,
  filters: readonly TargetFilter[] = [],
  compulsion: Compulsion | null = null,
): TargetingResult {
  const actor = heroStateOf(state, actorInstanceId);
  const power = powerOf(actor, powerId);

  let candidates = poolFor(state, actor, power);
  const filtersIgnored: string[] = [];

  for (const filter of filters) {
    const permitted = filter.permits(candidates, state);
    if (permitted.length === 0) {
      filtersIgnored.push(filter.name);
      continue;
    }
    candidates = permitted;
  }

  const compelled =
    compulsion && candidates.some((c) => c.instanceId === compulsion.instanceId)
      ? compulsion.instanceId
      : null;

  return {
    candidates: candidates.map((c) => c.instanceId),
    compelled,
    filtersIgnored,
  };
}

/**
 * True when **no** power the hero owns has a legal target (FR-011).
 *
 * It passes. It does not stall, and it does not get skipped — a hero with
 * nothing to do still reaches Resolution, so its cooldowns still tick.
 */
export function mustPass(
  state: BattleState,
  actorInstanceId: string,
  filters: readonly TargetFilter[] = [],
  compulsion: Compulsion | null = null,
): boolean {
  const actor = heroStateOf(state, actorInstanceId);

  return getHero(actor.heroId).powers.every(
    (power) => legalTargets(state, actorInstanceId, power.id, filters, compulsion).candidates.length === 0,
  );
}
