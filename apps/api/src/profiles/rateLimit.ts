/**
 * The export rate limit (012 T023).
 *
 * ### In memory, deliberately, and the reason is worth stating
 *
 * This is a **courtesy throttle on a bulk read**, not a security control. The
 * export exposes nothing the requester is not already entitled to — it is their
 * own data — so the thing being protected is the database, not a secret.
 *
 * That makes the usual objection to an in-memory limiter irrelevant here. On
 * serverless the counter is per instance, so a determined caller who lands on
 * several instances gets several allowances. For a control guarding *access* that
 * would be disqualifying; for one guarding *load* it is fine, because the load
 * still lands on the instance that counted it.
 *
 * **If this ever guards something that matters, it moves to Postgres.** Written
 * down here so that decision is made rather than inherited.
 */

/** One export per this many milliseconds, per account. */
export const EXPORT_INTERVAL_MS = 60_000;

const lastExport = new Map<string, number>();

/**
 * **Bounded, because a `Map` keyed by account id is a memory leak with a slow
 * fuse.** Every account that ever exports would otherwise hold an entry for the
 * lifetime of the instance. Sweeping on write keeps it proportional to recent
 * traffic rather than to total players.
 */
function sweep(now: number): void {
  for (const [accountId, at] of lastExport) {
    if (now - at > EXPORT_INTERVAL_MS) lastExport.delete(accountId);
  }
}

export function exportAllowed(accountId: string, now: number = Date.now()): boolean {
  const previous = lastExport.get(accountId);

  return previous === undefined || now - previous >= EXPORT_INTERVAL_MS;
}

export function noteExport(accountId: string, now: number = Date.now()): void {
  sweep(now);
  lastExport.set(accountId, now);
}

/** Tests only — the limiter is process-wide and would otherwise leak across files. */
export function resetExportLimit(): void {
  lastExport.clear();
}
