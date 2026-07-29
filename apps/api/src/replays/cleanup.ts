/**
 * Deleting expired replays (008 T027–T030, FR-017, FR-018).
 *
 * ### TL;DR
 *
 * Once a day, find replays whose battle concluded more than 7 days ago and which
 * no moderation report is holding, delete the blobs, and mark the records. Storage
 * then costs 7× the daily rate forever instead of growing with the age of the game
 * — roughly 7 GB at 10k daily players rather than 3.65 TB a year at 100k.
 *
 * ### The order of the two writes is the entire resumability argument
 *
 * A batch can die halfway: a serverless timeout, a deploy, a dropped connection.
 * Only one ordering survives that.
 *
 * - **Mark the rows, then delete the blobs** — a crash in between leaves blobs
 *   whose rows no longer point at them. With `list()` forbidden, **nothing can
 *   ever find them again**: Postgres has forgotten the URL and the bucket cannot
 *   be enumerated. They pay rent forever, invisibly, which is precisely the
 *   unbounded bill this job exists to prevent.
 * - **Delete the blobs, then mark the rows** — a crash in between leaves rows
 *   still pointing at blobs that are already gone. The next run selects the same
 *   rows and deletes the same URLs, which the SDK documents as a success. Nothing
 *   is lost and nothing is orphaned.
 *
 * So blobs first. **That is why `del` being idempotent is load-bearing rather than
 * a convenience** — it is the property that makes an interrupted run harmless, and
 * it is asserted against the live vendor in `tests/replays/store.test.ts` rather
 * than taken from the documentation.
 *
 * ### `list()` appears nowhere in this feature
 *
 * Not in the job, not in monitoring, not in an admin view. Postgres knows what
 * exists; the bucket is write-and-delete only. The reason is correctness first —
 * the bucket cannot answer *"which replays belong to concluded battles older than
 * seven days with no open hold"*, so a listing would be a second and worse source
 * of truth. The billing model happens to agree: `del()` is free and `list()` is a
 * billed advanced operation, so paging 100k blobs would be 100 billed operations
 * per run against zero for one indexed query.
 *
 * `ReplayStorage` has no `list` member at all, so the call does not typecheck.
 * `cleanup.test.ts` greps for it anyway, to catch an import straight from the SDK.
 */

import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { battleRecords } from '../db/schema/battleRecords.js';
import { replayHolds } from '../db/schema/replayHolds.js';
import { replayStorage } from './storage.js';
import { expiryCutoff, holdCutoff } from './retention.js';

/**
 * **Small on purpose.** A batch is a unit of work that must fit comfortably inside
 * a function invocation, because the recovery story is "the next run picks up where
 * this one stopped" and that only works if stopping is cheap. 100 replays is one
 * `del` round trip and one `UPDATE`.
 */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * The selection predicate, in one place.
 *
 * **Shared by the job and by `expiredButUndeletedCount`, deliberately.** The
 * monitoring signal is only meaningful if it counts exactly what the job would have
 * deleted; two hand-written copies of four conditions would drift, and the drift
 * would show up as an alarm that fires while the job is healthy — or, worse, one
 * that stays quiet while it is not.
 */
function dueForDeletion(now: Date) {
  return and(
    lt(battleRecords.concludedAt, expiryCutoff(now)),
    sql`${battleRecords.replayBlobUrl} is not null`,
    isNull(battleRecords.replayDeletedAt),
    /**
     * **No hold that is open *or* still inside its grace period.**
     *
     * Two conditions, and the second was missing from the first version of this
     * file — a gap the retention ladder test found. Retention is
     * `max(7 days from conclusion, 30 days from the report's close)`, so releasing
     * a hold must not make the evidence collectable that same night: a closed case
     * gets reopened, and an appeal arrives after the decision.
     *
     * `NOT EXISTS` across *all* of a battle's holds rather than "this hold is
     * released" — two reports against one battle are two independent holds, and
     * closing one must not release the other's evidence.
     */
    sql`not exists (
      select 1 from ${replayHolds} h
      where h.battle_id = ${battleRecords.battleId}
        and (h.released_at is null or h.released_at > ${holdCutoff(now)})
    )`,
  );
}

export interface CleanupResult {
  readonly deleted: number;
  /** True when the batch filled, so a further run has work to do. */
  readonly more: boolean;
}

/**
 * Delete one batch of expired replays. **Safe to run twice, resumable, and driven
 * entirely from Postgres.**
 *
 * Returns `more: true` when the batch filled, so a caller can loop. The job does
 * not loop internally: an unbounded loop inside one invocation is how a scheduled
 * function hits its timeout and reports failure for work it actually completed.
 */
export async function cleanupExpired(
  batchSize: number = DEFAULT_BATCH_SIZE,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const due = await db()
    .select({ battleId: battleRecords.battleId, url: battleRecords.replayBlobUrl })
    .from(battleRecords)
    .where(dueForDeletion(now))
    /**
     * **Oldest first.** The batch that runs is then always the most overdue work,
     * so a backlog drains in the order it accumulated and no replay can be starved
     * indefinitely by newer ones arriving.
     */
    .orderBy(battleRecords.concludedAt)
    .limit(batchSize);

  if (due.length === 0) return { deleted: 0, more: false };

  /**
   * **Blobs first — see the header.** One call for the whole batch, because the SDK
   * takes an array and a round trip per blob would make the batch size a latency
   * decision instead of a work-unit decision.
   */
  await replayStorage().del(due.map((row) => row.url!));

  /**
   * **Only these two columns move** (FR-018, T030). The outcome, the streak, the
   * rating change and both compositions stay exactly as recorded — deleting a
   * replay is not editing history, and nothing about a battle becomes unknowable
   * because it can no longer be watched.
   *
   * `replay_deleted_at` is what later distinguishes *"expired and swept"* from
   * *"the recording never happened"*, which is the difference between a normal
   * lifecycle and a bug.
   */
  await db()
    .update(battleRecords)
    .set({ replayBlobUrl: null, replayDeletedAt: now })
    .where(
      inArray(
        battleRecords.battleId,
        due.map((row) => row.battleId),
      ),
    );

  return { deleted: due.length, more: due.length === batchSize };
}

/**
 * The monitoring signal (FR-017, SC-008).
 *
 * ### It alarms on observed state, never on the job reporting success
 *
 * The failure this exists for is **cleanup silently stopping** — a schedule that
 * was never registered, a cron that was removed in a config edit, a function
 * erroring on every run. In every one of those the job reports nothing at all,
 * which is indistinguishable from a job with nothing to do. A success counter
 * cannot tell them apart; a count of outstanding work can.
 *
 * ### What "healthy" looks like, stated precisely
 *
 * **Not zero.** Cleanup runs daily, so at any moment this legitimately holds up to
 * a day of newly-expired replays. Healthy is *bounded and non-monotonic* — it rises
 * through the day and drops to near zero after each run. The alarm belongs on
 * sustained growth or on a multiple of the observed daily volume, not on `> 0`.
 *
 * Written alongside `cleanupExpired` rather than after it, because a detector added
 * later is written by somebody who has not yet seen the failure.
 */
export async function expiredButUndeletedCount(now: Date = new Date()): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(battleRecords)
    .where(dueForDeletion(now));

  return row?.n ?? 0;
}

/**
 * Blobs retained past the ordinary window because a report is holding them.
 *
 * Separate from the count above because it is **not** a problem — it is the
 * retention feature working. Kept apart so a growing hold count cannot be mistaken
 * for a broken cleanup job, which is exactly the confusion a single "not deleted
 * yet" number would create.
 */
export async function heldCount(now: Date = new Date()): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(battleRecords)
    .where(
      and(
        lt(battleRecords.concludedAt, expiryCutoff(now)),
        sql`${battleRecords.replayBlobUrl} is not null`,
        isNull(battleRecords.replayDeletedAt),
        /**
         * Mirrors `dueForDeletion`'s hold clause exactly, including the grace
         * period — a replay inside its 30 days is still being retained *for* a
         * report, so counting it as a backlog would make the retention feature
         * working look like the cleanup job failing.
         */
        sql`exists (
          select 1 from ${replayHolds} h
          where h.battle_id = ${battleRecords.battleId}
            and (h.released_at is null or h.released_at > ${holdCutoff(now)})
        )`,
      ),
    );

  return row?.n ?? 0;
}

/** Whether a specific battle's replay has been swept. For tests and support. */
export async function isSwept(battleId: string): Promise<boolean> {
  const [row] = await db()
    .select({ deletedAt: battleRecords.replayDeletedAt })
    .from(battleRecords)
    .where(eq(battleRecords.battleId, battleId))
    .limit(1);

  return row?.deletedAt !== null && row?.deletedAt !== undefined;
}
