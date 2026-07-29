/**
 * Every battle ends (007 T045–T047, US5, SC-006).
 *
 * ### The job is driven from Postgres, never from a scan
 *
 * ```sql
 * SELECT id FROM battles
 * WHERE concluded_at IS NULL AND <last activity> < cutoff
 * ORDER BY started_at LIMIT n
 * ```
 *
 * The index does the filtering and the database decides what is due. The
 * alternative — read every open battle and check each in application code —
 * costs the whole table on every run and gets slower exactly as the game gets
 * more successful. Same shape as feature 008's replay cleanup, for the same
 * reason.
 *
 * ### Resumable and safe to re-run, which are two different properties
 *
 * **Resumable**: it takes a batch limit and reports whether more remain, so a
 * serverless function that runs out of time leaves the rest for the next
 * invocation instead of failing the whole sweep.
 *
 * **Safe to re-run**: `discard` guards on `concluded_at IS NULL` in the same
 * statement that deletes, so a battle picked up twice — by an overlapping run,
 * or by a player's own request racing the job — is discarded once. That is the
 * property that makes the batch limit safe: an interrupted run has done nothing
 * that a later run has to know about.
 *
 * ### The window is configuration, not a constant
 *
 * `06-progression.md` is parked and this number is one of the things it may
 * move. More immediately: 24 hours is a guess about how long a player might
 * reasonably be away mid-battle, and the first week of real play is when that
 * gets answered. A constant would make answering it a deploy.
 */

import { and, asc, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { battles } from '../db/schema/battles.js';
import { discard } from './settle.js';

/** Hours a battle may sit untouched. Overridden by `BATTLE_EXPIRY_HOURS`. */
export const DEFAULT_EXPIRY_HOURS = 24;

export function expiryHours(): number {
  const raw = Number(process.env['BATTLE_EXPIRY_HOURS']);
  /**
   * **A bad value falls back rather than throwing.** A typo here would
   * otherwise take down the job that keeps the game's battle table finite, and
   * it would do it silently — nobody watches a cron that has stopped running.
   */
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EXPIRY_HOURS;
}

export const expiryMs = (): number => expiryHours() * 60 * 60 * 1000;

export interface ExpirySweep {
  readonly examined: number;
  readonly discarded: number;
  /** True when the batch limit was reached, so another run has work to do. */
  readonly more: boolean;
}

/**
 * Discard every battle idle past the window.
 *
 * **The clock runs from the last action, not from the start.** A player in a
 * long fight is never caught by this; a player who walked away is caught 24
 * hours after they walked away. Measuring from `started_at` would kill a battle
 * somebody was still playing, which is the opposite of what the rule is for.
 */
export async function sweepExpired(limit = 100, now: Date = new Date()): Promise<ExpirySweep> {
  const cutoff = new Date(now.getTime() - expiryMs());

  /**
   * `last activity` is the newest action's `created_at`, or the battle's own
   * `started_at` when there are none — a battle nobody ever acted in still
   * expires. Expressed as a correlated subquery so the database does the
   * comparison; pulling the log into application code to compute it is exactly
   * the scan this is written to avoid.
   */
  const lastAction = sql<Date>`(
    select max(a.created_at) from battle_actions a where a.battle_id = ${battles.id}
  )`;

  const due = await db()
    .select({ id: battles.id, attackerId: battles.attackerId })
    .from(battles)
    .where(
      and(
        isNull(battles.concludedAt),
        or(
          and(sql`${lastAction} is null`, lt(battles.startedAt, cutoff)),
          lt(lastAction, cutoff),
        ),
      ),
    )
    .orderBy(asc(battles.startedAt))
    .limit(limit);

  let discarded = 0;
  for (const row of due) {
    const result = await discard(row.id, 'expired', row.attackerId);
    if (result.discarded) discarded += 1;
  }

  return { examined: due.length, discarded, more: due.length === limit };
}
