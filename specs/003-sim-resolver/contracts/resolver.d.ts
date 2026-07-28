/**
 * `@lmntlz/sim/resolver` — consumes randomness. SERVER ONLY.
 *
 * Feature 003. Never imported by `apps/client`, at any depth. `purity.test.ts`
 * (feature 002) walks the client's import graph and fails the build if it is.
 *
 * CONSTITUTION XII — THE SEED NEVER LEAVES THE SERVER.
 * `Seed` below has no JSON representation and no revealing `toString`. A careless
 * `res.json(...)` cannot leak it. That is enforcement by construction, not by
 * remembering.
 */

import type { BattleState, Conclusion, Side } from '@lmntlz/sim/rules';

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

declare const SEED: unique symbol;

/**
 * Opaque. Structurally non-serialisable:
 *   - `toJSON()` throws `SeedLeakError`
 *   - `toString()` returns "[seed]"
 *   - the branded field is never enumerable
 */
export interface Seed {
  readonly [SEED]: never;
  toJSON(): never;
  toString(): '[seed]';
}

export function createSeed(): Seed;

/** For persistence ONLY, called from the one repository function that writes the
 *  battle row. Not exported from the package root. */
export function persistSeed(seed: Seed): Uint8Array;
export function restoreSeed(bytes: Uint8Array): Seed;

// ---------------------------------------------------------------------------
// The generator  (research.md Q1)
// ---------------------------------------------------------------------------

/**
 * SplitMix64 over (seed, index). Positionally addressable: O(1) for any index,
 * which is what makes re-derivation from the action log a lookup rather than a
 * re-advance.
 *
 * Implemented over BigInt or explicit 32-bit lanes. NEVER over Number — a
 * silently-truncated multiply is deterministic, plausible, and different on a
 * different engine.
 *
 * NAMED IN `engineVersion`. Changing it changes every in-flight battle.
 */
export function draw(seed: Seed, index: bigint): bigint;

/** Uniform in [0, 1). The only float the generator produces. */
export function drawUnit(seed: Seed, index: bigint): number;

/** Uniform integer in [1, n]. Rejection-sampled, so it is unbiased AND consumes a
 *  variable number of indices — which is why `drawsConsumed` is recorded rather
 *  than assumed. */
export function drawInt(seed: Seed, index: bigint, n: number): { value: number; consumed: bigint };

// ---------------------------------------------------------------------------
// The action log — the ONLY in-progress state  (research.md Q2)
// ---------------------------------------------------------------------------

export interface BattleAction {
  readonly battleId: string;
  /** Client-supplied. UNIQUE (battleId, sequence) — the constraint is what makes
   *  a retry idempotent, enforced by the database rather than by application
   *  logic (feature 007). */
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
  /** The global draw counter's value when this action began resolving. */
  readonly drawIndexBefore: bigint;
  /** How many indices it consumed. Recorded because rejection sampling makes it
   *  variable, and because a mismatch here is the cheapest divergence signal
   *  there is. */
  readonly drawsConsumed: bigint;
}

/** The order draws are taken WITHIN one action. Fixed, because "lazy" is not an
 *  order. Multi-target powers iterate by row then instance id — never by Set or
 *  object key order. Crit is ONE draw per packet, not per target. */
export type DrawKind = 'hit' | 'crit' | 'rider' | 'targeting-tiebreak';

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedPacket {
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly healing: number;
  readonly ridersLanded: readonly string[];
  readonly ridersResisted: readonly string[];
  readonly deaths: readonly string[];
  readonly conclusion: Conclusion | null;
}

/**
 * `replay` is the PRIMITIVE. Every request re-derives from the log, so this is
 * the hot path and it is the simple one.
 *
 * Pure in (seed, log). No I/O, no clock, no ambient state.
 */
export function replay(seed: Seed, log: readonly BattleAction[]): BattleState;

/** `replay` plus one appended action. Built ON replay, not the reverse. */
export function resolveAction(
  seed: Seed,
  log: readonly BattleAction[],
  intent: { sequence: number; actorInstanceId: string; powerId: string; targetInstanceId: string | null },
): { readonly packet: ResolvedPacket; readonly appendedAction: BattleAction };

/** The engine's turn. Delegates every CHOICE to `@lmntlz/sim/ai` (feature 004)
 *  and every DRAW to this module, so a defense plays reproducibly. */
export function resolveDefenderTurn(
  seed: Seed,
  log: readonly BattleAction[],
): { readonly packet: ResolvedPacket; readonly appendedAction: BattleAction };

export interface Provenance {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
}

export type ReDeriveResult =
  | { readonly ok: true; readonly state: BattleState }
  /** Returned, NOT thrown, and never papered over. An in-flight battle under a
   *  changed engine cannot be continued honestly. Feature 007 decides what
   *  happens next; the resolver's job is to give the answer. */
  | { readonly ok: false; readonly reason: 'engine-version'; readonly was: string; readonly now: string }
  | { readonly ok: false; readonly reason: 'content-version'; readonly was: string; readonly now: string };

export function reDerive(provenance: Provenance, log: readonly BattleAction[]): ReDeriveResult;

// ---------------------------------------------------------------------------
// Replay artifact  (consumed by feature 008)
// ---------------------------------------------------------------------------

/**
 * The stored event log. Written once at conclusion, NEVER re-simulated — which is
 * what makes a balance patch unable to change a past battle's outcome.
 *
 * Carries NO seed and NO draw indices. It is a record of what happened, not a
 * recipe for recomputing it.
 */
export interface ReplayLog {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly events: readonly ResolvedPacket[];
  readonly conclusion: Conclusion;
}

export function toReplayLog(seed: Seed, log: readonly BattleAction[]): ReplayLog;
