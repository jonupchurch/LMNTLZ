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
import { CROWD_CONTROL } from './status.js';

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

/**
 * **The set comes from the catalog now, and it used to name four kinds that do not
 * exist.**
 *
 * `freeze`, `petrify` and `sleep` were never in `05-status.md` and no power has
 * ever applied one — they were a guess made when nothing could write a status at
 * all, so nothing could contradict them. Reading `CROWD_CONTROL` from
 * `status.ts` means the list of things that cost a hero its turn has exactly one
 * definition (Constitution XIII).
 *
 * **`silence` is deliberately not in it.** A silenced hero loses its *powers*, not
 * its turn — the tier-0 auto-attack still works — so it must not skip phases 2–4.
 */
export function isIncapacitated(hero: HeroState): boolean {
  return hero.statuses.some(
    (s) => CROWD_CONTROL.has(s.kind) && s.turnsRemaining > 0,
  );
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
 * One unconditional tick of a cooldown record — the whole of the rule, in one
 * place (feature 004 T015).
 *
 * Lifted out of `cooldownsAfterResolution` so that `firingProfile` can simulate
 * with **the engine's own semantics rather than a second copy of them**. Feature
 * 004's SC-003 requires the squad builder's prediction and the engine's
 * behaviour to agree on every hero and every ordering; two implementations
 * agreeing is a thing that has to be maintained, one implementation agreeing is
 * a thing that cannot drift.
 *
 * A cooldown reaching zero is **removed** rather than stored as `0`. Absent and
 * zero mean the same thing to every reader (`?? 0`), so keeping both would be
 * two representations of one state.
 */
export function tickCooldowns(
  cooldowns: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const next: Record<string, number> = {};

  for (const [powerId, remaining] of Object.entries(cooldowns)) {
    const ticked = remaining - 1;
    if (ticked > 0) next[powerId] = ticked;
  }

  return Object.freeze(next);
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
  return tickCooldowns(heroStateOf(state, instanceId).cooldowns);
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

  return getHero(hero.heroId).powers.filter((power) =>
    isPowerAvailable(power, hero.cooldowns, state.heroTurn),
  );
}

/**
 * The availability test, as one predicate (feature 004 T015).
 *
 * Takes a cooldown record and a battle turn rather than a `BattleState`, so
 * `firingProfile` can ask the same question of a simulated ladder that the
 * engine asks of a real board. Same function, same answer, by construction.
 */
export function isPowerAvailable(
  power: Power,
  cooldowns: Readonly<Record<string, number>>,
  battleTurn: number,
): boolean {
  return (cooldowns[power.id] ?? 0) <= 0 && battleTurn >= gateTurnFor(power.tier);
}
