/**
 * Retention holds — a replay that outlives the window because it is evidence
 * (008 T008).
 *
 * ### TL;DR
 *
 * Replays are deleted after 7 days. If somebody reports a battle, the replay has
 * to survive long enough for the report to be resolved — disputes are routinely
 * slower than a week. A **hold** is a row saying "not yet."
 *
 * ### A row, not a boolean, and the reason is a case a flag cannot express
 *
 * The obvious design is `battle_records.retention_hold boolean`. It breaks on the
 * second report: **two reports against one battle are two independent holds.**
 * Close the first and a flag says "released" while the second dispute is still
 * open, and the evidence is deleted underneath an active case. Nothing about that
 * failure is visible — the blob is simply gone when somebody eventually looks.
 *
 * So `PRIMARY KEY (battle_id, report_id)`: two reports make two rows, cleanup
 * requires that **none** of them is open, and closing one changes nothing about
 * the other. `retention.test.ts` (T032) tests exactly this case.
 *
 * ### Release is a state change, never a delete
 *
 * `releaseHold` sets `released_at`; the **next cleanup run** does the deleting.
 * That keeps deletion in exactly one place, which is what makes "safe to re-run"
 * a property of one function rather than a claim about several. A release that
 * deleted the blob directly would be a second deletion path, and the second path
 * is always the one that is not idempotent, not batched and not resumable.
 *
 * It also keeps the hold's history: a closed hold is a row that records a report
 * once held this battle, which is worth more than an absence when somebody asks
 * why a replay lived for five weeks.
 *
 * Retention becomes `max(7 days from conclusion, 30 days from the report's
 * close)` — see `research.md` Q2.
 */

import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { battleRecords } from './battleRecords.js';

export const replayHolds = pgTable(
  'replay_holds',
  {
    /**
     * **Foreign key to the record, not to `battles`** — and unlike
     * `battle_records.battle_id` this one is safe to declare.
     *
     * A record is never deleted, so the reference can never dangle and never
     * cascades anything away. `battles`, by contrast, is prunable and its rows
     * are deleted outright on a discard; a hold pointing there would vanish with
     * it. The hold is about the *replay of a battle that happened*, which is
     * precisely what this table is and what `battles` stops being.
     */
    battleId: uuid('battle_id')
      .notNull()
      .references(() => battleRecords.battleId, { onDelete: 'cascade' }),

    /**
     * **No foreign key, because `reports` does not exist yet** — it arrives with
     * feature 015, and this table has to work before then so that cleanup is
     * written against the real query from the first run.
     *
     * Left unconstrained rather than deferred: adding the reference later is a
     * one-line migration on an empty-to-small table, whereas writing cleanup
     * without the join is how the `NOT EXISTS` clause gets forgotten.
     */
    reportId: uuid('report_id').notNull(),

    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Null while the hold is open. Set by `releaseHold`; the next cleanup run
     * reads it and does the deleting. **Cleanup's condition is
     * `released_at IS NULL` across all of a battle's holds**, not "this one is
     * released."
     */
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.battleId, t.reportId] })],
);
