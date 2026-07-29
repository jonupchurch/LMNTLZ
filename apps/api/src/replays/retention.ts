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
