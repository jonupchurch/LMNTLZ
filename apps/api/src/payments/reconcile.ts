/**
 * The daily diff against the provider (011 T039, T040).
 *
 * **This exists because the failure it catches is silent on both sides.** A
 * webhook that never arrives — dropped, timed out past the retry budget, refused
 * during a deploy — leaves a paying customer holding nothing, with no error in our
 * logs and a completed payment in theirs. Nobody finds that except the customer,
 * and they find it as "I paid and got nothing."
 *
 * Daily, over a **48-hour** window. The window is wider than the cadence on
 * purpose: a run that fails, or a deploy that skips one, must not leave a
 * permanent hole. Overlap costs nothing because every write is keyed on the
 * provider's event id and reprocessing is a no-op by construction.
 *
 * ### The three classes are deliberately asymmetric
 *
 * | | Action |
 * |---|---|
 * | **They have it, we do not** | **grant automatically**, and alert |
 * | **We have it, they do not** | **alert only — never revoke automatically** |
 * | Both agree | nothing |
 *
 * The asymmetry is the whole design. Class one is a customer who paid and is
 * owed something; the cost of acting is zero and the cost of waiting is a support
 * ticket, so it self-heals. Class two is ambiguous — it can mean a grant we should
 * not have made, *or* a provider export that is late, incomplete, or paginated
 * differently than we assumed — and **automatically revoking on it would take a
 * pass away from a paying customer because of a reporting lag.** One direction is
 * safe to automate and the other is not.
 */

import { gte, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { paymentEvents } from '../db/schema/payments.js';
import { getRail, type RailNotification } from './rail.js';
import { applyNotification } from './webhook.js';

/** How far back each run looks. Wider than the daily cadence, deliberately. */
export const RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ReconcileReport {
  readonly window: { readonly from: Date; readonly to: Date };
  /** Present at the provider, absent here — granted automatically. */
  readonly restored: readonly string[];
  /** Present here, absent at the provider — alerted, never revoked. */
  readonly unmatched: readonly string[];
  readonly checked: number;
}

/**
 * Run one reconciliation pass.
 *
 * Returns the report rather than logging it, so 016's ops surface can render it
 * and a test can assert both directions without parsing console output.
 */
export async function reconcile(now: Date = new Date()): Promise<ReconcileReport> {
  const from = new Date(now.getTime() - RECONCILE_WINDOW_MS);

  const theirs = await getRail().listTransactions(from);
  const theirIds = theirs.map((t) => t.providerEventId);

  const ours = await db()
    .select({ id: paymentEvents.providerEventId })
    .from(paymentEvents)
    .where(gte(paymentEvents.occurredAt, from));

  const ourIds = new Set(ours.map((row) => row.id));

  /**
   * **They have it, we do not — grant, then alert.** The grant goes through
   * `applyNotification`, the same claim-then-act path a webhook uses, so a
   * reconcile racing a late-arriving webhook cannot double-grant.
   */
  const missing: RailNotification[] = theirs.filter((t) => !ourIds.has(t.providerEventId));
  const restored: string[] = [];

  for (const notification of missing) {
    const outcome = await applyNotification(notification);
    if (outcome.status === 200 && outcome.handled !== 'replay') {
      restored.push(notification.providerEventId);
    }
  }

  /**
   * **We have it, they do not — alert only.**
   *
   * Never revoked automatically. A missing row on their side is at least as likely
   * to be a late or paginated export as a grant we should not have made, and
   * revoking on it takes a pass away from somebody who paid.
   *
   * **An empty provider response is not an empty diff.** The first draft
   * short-circuited to `[]` when they reported nothing, which silently disabled
   * exactly the case most worth alerting on: an export that returned nothing at
   * all. Zero transactions from them against rows from us is the loudest possible
   * version of "these two disagree".
   */
  const theirSet = new Set(theirIds);
  const unmatched = [...ourIds].filter((id) => !theirSet.has(id));

  if (restored.length > 0 || unmatched.length > 0) {
    console.warn(
      `[reconcile] restored ${restored.length}, unmatched ${unmatched.length} ` +
        `in the window from ${from.toISOString()}`,
    );
  }

  return {
    window: { from, to: now },
    restored,
    unmatched,
    checked: theirs.length,
  };
}

/**
 * The rows a reconcile would flag as unmatched, without acting.
 *
 * Exposed for 016's ops surface: *"show me what is out of sync"* should not have
 * to run the half of the job that writes.
 */
export async function unmatchedSince(
  from: Date,
  theirIds: readonly string[],
): Promise<readonly string[]> {
  const ours = await db()
    .select({ id: paymentEvents.providerEventId })
    .from(paymentEvents)
    .where(gte(paymentEvents.occurredAt, from));

  const theirs = new Set(theirIds);
  return ours.map((row) => row.id).filter((id) => !theirs.has(id));
}

/** Every event we hold in a window, for an ops diff that wants both sides. */
export async function ourEventsSince(from: Date): Promise<readonly string[]> {
  const rows = await db()
    .select({ id: paymentEvents.providerEventId })
    .from(paymentEvents)
    .where(gte(paymentEvents.occurredAt, from));

  return rows.map((row) => row.id);
}

/** Narrow a set of ids to those we have processed. Used by the ops diff. */
export async function known(ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();

  const rows = await db()
    .select({ id: paymentEvents.providerEventId })
    .from(paymentEvents)
    .where(inArray(paymentEvents.providerEventId, [...ids]));

  return new Set(rows.map((row) => row.id));
}
