/**
 * The action log — **the only in-progress state there is.**
 *
 * In-progress battle state is never stored. Every request re-derives the battle
 * from `(seed, log)`, which means `replay` is the hot path and `resolveAction`
 * is built on top of it rather than the other way round.
 *
 * That has a consequence worth stating plainly: **the resolver consumes
 * randomness and is nonetheless a pure function.** If a draw came from a live
 * entropy source, a battle would change underneath the player between one action
 * and the next — the same request, replayed, would produce a different past.
 */

import type { BattleState, Conclusion } from '../rules/index.js';
import type { Seed } from './seed.js';
import type { ResolvedPacket } from './resolve.js';

export interface BattleAction {
  readonly battleId: string;
  /**
   * Client-supplied. **Unique on `(battleId, sequence)`** — the constraint is
   * what makes a retry idempotent, and it is enforced by the database rather
   * than by application logic (feature 007).
   */
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
  /**
   * The global draw counter when this action began resolving.
   *
   * **One monotonic counter per battle, never per turn.** Per-turn scoping looks
   * tidier and is a trap: a bug that reorders two actions *within* a turn would
   * leave both cursors identical and produce different outcomes, which is a
   * divergence with no signal attached to it.
   */
  readonly drawIndexBefore: bigint;
  /**
   * How many indices it consumed. **Recorded rather than assumed**, because
   * rejection sampling makes it variable — and because a mismatch here is the
   * cheapest divergence signal there is.
   */
  readonly drawsConsumed: bigint;
}

export type DrawKind = 'hit' | 'crit' | 'rider' | 'targeting-tiebreak';

export interface Provenance {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
}

export type ReDeriveResult =
  | { readonly ok: true; readonly state: BattleState }
  | {
      readonly ok: false;
      readonly reason: 'engine-version';
      readonly was: string;
      readonly now: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'content-version';
      readonly was: string;
      readonly now: string;
    };

/**
 * The stored replay artifact, consumed by feature 008.
 *
 * **A record of what happened, not a recipe for recomputing it.** It carries no
 * seed and no draw indices. Replays are played back from these packets and
 * never re-simulated, which is what makes a balance patch structurally unable to
 * change a past battle's outcome (Constitution XVI).
 */
export interface ReplayLog {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly events: readonly ResolvedPacket[];
  readonly conclusion: Conclusion | null;
}

/**
 * Order the log deterministically.
 *
 * **Out-of-order arrival must not change anything.** Requests race, retries
 * land late, and a proxy can reorder two in flight. `sequence` is the truth;
 * arrival order is noise.
 */
export function orderedLog(log: readonly BattleAction[]): readonly BattleAction[] {
  return [...log].sort((a, b) => a.sequence - b.sequence);
}

export function nextDrawIndex(log: readonly BattleAction[]): bigint {
  const ordered = orderedLog(log);
  const last = ordered[ordered.length - 1];
  return last === undefined ? 0n : last.drawIndexBefore + last.drawsConsumed;
}

/**
 * Build the replay artifact.
 *
 * Takes the seed only so that the caller cannot accidentally build one without
 * having had the authority to resolve the battle; **nothing derived from it
 * reaches the output**, which `seedCustody.test.ts` asserts by searching the
 * serialised result for the seed's own bytes.
 */
export function toReplayLog(
  _seed: Seed,
  provenance: Provenance,
  events: readonly ResolvedPacket[],
  conclusion: Conclusion | null,
): ReplayLog {
  return Object.freeze({
    battleId: provenance.battleId,
    engineVersion: provenance.engineVersion,
    contentVersion: provenance.contentVersion,
    events: Object.freeze([...events]),
    conclusion,
  });
}
