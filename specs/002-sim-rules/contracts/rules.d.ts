/**
 * `@lmntlz/sim/rules` — pure, shared, deterministic.
 *
 * Feature 002. Imported UNMODIFIED by both client and server (FR-002).
 *
 * CONSTITUTION XII. Nothing in this file may:
 *   - consume randomness of any kind,
 *   - read a clock,
 *   - read ambient state,
 *   - decide an OUTCOME.
 *
 * It computes probabilities and ranges; feature 003 draws from them. Enforced by
 * `purity.test.ts`, which walks the import graph and fails the build.
 *
 * Everything here returns a value. NOTHING mutates the state it is given.
 */

import type { DamageType, Effectiveness, Hero, Power, Reach } from '@lmntlz/content';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** 1..3 attacker (1 = rearmost, 3 = front line), 4..6 defender (4 = front). */
export type Row = 1 | 2 | 3 | 4 | 5 | 6;
export type Side = 'attacker' | 'defender';

export interface HeroState {
  readonly heroId: string;
  readonly instanceId: string;
  readonly side: Side;
  readonly row: Row;
  readonly hp: number;              // 0 means it has LEFT the board (FR-029)
  readonly maxHp: number;           // Toughness * 50 (FR-016)
  readonly accumulator: number;     // 0..<100; internal (FR-014)
  readonly cooldowns: Readonly<Record<string, number>>;  // powerId -> turns left
  readonly statuses: readonly StatusInstance[];
  readonly statMods: Readonly<Partial<Record<keyof Hero['stats'], number>>>; // FLAT points (FR-015)
  readonly reachMod: number;        // e.g. +1 from `Further Than It Looks`
}

export interface StatusInstance {
  readonly kind: string;
  readonly turnsRemaining: number;
  readonly potency: number;
  readonly sourceInstanceId: string;
}

export interface BattleState {
  readonly heroes: readonly HeroState[];
  readonly heroTurn: number;        // counts toward the 300 cap (FR-031)
  readonly turnOfInstance: string | null;
  readonly engineVersion: string;
  readonly contentVersion: string;
}

// ---------------------------------------------------------------------------
// Reach and targeting  (FR-005 .. FR-011)
// ---------------------------------------------------------------------------

/**
 * Count of OCCUPIED rows crossed, INCLUDING the target's row and EXCLUDING the
 * actor's own. An empty row counts zero, so reach opens up as a battle wears on.
 *
 * Row 1 -> row 4 is distance 3 at full formation: the back seat cannot attack.
 * That is priced, not a bug.
 */
export function distance(state: BattleState, from: Row, to: Row): number;

/** `distance(...) <= hero.reach + reachMod`. NEVER bounded by a constant — a +1
 *  reach rune puts THREE enemy rows in the window (feature 004 FR-020). */
export function inReach(state: BattleState, actorId: string, targetRow: Row): boolean;

export type TargetingStage = 'reach' | 'filter' | 'compulsion' | 'choice';

export interface TargetingResult {
  /** Survivors of stages 1-3, in no meaningful order. Feature 004 SORTS this;
   *  it never filters it, which is what makes "no legal target" unreachable. */
  readonly candidates: readonly string[];
  /** Set when a compulsion applied. Overrides any preference. */
  readonly compelled: string | null;
  /** Which filters were IGNORED because applying them would empty the set. */
  readonly filtersIgnored: readonly string[];
}

/**
 * Four ordered stages: reach -> filters -> compulsion -> choice (FR-009).
 * This function performs the first three and stops. It never returns an empty
 * `candidates` where a legal target exists (FR-010).
 *
 * Applies IDENTICALLY to allies and enemies — a heal is range-limited exactly as
 * an attack is (FR-008). The power's `friendly` flag selects the pool; nothing
 * else about the path differs.
 */
export function legalTargets(
  state: BattleState,
  actorInstanceId: string,
  powerId: string,
): TargetingResult;

/** True when NO power the hero owns has a legal target. It passes (FR-011). */
export function mustPass(state: BattleState, actorInstanceId: string): boolean;

// ---------------------------------------------------------------------------
// Turn order  (FR-012 .. FR-014)
// ---------------------------------------------------------------------------

/**
 * Projected order for the next `lookahead` hero-turns.
 *
 * Ticks are INTERNAL (FR-014). Consumers get this. The accumulator gains
 * `50 + Speed` per tick and is DRAINED IN A LOOP (FR-013) — a hero at Speed 75
 * can act twice before one at Speed 15 acts once.
 */
export function turnQueue(state: BattleState, lookahead: number): readonly string[];

// ---------------------------------------------------------------------------
// Probabilities — computed, NEVER resolved  (FR-004, FR-020, FR-021)
// ---------------------------------------------------------------------------

/**
 * The two-distribution contest folded to one exact probability, then clamped.
 *
 *   m = Agility_d - Perception_a - 20
 *   P = (1/(Na*Nd)) * SUM_{a=1..Na} clamp(a - m - 1, 0, Nd)
 *   Na = floor(Luck_a * 1.5), Nd = floor(Luck_d * 1.5)
 *
 * Returns a value in [0.65, 0.95]. The clamp is applied AFTER the fold — see
 * research.md Q2; clamping earlier loses the property that makes runes safe.
 */
export function hitProbability(
  state: BattleState,
  attackerInstanceId: string,
  defenderInstanceId: string,
): number;

/**
 * The same fold with `m = Resolve_d - potency` and NO +20 edge. One
 * implementation; the edge is a parameter (05-status.md).
 */
export function riderLandProbability(
  state: BattleState,
  sourceInstanceId: string,
  targetInstanceId: string,
  potency: number,
): number;

/** `Luck * 0.5` percent, as a fraction. Rolled ONCE PER PACKET, not per target. */
export function critChance(state: BattleState, attackerInstanceId: string): number;

// ---------------------------------------------------------------------------
// Damage  (FR-016 .. FR-022)
// ---------------------------------------------------------------------------

export interface DamagePreview {
  /** `Might * power.multiplier`. Luck is NOT in this (FR-017). */
  readonly packet: number;
  /** E = (Armor | MagicResist) - Penetration ; K = 75.
   *  E >= 0: 1 - E/(E+K)   ·   E < 0: 1 + (-E)/((-E)+K)  */
  readonly effectiveResistance: number;
  readonly mitigationFactor: number;
  readonly mitigated: number;
  /** From @lmntlz/content. NEVER recomputed here (FR-022). */
  readonly typeMultiplier: Effectiveness;
  /** Which mitigation stat answered. A mixed martial/arcane power answers the
   *  defender's LOWER stat. */
  readonly resistedBy: 'armor' | 'magicResist';
  /** `max(packet * 0.25, mitigated * typeMultiplier)` (FR-019). Full precision
   *  throughout; rounded ONCE, here, to the nearest whole number. */
  readonly final: number;
  readonly floorApplied: boolean;
  /** So a consumer can present the odds without being able to resolve them. */
  readonly hitProbability: number;
  readonly critChance: number;
  readonly critFinal: number;       // packet doubled, same pipeline
}

export function damagePreview(
  state: BattleState,
  attackerInstanceId: string,
  powerId: string,
  defenderInstanceId: string,
): DamagePreview;

/** Healing skips evasion, mitigation, type effectiveness, the Resolve contest and
 *  the 25% floor. It keeps reach and crit. Capped at maxHp; overheal is lost. */
export function healPreview(
  state: BattleState,
  healerInstanceId: string,
  powerId: string,
  targetInstanceId: string,
): { readonly amount: number; readonly critAmount: number; readonly overheal: number };

// ---------------------------------------------------------------------------
// Cooldowns, phases, conclusion  (FR-023 .. FR-031)
// ---------------------------------------------------------------------------

export type Phase = 'upkeep' | 'attack' | 'defense' | 'effects' | 'resolution';

/** Integer turns. Ticks in Resolution, UNCONDITIONALLY — including for a hero
 *  that lost its turn to crowd control (FR-024, FR-025). */
export function cooldownsAfterResolution(
  state: BattleState,
  instanceId: string,
): Readonly<Record<string, number>>;

/** Off cooldown AND past its gate: tier 4 from turn 3, tier 5 from turn 5. */
export function availablePowers(state: BattleState, instanceId: string): readonly Power[];

export type Conclusion =
  | { readonly winner: Side; readonly reason: 'wipe' }
  | { readonly winner: Side; readonly reason: 'cap-hp-share'; readonly shares: readonly [number, number] }
  | { readonly winner: Side; readonly reason: 'cap-champions-standing' }
  | { readonly winner: 'defender'; readonly reason: 'cap-tiebreak' };

/** null while the battle continues. At 300 hero-turns: pooled HP share, then
 *  champions standing, then the defender (FR-031). */
export function battleEnded(state: BattleState): Conclusion | null;
