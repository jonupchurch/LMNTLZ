/**
 * Recording a concluded battle (008 T014–T016).
 *
 * ### TL;DR
 *
 * A finished battle produces two artifacts with opposite lifetimes and opposite
 * failure rules:
 *
 * | | Where | Lifetime | If the write fails |
 * |---|---|---|---|
 * | **the record** | Postgres, inside the conclusion transaction | **forever** | unrecoverable — roll everything back |
 * | **the replay** | private blob store, **after** commit | 7 days | one replay lost — carry on |
 *
 * ### The two must not share a code path, and that is the task
 *
 * They look like one operation called "save the battle", and writing them as one
 * is wrong in whichever direction the shared path picks.
 *
 * - **Together inside the transaction**: a blob write is a network call to a third
 *   party. Holding a Postgres transaction open across it turns every Blob latency
 *   spike into lock contention on `battles`, and a Blob outage into an inability
 *   to *finish battles at all* — the game would stop because a video recorder was
 *   down.
 * - **Together outside the transaction**: the record stops being atomic with the
 *   settlement it describes, so a crash between them leaves a battle that paid out
 *   and is invisible to every aggregate. Since the record *is* the analytics
 *   product, that battle is permanently missing from the history the first balance
 *   pass reads.
 *
 * So: `insertRecord` takes a transaction handle and can only be called inside one.
 * `writeReplayBlob` takes none and swallows its own failure. The signatures are
 * what keep them apart.
 *
 * ### The replay log carries no seed and no draw indices
 *
 * `assertNoSeed` enforces it at the boundary rather than trusting the assembly
 * below to stay correct. The log is played back verbatim and **never
 * re-simulated**, so it needs nothing to recompute with — and a log that carried
 * the means of recomputation would be an invitation to add exactly the
 * re-simulation path T023 forbids.
 */

import { asc, eq } from 'drizzle-orm';
import type { Conclusion } from '@lmntlz/sim/rules';
import { db } from '../db/client.js';
import { battleActions } from '../db/schema/battles.js';
import { battleRecords } from '../db/schema/battleRecords.js';
import { replayKey, replayStorage } from './storage.js';
import type { TurnEvent } from '../battle/idempotency.js';

/** A transaction handle. `insertRecord` accepts nothing else, on purpose. */
type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * Everything the record needs, as it stood on the `battles` row.
 *
 * **Supplied by the concluding `UPDATE`'s `RETURNING`, not read separately.** A
 * second `SELECT` would be a second observation of the same row, and the record
 * would then be able to disagree with the settlement it is describing — which is
 * exactly the class of bug this table can never recover from.
 */
export interface RecordSource {
  readonly battleId: string;
  readonly startedAt: Date;
  readonly attackerId: string | null;
  readonly defenderId: string | null;
  readonly defenderIsBot: boolean;
  readonly zone: string;
  readonly attackerSquad: unknown;
  readonly defenderSnapshot: unknown;
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly buildSha: string | null;
}

export interface RecordInput {
  readonly source: RecordSource;
  readonly conclusion: Conclusion;
  readonly turnCount: number;
  readonly concludedAt: Date;
}

/**
 * Write the permanent record. **Inside the conclusion transaction, always.**
 *
 * No `onConflictDoNothing`, deliberately. Settlement's own guard
 * (`WHERE concluded_at IS NULL`) means this runs at most once per battle, and the
 * insert shares its transaction — so a duplicate key here is not a race to absorb
 * quietly, it is a bug in the once-only guarantee. Swallowing it would hide the
 * one failure that matters.
 */
export async function insertRecord(tx: Tx, input: RecordInput): Promise<void> {
  const { source, conclusion, turnCount, concludedAt } = input;

  await tx.insert(battleRecords).values({
    battleId: source.battleId,
    startedAt: source.startedAt,
    concludedAt,

    attackerId: source.attackerId,
    defenderId: source.defenderId,
    defenderIsBot: source.defenderIsBot,
    zone: source.zone,

    winner: conclusion.winner,
    /**
     * **The engine's own reason, not `battles.reason`'s collapsed version.** The
     * three cap outcomes stay distinct here because balance reads this table, and
     * `cap-tiebreak` in particular always favours the defender — its frequency
     * measures how often the engine hands out a win nobody earned.
     */
    reason: conclusion.reason,
    turnCount,

    attackerSquad: source.attackerSquad,
    defenderSquad: source.defenderSnapshot,

    /**
     * **Left null on purpose.** Leagues come from feature 009 and rating from
     * 010; neither exists, so there is no true value to write and a sentinel
     * would be indistinguishable from a real one. The columns exist now because
     * Constitution XVI means they cannot be added later.
     */
    attackerLeague: null,
    defenderLeague: null,
    attackerRating: null,
    defenderRating: null,

    engineVersion: source.engineVersion,
    contentVersion: source.contentVersion,
    buildSha: source.buildSha,
  });
}

// ---------------------------------------------------------------------------
// The replay — after commit, and survivable
// ---------------------------------------------------------------------------

export interface ReplayLog {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
  /** The opening fold, then every stored packet in sequence order. */
  readonly events: readonly TurnEvent[];
  readonly conclusion: Conclusion;
}

/**
 * Fields that must never appear anywhere in a replay log.
 *
 * `drawIndexBefore` and `drawsConsumed` are recorded on `battle_actions` because
 * a divergence check needs them; they are server-only for the same reason the
 * seed is. A replay carrying them would hand a client the means to reproduce the
 * RNG, and — worse — would make the re-simulation path look feasible.
 */
const FORBIDDEN_IN_LOG = ['seed', 'drawIndex', 'drawIndexBefore', 'drawsConsumed'] as const;

export class ReplayLeakError extends Error {
  constructor(battleId: string, field: string) {
    super(`replay log for ${battleId} contains ${field}`);
    this.name = 'ReplayLeakError';
  }
}

/**
 * **Checked on the serialised text, not on the object graph.**
 *
 * A structural walk would need to know every shape a `TurnEvent` can take, and
 * would silently stop covering new ones. The string is what actually leaves the
 * process, so scanning it is both simpler and the thing being claimed.
 */
export function assertNoSeed(battleId: string, serialised: string): void {
  for (const field of FORBIDDEN_IN_LOG) {
    if (serialised.includes(`"${field}"`)) throw new ReplayLeakError(battleId, field);
  }
}

export interface ReplaySource {
  readonly battleId: string;
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly openingEvents: readonly TurnEvent[];
  readonly conclusion: Conclusion;
}

/** Assemble the log from the opening fold plus every stored packet, in order. */
export async function buildReplayLog(source: ReplaySource): Promise<ReplayLog> {
  const rows = await db()
    .select({ packet: battleActions.resolvedPacket })
    .from(battleActions)
    .where(eq(battleActions.battleId, source.battleId))
    .orderBy(asc(battleActions.sequence));

  const events: TurnEvent[] = [...source.openingEvents];
  for (const row of rows) {
    const packet = row.packet as { events?: TurnEvent[] } | null;
    if (packet?.events) events.push(...packet.events);
  }

  return {
    battleId: source.battleId,
    engineVersion: source.engineVersion,
    contentVersion: source.contentVersion,
    events,
    conclusion: source.conclusion,
  };
}

/**
 * Write the replay and record its URL. **Never throws.**
 *
 * ### Why a failure here is swallowed
 *
 * The battle is already over, settled and recorded; the shards are paid and the
 * streaks have moved. The only thing left to lose is the ability to *watch* it,
 * and that is exactly the same outcome as expiry — which every replay reaches
 * anyway. `watchable: false` already covers it, so a failed put needs no new
 * concept and no user-facing error.
 *
 * Throwing, by contrast, would propagate into the `act` response of the turn that
 * *won the battle*, and the player would see their victory as a 500.
 *
 * ### One retry, and no queue
 *
 * A later request touching this battle finds `replay_blob_url` still null and
 * tries again (T016). If that also fails the replay stays unwatchable. A retry
 * queue for a 5 KB file with a 7-day life would be more machinery than the thing
 * it protects.
 */
export async function writeReplayBlob(source: ReplaySource): Promise<{ written: boolean }> {
  try {
    const log = await buildReplayLog(source);
    const serialised = JSON.stringify(log);

    assertNoSeed(source.battleId, serialised);

    const { url } = await replayStorage().put(replayKey(source.battleId), serialised);

    await db()
      .update(battleRecords)
      .set({ replayBlobUrl: url })
      .where(eq(battleRecords.battleId, source.battleId));

    return { written: true };
  } catch (error) {
    /**
     * **A leak is not survivable and must not be swallowed with the rest.**
     * Every other failure here costs one replay; a `ReplayLeakError` means the
     * log carried the seed or a draw cursor, and quietly continuing would either
     * publish it or — if the put already happened — leave it published.
     */
    if (error instanceof ReplayLeakError) throw error;

    console.error(
      `[replay] blob write failed battle=${source.battleId}: ${String(error)} — replay unwatchable, record intact`,
    );
    return { written: false };
  }
}
