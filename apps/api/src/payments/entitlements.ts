/**
 * What a player holds, computed from the set of grants (011 T015, T017, T018, T023).
 *
 * ### Computed from the set, never mutated in arrival order
 *
 * The obvious implementation keeps `expires_at` on the account and moves it
 * forward on each purchase. It is wrong for one reason that is guaranteed rather
 * than unlikely: **notifications arrive out of order.** A refund can land before
 * the purchase it reverses — providers retry independently, and a webhook that
 * timed out is redelivered behind newer traffic.
 *
 * A running total processes *refund of P* against a state where P was never
 * applied, subtracts nothing, then applies P and leaves the player holding time
 * they were refunded for. **Recomputing from the set has no such state**: the
 * answer depends only on which rows exist, not on the order they arrived in.
 *
 * `tests/payments/outOfOrder.test.ts` sends the pair backwards and asserts the
 * same answer as forwards.
 *
 * ### Additive extension: a purchase extends, it never replaces
 *
 * Buying a 7-day pass with 20 days left leaves 27 days, not 7 (FR-002). Anything
 * else silently destroys time a player already paid for, and it is the exact
 * moment they are most likely to notice — they just gave you money.
 *
 * ### There is no internal grant function reachable from a route
 *
 * **FR-011 is enforced by absence** (T015). Every grant in this file requires a
 * `providerEventId`, and the column is `NOT NULL` with a foreign key to
 * `payment_events`. There is no `grantPass(accountId, days)` anywhere — not for
 * tests, not for admin, not for comps. An operator's comped pass goes through the
 * *same* webhook handler with a synthetic event of kind `comp` (T016), so there is
 * exactly one path from "something happened" to "a player holds a pass", and it is
 * the one with the idempotency key on it.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { entitlementGrants, type EntitlementKind } from '../db/schema/entitlements.js';
import { paymentEvents } from '../db/schema/payments.js';
import type { RailNotification } from './rail.js';
import { skuById } from './catalog.js';

const DAY_MS = 86_400_000;

export interface Entitlement {
  readonly kind: EntitlementKind;
  /** `null` when the player holds nothing of this kind. */
  readonly expiresAt: Date | null;
  readonly daysRemaining: number;
  readonly active: boolean;
}

/**
 * Fold a player's live grants into a single expiry.
 *
 * **Days are additive from the later of `now` and the running end**, which is what
 * makes extension work without ever letting a lapsed pass backdate: a grant bought
 * after a gap starts today, and one bought while time remains starts where the
 * remaining time ends.
 *
 * Revoked rows are excluded by the query rather than subtracted, because a refund
 * removes *that grant's* days wherever they sat — subtracting from the end would
 * take days off a different, still-valid purchase.
 */
export async function entitlementFor(
  accountId: string,
  kind: EntitlementKind = 'boost-pass',
  now: Date = new Date(),
): Promise<Entitlement> {
  const grants = await db()
    .select()
    .from(entitlementGrants)
    .where(
      and(
        eq(entitlementGrants.accountId, accountId),
        eq(entitlementGrants.kind, kind),
        isNull(entitlementGrants.revokedAt),
      ),
    );

  if (grants.length === 0) {
    return { kind, expiresAt: null, daysRemaining: 0, active: false };
  }

  /**
   * **Ordered by when the grant's time was meant to start, not by arrival.** Two
   * grants that arrived backwards must fold to the same total as forwards, and
   * `startsAt` is the only field that carries that ordering.
   */
  const ordered = [...grants].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  let end = 0;
  for (const grant of ordered) {
    const from = Math.max(grant.startsAt.getTime(), end);
    end = from + grant.daysGranted * DAY_MS;
  }

  const expiresAt = new Date(end);
  const remaining = Math.max(0, end - now.getTime());

  return {
    kind,
    expiresAt,
    daysRemaining: Math.ceil(remaining / DAY_MS),
    active: remaining > 0,
  };
}

/**
 * Where a new grant's time should start — **now, or the end of what is already
 * held, whichever is later.**
 */
export async function startsAtFor(
  accountId: string,
  kind: EntitlementKind,
  now: Date,
): Promise<Date> {
  const held = await entitlementFor(accountId, kind, now);
  if (!held.active || !held.expiresAt) return now;
  return held.expiresAt;
}

/**
 * Record a grant for a processed notification.
 *
 * **Not exported beyond this module's own callers by convention — exported for the
 * webhook handler alone.** It takes a `RailNotification` rather than loose
 * arguments precisely so it cannot be called without one: there is no shape of
 * this call that does not carry a provider event id.
 */
export async function grantFromNotification(
  notification: RailNotification,
  tx: Pick<ReturnType<typeof db>, 'insert' | 'select' | 'update'> = db(),
): Promise<void> {
  const sku = skuById(notification.sku);
  if (!sku) return;

  /**
   * **Was this purchase already reversed before it arrived?**
   *
   * Sorting the fold by `startsAt` makes the *arithmetic* order-independent, and
   * that is not sufficient on its own: a refund that lands first finds no grant to
   * revoke and does nothing, and the purchase behind it then creates a live grant
   * for money that was returned. The player holds a pass they were refunded for,
   * and nothing anywhere is in an error state.
   *
   * So the grant asks the question the other way round. The reversal is already in
   * `payment_events` — `webhook.ts` claims every notification it processes,
   * including ones it could not act on — so the evidence is there to be found.
   */
  const reversals = await tx
    .select({ occurredAt: paymentEvents.occurredAt })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.reverses, notification.providerEventId),
        inArray(paymentEvents.kind, ['refund', 'chargeback']),
      ),
    )
    .limit(1);

  const alreadyReversed = reversals[0];

  const startsAt = await startsAtFor(notification.accountId, sku.grants, notification.occurredAt);

  await tx.insert(entitlementGrants).values({
    accountId: notification.accountId,
    kind: sku.grants,
    daysGranted: sku.days,
    providerEventId: notification.providerEventId,
    startsAt,
    /** Born revoked, so the backwards pair folds to the same answer as forwards. */
    revokedAt: alreadyReversed?.occurredAt ?? null,
  });
}

/**
 * Revoke the grants a refund or chargeback reverses (T017, FR-014).
 *
 * **The row is marked, never deleted.** A deleted grant leaves no evidence that
 * the player ever held the pass, which is exactly what a dispute needs to see —
 * and `reconcile.ts` diffs against the provider on the assumption that our history
 * is complete.
 *
 * When the provider names the purchase being reversed we revoke that one; when it
 * does not, we revoke the most recent unrevoked grant for the account, which is
 * the only defensible guess and is recorded as one.
 */
export async function revokeForNotification(
  notification: RailNotification,
  tx: Pick<ReturnType<typeof db>, 'select' | 'update'> = db(),
): Promise<number> {
  const target = notification.reverses;

  if (target) {
    const revoked = await tx
      .update(entitlementGrants)
      .set({ revokedAt: notification.occurredAt })
      .where(
        and(
          eq(entitlementGrants.providerEventId, target),
          isNull(entitlementGrants.revokedAt),
        ),
      )
      .returning({ id: entitlementGrants.id });

    return revoked.length;
  }

  const candidates = await tx
    .select()
    .from(entitlementGrants)
    .where(
      and(
        eq(entitlementGrants.accountId, notification.accountId),
        isNull(entitlementGrants.revokedAt),
      ),
    );

  const newest = [...candidates].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  if (!newest) return 0;

  await tx
    .update(entitlementGrants)
    .set({ revokedAt: notification.occurredAt })
    .where(eq(entitlementGrants.id, newest.id));

  return 1;
}
