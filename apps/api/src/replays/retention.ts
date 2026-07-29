/**
 * How long a replay lives (008 T033–T034, FR-013).
 *
 * ### TL;DR
 *
 * A replay is watchable for **7 days** after the battle ends. A moderation report
 * can place a **hold** that keeps the blob alive longer, but a held replay past the
 * ordinary window is readable only by a moderator — retaining reported content is
 * not a licence to publish it.
 *
 * ### The window is policy, not "whether the blob still exists"
 *
 * Both this module's `expiryCutoff` and the cleanup job derive from
 * `REPLAY_TTL_DAYS`, and reads are judged against the policy rather than against
 * the bucket. That distinction matters more than it looks: cleanup runs **daily**,
 * so a replay concluded eight days ago may or may not have been deleted yet
 * depending on when the job last ran.
 *
 * If `watchable` were computed from blob presence, a player's replay would blink in
 * and out of availability on the job's schedule — the same battle watchable for one
 * player and not another, and a support question nobody could answer. Deriving from
 * the timestamp makes the answer a function of the battle, which is what a player
 * can actually reason about.
 *
 * It also means a cleanup outage cannot silently extend everyone's retention.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { replayHolds } from '../db/schema/replayHolds.js';

/**
 * **Not settled, and deliberately recorded as unsettled.** Seven days is a cost
 * decision taken before any usage data exists. `expiredButUndeletedCount()` and the
 * observed watch rate answer it later: if almost nobody opens a replay older than
 * two days, seven is generous; if the battle list turns out to be how players study
 * opponents, it is short.
 *
 * Changing it is safe in both directions — nothing derives from it but this module
 * and the cleanup query, and no stored value encodes it.
 */
export const REPLAY_TTL_DAYS = 7;

/**
 * Retention granted by a closed report, measured from the close rather than the
 * battle.
 *
 * Effective retention is `max(7 days from conclusion, 30 days from the report's
 * close)`. Measured from the close because the dispute is what the evidence is for:
 * a report opened on day six and closed on day forty needs the replay through
 * day seventy, and a window measured from the battle would have deleted it before
 * anybody looked.
 */
export const HOLD_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Battles concluded before this instant have replays past their ordinary window.
 *
 * One function so the read path and the cleanup query cannot drift apart. A read
 * that thought the window was eight days would serve replays the job had already
 * deleted, and the player would see a 410 on something the list called watchable.
 */
export function expiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REPLAY_TTL_DAYS * DAY_MS);
}

/** Whether a battle concluded at `concludedAt` is still inside the window. */
export function withinWindow(concludedAt: Date, now: Date = new Date()): boolean {
  return concludedAt.getTime() > expiryCutoff(now).getTime();
}

export function holdCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - HOLD_GRACE_DAYS * DAY_MS);
}

// ---------------------------------------------------------------------------
// Placing and releasing a hold (T033, T034)
// ---------------------------------------------------------------------------

/**
 * A report holds a battle's replay.
 *
 * **Idempotent on `(battle_id, report_id)`.** The same report placing a hold twice
 * is one hold — a moderator reopening a case, or a retried request, must not create
 * a second row that then has to be released twice. `onConflictDoNothing` rather than
 * an update, because `placed_at` should record when the evidence was *first*
 * claimed.
 *
 * **No foreign key to a report**, because `reports` arrives with feature 015. The
 * hold works before then so that cleanup is written against the real query from its
 * first run rather than gaining the `NOT EXISTS` clause later.
 */
export async function placeHold(battleId: string, reportId: string): Promise<void> {
  await db()
    .insert(replayHolds)
    .values({ battleId, reportId })
    .onConflictDoNothing({ target: [replayHolds.battleId, replayHolds.reportId] });
}

/**
 * Close a report's hold. **A state change, not a delete** (T034).
 *
 * Setting `released_at` and letting the next cleanup run do the deleting keeps
 * deletion in **exactly one place**. That is what makes "safe to re-run" a property
 * of one function rather than a claim about several — a release that deleted the
 * blob itself would be a second deletion path, and the second path is always the
 * one that is not batched, not resumable and not idempotent.
 *
 * It also preserves the history: a closed hold is a row saying a report once held
 * this battle, which answers *"why did this replay live for five weeks"* where an
 * absence could not.
 *
 * ### The 30-day grace is measured from the release, and that is why it is stored
 *
 * Effective retention is `max(7 days from conclusion, 30 days from the report's
 * close)`. Measured from the close because the dispute is what the evidence is for:
 * a report opened on day six and closed on day forty needs the replay until day
 * seventy, and a window measured from the battle would have deleted it long before
 * anybody looked.
 *
 * One report may cover several battles, so this releases **by report**, not by
 * battle.
 */
export async function releaseHold(reportId: string, now: Date = new Date()): Promise<number> {
  const released = await db()
    .update(replayHolds)
    .set({ releasedAt: now })
    /**
     * **Guarded on `released_at IS NULL`**, so releasing twice does not move the
     * timestamp forward and silently extend the 30-day grace by another month.
     */
    .where(and(eq(replayHolds.reportId, reportId), isNull(replayHolds.releasedAt)))
    .returning({ battleId: replayHolds.battleId });

  return released.length;
}

/**
 * Whether a battle's replay is currently held by anything.
 *
 * **Any open hold, not the most recent one.** Two reports are two independent
 * holds; closing one leaves the other's evidence protected. A boolean column on the
 * record could not express that, which is why the holds are their own table.
 */
export async function isHeld(battleId: string): Promise<boolean> {
  const [row] = await db()
    .select({ battleId: replayHolds.battleId })
    .from(replayHolds)
    .where(and(eq(replayHolds.battleId, battleId), isNull(replayHolds.releasedAt)))
    .limit(1);

  return row !== undefined;
}
