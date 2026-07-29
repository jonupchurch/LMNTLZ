/**
 * The append-only action log, and the one property everything else rests on
 * (007 T011–T013).
 *
 * ### A duplicate is a constraint violation, not a race to detect
 *
 * `battle_actions` is keyed on `(battle_id, sequence)` and the **client says
 * which sequence it believes it is writing**. So a retry collides with a key
 * instead of appending a second row, and the collision is decided by Postgres
 * rather than by this file.
 *
 * The application-level alternative — select, then insert if absent — has a
 * window between the two calls, and that window is exactly what a dropped mobile
 * connection produces: the first request committed, the client never saw the
 * response, and the retry arrives while nothing distinguishes it from a new
 * action. `INSERT … ON CONFLICT DO NOTHING` has no window, because there is only
 * one statement.
 *
 * This matters more here than anywhere else in the schema. **The log is replayed
 * to rebuild state**, so one duplicated append silently changes every turn after
 * it, and the battle stays entirely plausible while being wrong. There is no
 * error, no alert, and no way to tell afterwards.
 *
 * ### The seed is not in this file, and cannot be
 *
 * `appendAction` does not resolve anything. It takes a **thunk** that resolves,
 * calls it only when a write is actually going to happen, and stores what comes
 * back. Constitution XII's boundary therefore lives entirely in the caller: this
 * module could not leak a seed if it tried, because it never holds one.
 *
 * The published contract writes `appendAction(battleId, action)` with two
 * parameters, which assumes the resolver is reachable from inside. Injecting it
 * is the same function with the seed left outside — and it is what lets the
 * idempotency guarantee be built and tested before the battle loop exists.
 *
 * ### What is stored, and why it is returned instead of recomputed
 *
 * The whole packet — the events, the state they leave behind, and the conclusion
 * if there is one. **A retry is answered from the stored row, never re-resolved.**
 *
 * Re-resolving would be correct *by argument*: the resolver is pure, so the same
 * `(seed, log)` gives the same answer. Returning the stored row is correct *by
 * construction*, which is a different and stronger thing — it does not depend on
 * the resolver staying pure, on the content version being the one that resolved
 * it, or on anybody preserving that property in a year.
 *
 * Storing the state alongside the events duplicates something the log can
 * re-derive, which is worth naming because this feature otherwise refuses to
 * store derivable state. The distinction is that **a log row is immutable
 * history, never consulted to determine the present.** The present is always
 * replayed from the log; this is only ever handed back when replaying a past
 * action, and a client that retries action 2 while the battle stands at action 5
 * must be shown the board as it was at action 2, not as it is now.
 */

import { and, eq, max } from 'drizzle-orm';
import type { BattleState, Conclusion } from '@lmntlz/sim/rules';
import type { ResolvedPacket } from '@lmntlz/sim/resolver';
import { db } from '../db/client.js';
import { battleActions } from '../db/schema/battles.js';

/**
 * What one `act` call resolves to: the acted turn, then **every forced turn and
 * every engine turn** up to the next real player choice.
 *
 * Several hero turns, one row. That is why `drawsConsumed` is recorded rather
 * than assumed, and why the log is 20–40 entries against a ~102-hero-turn
 * battle. The engine's own turns need no row of their own — the defense AI is
 * deterministic given `(seed, state)`, so a replay re-derives them.
 */
export interface ActionPacket {
  readonly events: readonly ResolvedPacket[];
  /** Seedless by construction — `BattleState` has no representation of one. */
  readonly state: BattleState;
  readonly conclusion: Conclusion | null;
}

/** What the client asks for. The sequence is checked, never believed. */
export interface ActionIntent {
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
}

/** What the resolver hands back, and the draw window it consumed doing so. */
export interface Resolution {
  readonly packet: ActionPacket;
  readonly drawIndexBefore: bigint;
  readonly drawsConsumed: bigint;
}

export interface AppendResult {
  readonly packet: ActionPacket;
  /**
   * True when this call did not write. **The route does not branch on it** —
   * `200` either way, because a client that retried must not be able to tell.
   * It exists for tests and for logging.
   */
  readonly replayed: boolean;
}

/**
 * The client and the server disagree about history.
 *
 * `currentSequence` is **the next sequence the client must write**, matching the
 * `sequence` field `POST /v1/battles` returns. Naming it "current" comes from
 * the contract; it is one past the last row, not the last row.
 */
export class SequenceGapError extends Error {
  readonly code = 'sequence_gap';
  readonly currentSequence: number;

  constructor(expected: number, received: number) {
    super(
      `This battle expects action ${expected}, not ${received}. ` +
        'Re-read the battle and continue from there.',
    );
    this.name = 'SequenceGapError';
    this.currentSequence = expected;
  }
}

/**
 * A conflict said the row exists and then it did not.
 *
 * Under read-committed this is unreachable: `ON CONFLICT DO NOTHING` waits on a
 * concurrent uncommitted insert and only reports a conflict once that
 * transaction has committed, at which point the row is visible. Thrown rather
 * than returned as `undefined` because a silent `undefined` here would surface
 * three call frames away as a battle with no packet.
 */
export class LostPacketError extends Error {
  constructor(battleId: string, sequence: number) {
    super(`battle ${battleId} conflicted on sequence ${sequence} but has no row there`);
    this.name = 'LostPacketError';
  }
}

/** The stored packet for one action, or `null` if it was never written. */
export async function storedPacket(
  battleId: string,
  sequence: number,
): Promise<ActionPacket | null> {
  const rows = await db()
    .select({ packet: battleActions.resolvedPacket })
    .from(battleActions)
    .where(and(eq(battleActions.battleId, battleId), eq(battleActions.sequence, sequence)))
    .limit(1);

  return rows[0] ? (rows[0].packet as ActionPacket) : null;
}

/**
 * The sequence the next action must carry: one past the highest written.
 *
 * **Zero for a battle with no actions**, which is what `POST /v1/battles`
 * reports. The opening packet — everything up to the first real choice — is
 * re-derived from an empty log rather than written as a row, so the first thing
 * the player does is still action `0`.
 */
export async function nextSequence(battleId: string): Promise<number> {
  const rows = await db()
    .select({ highest: max(battleActions.sequence) })
    .from(battleActions)
    .where(eq(battleActions.battleId, battleId));

  const highest = rows[0]?.highest;
  return highest === null || highest === undefined ? 0 : highest + 1;
}

/**
 * Append one action, or return what was already appended under that sequence.
 *
 * Four outcomes, in the order they are checked:
 *
 * 1. **The sequence already exists** — return its stored packet. `resolve` is
 *    never called, so an ordinary retry costs one `SELECT` and no resolution.
 * 2. **The sequence is not `max + 1`** — `SequenceGapError`. Nothing is written,
 *    because an action resolved against a history neither side believes in is
 *    worse than a refusal the client can recover from.
 * 3. **The insert wins** — first write; return the packet that was stored.
 * 4. **The insert conflicts** — a concurrent request with the same sequence got
 *    there between steps 1 and 3. Both resolved; exactly one row exists; the
 *    loser discards its own resolution and returns the winner's.
 *
 * Step 4 is the case the whole design is for, and discarding a resolution there
 * is not waste worth optimising away: the resolver is pure, so the discard costs
 * CPU and nothing else, and any scheme that avoided it would have to hold a lock
 * across the resolution.
 */
export async function appendAction(
  battleId: string,
  intent: ActionIntent,
  resolve: () => Promise<Resolution> | Resolution,
): Promise<AppendResult> {
  const already = await storedPacket(battleId, intent.sequence);
  if (already) return { packet: already, replayed: true };

  const expected = await nextSequence(battleId);
  if (intent.sequence !== expected) throw new SequenceGapError(expected, intent.sequence);

  const resolution = await resolve();

  const inserted = await db()
    .insert(battleActions)
    .values({
      battleId,
      sequence: intent.sequence,
      actorInstanceId: intent.actorInstanceId,
      powerId: intent.powerId,
      targetInstanceId: intent.targetInstanceId,
      drawIndexBefore: resolution.drawIndexBefore,
      drawsConsumed: resolution.drawsConsumed,
      resolvedPacket: resolution.packet,
    })
    .onConflictDoNothing({ target: [battleActions.battleId, battleActions.sequence] })
    .returning({ packet: battleActions.resolvedPacket });

  if (inserted[0]) return { packet: inserted[0].packet as ActionPacket, replayed: false };

  const winner = await storedPacket(battleId, intent.sequence);
  if (!winner) throw new LostPacketError(battleId, intent.sequence);
  return { packet: winner, replayed: true };
}
