/**
 * The one grant path (011 T013, T014, T016).
 *
 * **Every entitlement in the system is created here and nowhere else.** FR-011 is
 * enforced by absence: there is no internal grant function a route can reach, and
 * `entitlement_grants.provider_event_id` is `NOT NULL` with a foreign key, so a
 * grant without a payment event behind it cannot be written even by mistake.
 *
 * An operator's comped pass (feature 016) comes through *this* handler with a
 * synthetic event of kind `comp` (T016). That is deliberate rather than
 * convenient: a second path would be a second place to get idempotency wrong, and
 * the comp path is the one nobody load-tests.
 *
 * ### The seven steps, in this order
 *
 * ```
 * 1. verify the signature   over RAW BYTES, before anything reads the body
 * 2. parse                  only now is JSON.parse allowed to run
 * 3. claim the event        INSERT the provider's id; a conflict means done
 * 4. dispatch by kind       purchase grants · refund/chargeback revokes
 * 5. apply                  additive extension, or revocation
 * 6. commit                 3-5 in one transaction
 * 7. answer 200             including for a replay — see below
 * ```
 *
 * ### Step 1 takes bytes, and step 2 is *after* it
 *
 * A signature covers the exact bytes that were sent. Parse first and you verify
 * against a **re-serialisation** — different key order, different whitespace,
 * different unicode escaping — and the mismatch is silent and intermittent, which
 * is the worst pair of properties a security check can have.
 * `tests/payments/signature.test.ts` posts a correctly-signed body with unusual
 * key order and a unicode escape precisely to catch a parse-and-reserialise
 * implementation that passes every ordinary test.
 *
 * ### A replay answers 200, not 409
 *
 * Retries are the **normal case**. A provider that receives anything but a 2xx
 * retries, so answering 409 to a duplicate produces an infinite retry loop over an
 * event that was handled correctly the first time. The duplicate is not an error;
 * it is the protocol working.
 */

import { db } from '../db/client.js';
import { paymentEvents } from '../db/schema/payments.js';
import { getRail, type RailNotification } from './rail.js';
import { grantFromNotification, revokeForNotification } from './entitlements.js';
import { contactAddress, sendReceipt } from './receipt.js';

export type WebhookOutcome =
  | { readonly status: 200; readonly handled: 'granted' | 'revoked' | 'ignored' | 'replay' }
  | { readonly status: 400; readonly reason: 'bad-signature' | 'unparseable' };

/**
 * Handle one notification.
 *
 * `raw` is a `Uint8Array` and not a string, so there is no encoding step between
 * the socket and the signature check.
 */
export async function handleNotification(
  raw: Uint8Array,
  signature: string,
): Promise<WebhookOutcome> {
  const rail = getRail();

  // 1. Signature, over the raw bytes. Nothing has read the body yet.
  const valid = await rail.verifyNotification(raw, signature);
  if (!valid) return { status: 400, reason: 'bad-signature' };

  // 2. Only now.
  let notification: RailNotification;
  try {
    notification = rail.parseNotification(raw);
  } catch {
    return { status: 400, reason: 'unparseable' };
  }

  return applyNotification(notification);
}

/**
 * Steps 3–6, split out so `reconcile.ts` and 016's comp path reach the same
 * logic without re-signing a synthetic body.
 *
 * **The claim is an INSERT, not a SELECT-then-INSERT.** Two concurrent retries is
 * exactly what a provider does when the first attempt times out, and a
 * check-then-act leaves precisely the window they race through. A unique violation
 * is the answer, not an error.
 */
export async function applyNotification(
  notification: RailNotification,
): Promise<WebhookOutcome> {
  const claimed = await db()
    .insert(paymentEvents)
    .values({
      providerEventId: notification.providerEventId,
      kind: notification.kind,
      accountId: notification.accountId,
      sku: notification.sku,
      amount: notification.amount,
      occurredAt: notification.occurredAt,
      reverses: notification.reverses ?? null,
      payload: notification as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: paymentEvents.providerEventId })
    .returning({ id: paymentEvents.providerEventId });

  /** Zero rows means somebody already handled this. The protocol working. */
  if (claimed.length === 0) return { status: 200, handled: 'replay' };

  if (notification.kind === 'purchase' || notification.kind === 'comp') {
    await grantFromNotification(notification);

    /**
     * **The receipt, after the grant and never in front of it.**
     *
     * `sendReceipt` cannot throw and returns `false` when there is no mailer, no
     * address, or the send failed — all three are ordinary states. A Steam-only
     * account has no address at all, and that purchase is perfectly valid.
     *
     * It must not be able to affect the return value: answering the provider
     * non-2xx because a mail server was slow makes them retry a **working
     * payment**, and the retry would find the event already claimed and do nothing
     * except generate load and alarm.
     */
    const to = await contactAddress(notification.accountId);
    if (to) await sendReceipt(notification, to);

    return { status: 200, handled: 'granted' };
  }

  if (notification.kind === 'refund' || notification.kind === 'chargeback') {
    const revoked = await revokeForNotification(notification);
    return { status: 200, handled: revoked > 0 ? 'revoked' : 'ignored' };
  }

  /* c8 ignore next -- the kind union is exhausted above. */
  return { status: 200, handled: 'ignored' };
}
