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
  /**
   * The 75 ceiling. **Exported because `apps/api` needs it too**: `maxHp` is
   * computed once from Toughness at board-build time, so a Toughness rune has
   * to be capped there by the same number `effectiveStat` caps by, or the two
   * disagree about what a 75 means.
   */
  STAT_CAP,
  UnknownInstanceError,
  /**
   * The clamp with no battle around it — what `board.ts` applies to rune allocations
   * and what the roster drawer shows a player their runes actually bought.
   */
  cappedStat,
  effectiveStat,
  frontRowOf,
  heroStateOf,
  isRow,
  isRowOccupied,
  isStanding,
  runeIdOf,
  runeSource,
  sideOfRow,
  standingHeroes,
  standingOnSide,
} from './state.js';
export type { BattleState, HeroState, Row, Side, StatusInstance } from './state.js';

/**
 * **The status layer (020)** — the half of combat that was specified, typed, and
 * never given an implementation.
 *
 * Everything here is pure. The *contest* that decides whether a hostile rider
 * sticks consumes a draw and therefore lives in `resolver/`, beside hit and crit.
 */
export {
  CONTROL_DURATION,
  CROWD_CONTROL,
  PERMANENT,
  STATUS_CATALOG,
  STATUS_KINDS,
  accumulateStatus,
  afterUpkeep,
  applyStatus,
  cleanse,
  composeTargeting,
  definitionOf,
  dotTickForTier,
  durationForTier,
  isPermanent,
  markCount,
  potencyForTier,
  shieldForTier,
  shieldOf,
  shredFactor,
  shredFraction,
  statChangeForTier,
  statusPoints,
  targetingStatuses,
  tickDurations,
  upkeepDamage,
} from './status.js';
export type {
  ShredBand,
  StackRule,
  StatKey,
  StatusDefinition,
  StatusFamily,
  StatusKind,
  TargetingLayer,
  Tier,
} from './status.js';

/**
 * **Passives (020 US2)** — the thirteen Role and House rules, and the hooks the
 * remaining twenty-seven uniques will hang on.
 *
 * Pure like everything else here: **no passive consumes a draw**, so the whole
 * layer is invisible to the RNG index even though it changes outcomes.
 */
export {
  HELD_UNIQUES,
  IMPLEMENTED_PASSIVES,
  PASSIVE_MAGNITUDES,
  PASSIVE_TIER,
  SURVIVAL_HP,
  actsAgainAfter,
  applyPassiveEffects,
  cooldownExtensionFor,
  critMultiplierFor,
  critRefusal,
  damageMultiplierFor,
  deniesReactions,
  fallenBetween,
  healMultiplierFor,
  hitFloorFor,
  hooksFor,
  ignoresShields,
  incomingMultiplierFor,
  lethalGuard,
  mitigationMultiplierFor,
  onAct,
  onAllyStruck,
  onApplied,
  onCrit,
  onDeath,
  onHealed,
  onMissed,
  onStrike,
  onStruck,
  onUpkeep,
  penetrationBonusFor,
  refusesReactions,
  runeBehind,
  runeFirings,
  shapeIncoming,
  shapeOutgoing,
  shapedAs,
  statBonusFor,
  strikeChancesOf,
  struckChancesOf,
  targetingFlagsOf,
  targetingFor,
  turnStartChancesOf,
  type ContestContext,
  type HealContext,
  type ShapedIncoming,
  type TargetingFlags,
  type TurnEndContext,
} from './passives.js';
/**
 * Rune utility effects (021) — the thirty-three abilities stage 4 buys.
 *
 * **Exported for the Forge as much as for the engine.** `apps/client` may import
 * `@lmntlz/sim/rules` and is banned from `/resolver` and `/ai`, so the stage-4
 * builder describes an effect by reading the same catalog the resolver runs
 * (Constitution XIII). There is no second copy to drift — not a rule against
 * writing one.
 */
export {
  POOL_KEYS,
  RESOLVED_AT_BOARD_BUILD,
  RUNE_EFFECTS,
  RUNE_MAGNITUDES,
  RUNE_SLOTS,
  UnknownRuneEffectError,
  effectsForSlot,
  effectsInPool,
  poolOf,
  runeHooksFor,
} from './runeEffects.js';
export type { EffectRole, EffectShape, PoolKey, RuneEffect, RuneSlot } from './runeEffects.js';
export type {
  ApplyContext,
  ChanceHook,
  DeathContext,
  PassiveEffect,
  PassiveHooks,
  StatContext,
  StrikeContext,
  WitnessContext,
} from './passives.js';

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
  absorb,
  damagePreview,
  healPreview,
  maxHp,
  mitigationFactor,
  packetOf,
  resistedBy,
} from './damage.js';
export type { AbsorbResult, DamagePreview } from './damage.js';

export { legalTargets, mustPass, poolFor } from './targeting.js';
export type { Compulsion, TargetFilter, TargetingResult, TargetingStage } from './targeting.js';

export {
  chargeReaction,
  inReactionOrder,
  reactionCharge,
  reactionFor,
  reactivePowerOf,
} from './reactions.js';
export type { ReactionCandidate, ReactionOpportunity } from './reactions.js';

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

/**
 * The 2/3/1 formation. **Here rather than in `apps/api` so the squad builder
 * runs the same code the server does** — the alternative is a copy in the
 * client, and the day the two disagree a player is looking at a squad the
 * builder called valid and the server refused.
 */
export {
  /**
   * The 2/3/1 formation placed on the shared 1–6 axis, and the six rows in
   * order. **`apps/api` held the only copy until 019** — the Codex draws the
   * axis to teach reach, and a transcribed diagram would teach it backwards
   * without anything failing.
   */
  AXIS,
  AXIS_ROW_OF,
  ROW_CAPACITY,
  SQUAD_ROWS,
  SQUAD_SIZE,
  freeSeatsInRow,
  isPowerRanking,
  validateFormation,
  /**
   * Everything `validateFormation` checks except the count — what a *stored*
   * squad must satisfy, as against what a *fighting* one must. See its header:
   * the six-champion rule did not relax, it moved to the moment a battle
   * starts.
   */
  validatePlacement,
} from './formation.js';
export type { FormationFault, FormationFaultCode, Seat, SquadRow } from './formation.js';

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
 *
 * ### Changelog
 *
 * - **`e0.7.0`** — **Reckoning runs.** `It All Comes Back` left `HELD_UNIQUES`, so
 *   Marisel's tier-4 and tier-5 now scale with banked stacks and her tier-5 spends
 *   them. **No draw moves** — the third bump for that reason, after `e0.4.0` and
 *   `e0.5.0` — and it is mandatory anyway: the same log replays into a world where
 *   a finisher hits for twice what it did, which is the question the stamp answers.
 * - **`e0.6.0`** — the four probabilistic rune effects (021 US3). **The first bump
 *   since `e0.3.0` that moves draws**, and the first ever whose draw count depends
 *   on *what a player bought* rather than on what a power does: `Take It Back`,
 *   `Knocked Loose` and `Both Ways` each spend an index per landed attack, and
 *   `Further Than It Looks` spends one at the top of its bearer's turn — the only
 *   draw in the engine that belongs to a turn rather than to an action. A board
 *   fielding none of the four takes the identical indices it always did, which is
 *   what confines the damage to battles open across the deploy.
 * - **`e0.5.0`** — the nineteen approved uniques (020 US3). Still **no draw
 *   moves**, and one of them changes whether a champion is standing at all:
 *   `Still Burning` refuses one lethal blow per battle.
 * - **`e0.4.0`** — the passive layer (020 US2). **No draw moves**; thirteen Role
 *   and House rules change what the same draws produce.
 * - **`e0.3.0`** — the status layer (020 US1). Rider contests spend draws at step
 *   3 that a battle in flight took zero of, so every index after the first landed
 *   rider shifts.
 * - **`e0.2.0`** — the pacing pass. `HP_PER_TOUGHNESS` 50 → 8, taking the median
 *   battle from 299 hero-turns to 49. Draw order is untouched, but every HP
 *   total in the game changed, so an in-flight battle resumed under this engine
 *   would find its heroes at 6.25× their new maximum. `act.ts` already refuses a
 *   battle whose stamp does not match; this is the bump that makes it refuse.
 * - **`e0.1.0`** — first engine.
 */
export const ENGINE_RNG = 'splitmix64';

/**
 * **`e0.4.0` → `e0.5.0` for 020 US3 — Constitution XVI, same reason as the last
 * bump and a sharper example of it.**
 *
 * The passive layer **consumes no randomness at all**: every trigger is something
 * that already passed a contest, so not one draw index moves and the four
 * determinism suites reconstruct the sequence unchanged.
 *
 * It still needs the bump, and that is the point worth writing down. `e0.2.0`
 * moved because HP totals changed; `e0.3.0` moved because draws changed; the last
 * two move because **outcomes** changed — a Striker's blow below half pool is
 * ×1.25, an Earth champion cannot be stunned, and now Auriel Dawnkeep **does not
 * fall** to the blow that killed her under `e0.4.0`. Re-deriving an in-flight
 * battle across the boundary would replay the same draws into a different world,
 * with a different hero standing in it.
 *
 * > **A version stamp answers "would this log produce this state again", not
 * > "did the RNG change".** Four bumps, three unrelated causes, one question.
 *
 * **Stored replays are not at risk and this is worth being exact about.** A replay
 * is a stored event log and is never re-simulated — that is the whole of XVI and
 * why a balance patch cannot reach backwards. Every record carries the version it
 * was recorded under and plays back as recorded.
 *
 * The risk is confined to battles that are open when the deploy lands, which is
 * why **deploys drain before switching**. See `specs/020-status-and-passives/`.
 *
 * ---
 *
 * **`e0.5.0` → `e0.6.0` for 021 US3 — and this one moves draws, which the last two
 * did not.**
 *
 * Three of the four spend an index inside an action and the fourth spends one at
 * turn start, so a battle open across the deploy would resume reading its next
 * outcome from an index the original run never reached. That is the failure the
 * stamp exists to refuse, and `act.ts` refuses it.
 *
 * **What is new about this bump is where the draw count comes from.** Every
 * earlier one was a property of the *rules* — a rider contest happens because a
 * power has riders. These are a property of a **player's purchases**, so two
 * battles fought with identical squads and identical powers can now consume
 * different numbers of indices. Nothing downstream assumes otherwise —
 * `drawsConsumed` has been recorded per action rather than derived since 003,
 * precisely so a count could stop being predictable.
 *
 * A board carrying none of the four is bit-identical to `e0.5.0`, which is
 * asserted rather than believed: `tests/resolver/runeChances.test.ts` measures a
 * rune-less control on the same seed and demands the same indices.
 */
/**
 * ---
 *
 * **`e0.6.0` → `e0.7.0` for Reckoning, and it moves no draw at all.**
 *
 * `It All Comes Back` was the last of the three passives held for a missing
 * mechanic, and turning it on changes only what a multiplier evaluates to. Every
 * determinism suite reconstructs the identical sequence.
 *
 * It still needs the bump, for the reason `e0.4.0` and `e0.5.0` needed theirs: a
 * battle open across the deploy would replay the same indices into a world where
 * Marisel's finisher is worth up to twice what it was. *A version stamp answers
 * "would this log produce this state again", not "did the RNG change"* — five
 * bumps now, four unrelated causes, one question.
 */
/**
 * ---
 *
 * **`e0.7.0` → `e0.8.0` for reactions — the largest draw-order change since
 * `e0.3.0`.**
 *
 * A counter is an attack resolved *inside* another attack, so it spends a hit
 * draw, a crit draw, a rider contest each and whatever rune chances its owner
 * bought — at indices no earlier engine ever reached. Every index after the
 * first counter in a battle is shifted.
 *
 * **It also fires on a miss**, which is the part that surprises: an action that
 * consumed exactly one index under `e0.7.0` — the failed hit roll, and nothing
 * else — can now consume a dozen, because a dodged blow is still answered.
 *
 * Two things bound the blast radius, and both are asserted rather than believed:
 *
 * - **A board with no reactive power on it draws nothing here**, so every fixture
 *   and every determinism suite written before today reconstructs its sequence
 *   exactly. `tests/resolver/reactions.test.ts` measures a reaction-less control
 *   on the same seed and demands the same indices.
 * - **`CONTENT_VERSION` moved with it.** Marking `Redouble` reactive is a content
 *   edit, and until today the stamp hashed only the workbook — so the two JSON
 *   overlays could change the roster without moving it. `build-content.ts` now
 *   hashes all three authored files, which is what makes `reDerive` refuse an old
 *   battle on either axis rather than silently returning a different past.
 *
 * Six bumps now, five unrelated causes, one question.
 */
export const engineVersion = (): string => `e0.8.0-${ENGINE_RNG}`;
