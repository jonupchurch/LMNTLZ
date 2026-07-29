/**
 * `@lmntlz/sim/rules` — pure, shared, deterministic.
 *
 * **Imported unmodified by both the client and the server.** Nothing here
 * consumes randomness, reads a clock, reads ambient state, or decides an
 * outcome. It computes probabilities and ranges; `@lmntlz/sim/resolver` draws
 * from them, on the server, with a seed that never leaves it.
 *
 * That boundary is Constitution XII, and it is enforced by `purity.test.ts`
 * walking the import graph rather than by anybody remembering it.
 */

export {
  ALL_ROWS,
  ATTACKER_ROWS,
  DEFENDER_ROWS,
  UnknownInstanceError,
  effectiveStat,
  frontRowOf,
  heroStateOf,
  isRow,
  isRowOccupied,
  isStanding,
  sideOfRow,
  standingHeroes,
  standingOnSide,
} from './state.js';
export type { BattleState, HeroState, Row, Side, StatusInstance } from './state.js';

export {
  ATTACKER_EDGE,
  LUCK_DIE_MULTIPLIER,
  MAX_HIT_PROBABILITY,
  MIN_HIT_PROBABILITY,
  contestProbability,
  critChance,
  dieSize,
  hitProbability,
  riderLandProbability,
  unclampedHitProbability,
} from './probability.js';

export { distance, inReach, rowsInReach } from './reach.js';

export { ACT_THRESHOLD, TICK_BASE, afterTick, gainPerTick, speedOf, turnQueue } from './turnOrder.js';

export {
  CRIT_MULTIPLIER,
  DAMAGE_FLOOR_FRACTION,
  HP_PER_TOUGHNESS,
  K,
  damagePreview,
  healPreview,
  maxHp,
  mitigationFactor,
  packetOf,
  resistedBy,
} from './damage.js';
export type { DamagePreview } from './damage.js';

export { legalTargets, mustPass, poolFor } from './targeting.js';
export type { Compulsion, TargetFilter, TargetingResult, TargetingStage } from './targeting.js';

export {
  EFFECT_ORDER,
  PHASE_ORDER,
  availablePowers,
  cooldownsAfterResolution,
  gateTurnFor,
  isIncapacitated,
  isPowerAvailable,
  phasesFor,
  tickCooldowns,
} from './phases.js';
export type { EffectStep, Phase } from './phases.js';

/**
 * **Feature 004's one client-visible export** (T014).
 *
 * Everything else in that feature is a *choice* and lives behind the server-only
 * `@lmntlz/sim/ai`. A firing profile is arithmetic, and the squad builder needs
 * it on every drag of a ranking widget — so it belongs here, where the client
 * can import it.
 */
export {
  BATTLE_TURNS,
  InvalidRankingError,
  LIVE_SHARE_THRESHOLD,
  SWEEP_TURNS,
  chargeAfterFiring,
  firingProfile,
  isSafeOrdering,
  isSafeOrderingFor,
  nextAvailableTurn,
  rankOneFiringCount,
} from './firingProfile.js';
export type { FiringProfileEntry, PowerRanking } from './firingProfile.js';

export {
  HERO_TURN_CAP,
  battleEnded,
  hasLeftTheBoard,
  pooledHpShare,
  stillInPlay,
} from './ending.js';
export type { Conclusion } from './ending.js';

/**
 * The stamp that identifies this engine (Constitution XVI).
 *
 * **Kept separate from `contentVersion` and never merged.** They answer
 * different questions — *which rules ran* versus *which numbers they ran on* —
 * and a battle record carries both. The `e` prefix mirrors content's `c` so a
 * swapped pair is visible on sight rather than six months later, when the
 * record can no longer be backfilled.
 *
 * **The generator is named in the stamp** (feature 003, T008/FR-004), because
 * changing it changes every in-flight battle: the same seed and the same log
 * would produce a different sequence of draws and therefore a different past.
 * That makes a generator swap an *engine* change, indistinguishable in
 * consequence from rewriting the damage formula — so it must be visible in the
 * one field that says which engine ran.
 *
 * Draw *order* is part of the same contract. Adding, removing or reordering a
 * draw within an action has the identical effect and needs the identical bump.
 */
export const ENGINE_RNG = 'splitmix64';

export const engineVersion = (): string => `e0.1.0-${ENGINE_RNG}`;
