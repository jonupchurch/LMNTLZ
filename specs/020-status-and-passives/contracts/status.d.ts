/**
 * The public surface `packages/sim/rules` gains for 020.
 *
 * **A contract, not an implementation.** Nothing here has a body; this file exists so
 * the shape can be reviewed and disagreed with before 87 powers are authored against
 * it. `specs/003-sim-resolver/contracts/resolver.d.ts` is the precedent, including its
 * documented deviation — where the delivered code departs from a contract, the reason
 * is written down rather than the contract being quietly amended.
 *
 * Two properties every signature here holds to:
 *
 * 1. **Pure.** No RNG, no I/O, no clock. `determinism.test.ts` evaluates rules a
 *    thousand times and demands byte-identical answers, so a contest — which draws —
 *    is deliberately absent from this file. It belongs to `resolver/`.
 * 2. **Returns values, never mutates.** Every field on `HeroState` is `readonly`.
 */

import type { Hero } from '@lmntlz/content';
import type { BattleState, HeroState } from './state.js';
import type { Compulsion, TargetFilter } from './targeting.js';

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/**
 * The six families of `05-status.md`.
 *
 * **Typed rather than `string`**, which is what `StatusInstance.kind` is today. An
 * untyped kind makes a typo a silently inert effect — the failure mode this whole
 * feature exists to end.
 */
export type StatusKind =
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
  | 'silence';

export type StatusFamily =
  | 'damage-over-time'
  | 'stat-modifier'
  | 'mitigation-shred'
  | 'shield'
  | 'targeting'
  | 'control';

/**
 * How a kind behaves when it meets another of its own kind.
 *
 * `'refresh-only'` is stronger than `'capped'` with a cap of 1: a second stun does not
 * replace the first, it re-arms its duration. One turn of stun is the strongest single
 * effect in the game and must never become two.
 */
export type StackRule =
  | { readonly mode: 'capped'; readonly limit: number }
  | { readonly mode: 'largest-wins' }
  | { readonly mode: 'refresh-only' }
  | { readonly mode: 'unbounded' };

export interface StatusDefinition {
  readonly kind: StatusKind;
  readonly family: StatusFamily;
  readonly stacking: StackRule;
  /** Ticks damage in the bearer's Upkeep. Only the damage-over-time family does. */
  readonly ticksDamage: boolean;
  /** Needs a stat named on the rider — the stat-modifier and shred families. */
  readonly needsStat: boolean;
}

export declare const STATUS_CATALOG: Readonly<Record<StatusKind, StatusDefinition>>;

// ---------------------------------------------------------------------------
// Magnitudes — derived from tier, never authored
// ---------------------------------------------------------------------------

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

/** The indexed scale: ±10 · ±15 · ±15 · ±20 · ±25. */
export declare function statChangeForTier(tier: Tier): number;

/** 1 · 2 · 3 · 3 · 4 turns. Tier 0 carries no rider and returns 0. */
export declare function durationForTier(tier: Tier): number;

/** `Might ×` 0.25 · 0.35 · 0.40 · 0.50 · 0.60. */
export declare function dotTickForTier(tier: Tier, might: number): number;

/** `Might ×` 1.0 · 1.5 · 1.5 · 2.0 · 2.5. */
export declare function shieldForTier(tier: Tier, might: number): number;

/**
 * 20 · 28 · 36 · 44 · 52.
 *
 * **The ladder is tuned to the Luck die and breaks outside it.** An earlier 20–70
 * version was fitted to a d100 and made a tier-5 rider land automatically against 243
 * of 729 pairs. Any change to the die multiplier has to refit this table.
 */
export declare function potencyForTier(tier: Tier): number;

/** Shred is the one magnitude not derived from tier: 20% / 30% / 40%. */
export type ShredBand = 'small' | 'moderate' | 'large';
export declare function shredFraction(band: ShredBand): number;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export interface StatusInstance {
  readonly kind: StatusKind;
  readonly turnsRemaining: number;
  /** Fixed at application: points, a fraction, absorbed HP, or per-tick damage. */
  readonly magnitude: number;
  readonly stat: keyof Hero['stats'] | null;
  readonly sourceInstanceId: string;
  /**
   * **Part of the identity, not decoration.** "The same source refreshes" is keyed on
   * (instance, power, kind) — instance alone would make two different powers on one
   * hero refresh each other, converting a designed combo into a no-op.
   */
  readonly sourcePowerId: string;
  /** 0 flat; 0.5 for a Fire-House burn, which grows 50% of base per tick. */
  readonly escalation: number;
  /** `false` for Ember Saelith's burns and Umbriel's debuffs. They still expire. */
  readonly cleansable: boolean;
}

/**
 * Apply one effect, honouring the kind's stacking rule.
 *
 * Returns the bearer's whole status list rather than the instance, because stacking is
 * a decision about the **set** — a fourth burn displaces nothing and is simply refused,
 * and a smaller shield does not replace a larger one.
 */
export declare function applyStatus(
  existing: readonly StatusInstance[],
  incoming: StatusInstance,
): readonly StatusInstance[];

/** One unconditional countdown, dropping anything that reaches zero. */
export declare function tickDurations(
  statuses: readonly StatusInstance[],
): readonly StatusInstance[];

/**
 * Remove negative effects from an ally (`cleanse`) or positive ones from an enemy
 * (`strip`). Anything with `cleansable: false` survives — it can still expire.
 */
export declare function cleanse(
  statuses: readonly StatusInstance[],
  polarity: 'negative' | 'positive',
): readonly StatusInstance[];

// ---------------------------------------------------------------------------
// Readers — the derived layer
// ---------------------------------------------------------------------------

/**
 * The status contribution to one stat, summed.
 *
 * **This is why status stat changes are never written into `statMods`.** That record
 * already holds rune points, and one shared bag makes an expiring buff subtract from
 * what a player bought. Reading the contribution off the statuses that are already
 * there makes expiry correct by construction.
 */
export declare function statusPoints(hero: HeroState, key: keyof Hero['stats']): number;

/** The surviving fraction of a mitigation stat after every shred on the bearer. */
export declare function shredFactor(hero: HeroState, stat: 'armor' | 'magicResist'): number;

/** Total absorbable HP. At most one shield exists, so this is 0 or that shield. */
export declare function shieldOf(hero: HeroState): number;

/** What a damage-over-time effect deals this Upkeep, including any escalation. */
export declare function upkeepDamage(hero: HeroState): number;

// ---------------------------------------------------------------------------
// Passive hooks
// ---------------------------------------------------------------------------

/**
 * Targeting-shaped passives.
 *
 * **`legalTargets` already accepts both of these and has never been passed either** —
 * the resolver calls it with three arguments. Taunt/fade cancellation needs no code: it
 * falls out of filter-then-compulsion ordering, which `targeting.ts` already documents.
 */
export interface TargetingContribution {
  readonly filters: readonly TargetFilter[];
  readonly compulsion: Compulsion | null;
}

export declare function targetingFor(
  state: BattleState,
  actorInstanceId: string,
): TargetingContribution;

export interface PassiveHooks {
  readonly onDamageDealt?: (
    amount: number,
    attacker: HeroState,
    defender: HeroState,
    state: BattleState,
  ) => number;
  readonly onCrit?: (state: BattleState, attacker: HeroState, defender: HeroState)
    => readonly StatusInstance[];
  readonly onMissed?: (state: BattleState, defender: HeroState)
    => readonly StatusInstance[];
  readonly onDeathNearby?: (state: BattleState, witness: HeroState, fallen: HeroState)
    => readonly StatusInstance[];
  /** Lets `It Catches`, `Banked Coals` and `Wears Through` amend an effect as it lands. */
  readonly onStatusApplied?: (
    instance: StatusInstance,
    applier: HeroState,
    bearer: HeroState,
  ) => StatusInstance;
}

export declare function hooksFor(heroId: string): PassiveHooks;
