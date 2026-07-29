/**
 * The five-phase turn (FR-023 … FR-028).
 *
 *   Upkeep · Attack · Defense · Additional effects · Resolution
 *
 * **Resolution is unconditional.** A hero that lost its turn to crowd control
 * skips phases 2–4 and still reaches 5, so its cooldowns still tick. Skipping
 * Resolution too would make a stun that lasts one turn actually cost two.
 */

import { getHero, type Power } from '@lmntlz/content';
import { heroStateOf, type BattleState, type HeroState } from './state.js';

export type Phase = 'upkeep' | 'attack' | 'defense' | 'effects' | 'resolution';

export const PHASE_ORDER: readonly Phase[] = Object.freeze([
  'upkeep',
  'attack',
  'defense',
  'effects',
  'resolution',
]);

/**
 * The fixed order within *Additional effects* (FR-027, FR-028).
 *
 * Fixed rather than emergent because every one of these can kill, and the order
 * decides who is still standing to act. **A reaction cannot trigger a reaction**
 * — that is what bounds the phase.
 */
export const EFFECT_ORDER = Object.freeze([
  'riders',
  'on-hit-triggers',
  'reactions',
  'attacker-self-effects',
  'second-death-check',
] as const);

export type EffectStep = (typeof EFFECT_ORDER)[number];

const CROWD_CONTROL = new Set(['stun', 'freeze', 'petrify', 'sleep']);

export function isIncapacitated(hero: HeroState): boolean {
  return hero.statuses.some((s) => CROWD_CONTROL.has(s.kind) && s.turnsRemaining > 0);
}

/**
 * Which phases a hero actually runs this turn (FR-025, FR-026).
 *
 * Three rules, and the exceptions are as load-bearing as the order:
 *
 * - **Death during upkeep is the only early termination.** A poison that kills
 *   in upkeep ends the turn; nothing else does.
 * - **Crowd control skips 2–4 but never 5.**
 * - **A power dealing neither damage nor healing skips Defense** — there is no
 *   contest to run. `03-powers.md` names the three.
 */
export function phasesFor(
  hero: HeroState,
  options: { readonly diesInUpkeep?: boolean; readonly power?: Power } = {},
): readonly Phase[] {
  if (options.diesInUpkeep) return ['upkeep'];

  if (isIncapacitated(hero)) return ['upkeep', 'resolution'];

  if (options.power && options.power.multiplier === null) {
    return ['upkeep', 'attack', 'effects', 'resolution'];
  }

  return PHASE_ORDER;
}

/**
 * Cooldowns after Resolution — integer turns, ticking **unconditionally**
 * (FR-024, FR-025).
 *
 * Called for every hero that reached Resolution, including one that was stunned
 * through its whole turn.
 */
export function cooldownsAfterResolution(
  state: BattleState,
  instanceId: string,
): Readonly<Record<string, number>> {
  const hero = heroStateOf(state, instanceId);
  const next: Record<string, number> = {};

  for (const [powerId, remaining] of Object.entries(hero.cooldowns)) {
    const ticked = remaining - 1;
    if (ticked > 0) next[powerId] = ticked;
  }

  return Object.freeze(next);
}

/** `04-turns.md`: tier 4 opens at turn 3, tier 5 at turn 5, everything else at 1. */
export function gateTurnFor(tier: number): number {
  return tier === 4 ? 3 : tier === 5 ? 5 : 1;
}

/**
 * Off cooldown **and** past its gate.
 *
 * The gate is why a battle does not open with two tier-5s. It is counted in
 * *battle* turns, not the hero's own — a slow hero does not get its tier 5
 * later than a fast one, it just gets fewer turns before then.
 */
export function availablePowers(state: BattleState, instanceId: string): readonly Power[] {
  const hero = heroStateOf(state, instanceId);
  const turn = state.heroTurn;

  return getHero(hero.heroId).powers.filter(
    (power) => (hero.cooldowns[power.id] ?? 0) <= 0 && turn >= gateTurnFor(power.tier),
  );
}
