/**
 * The confirmation email (011 T027 · FR-018).
 *
 * **The statement descriptor is the point of this email**, not a footnote in it.
 * A cardholder looking at a line they do not recognise goes to their bank, not to
 * us — a dispute costs a fee and a chargeback ratio regardless of who was right.
 * The one artifact they can search their inbox for is this message, so the
 * descriptor appears in the subject line and again in the body, in the same
 * characters that will show on the statement.
 *
 * ### The email is best-effort and never blocks a grant
 *
 * A send failure must not fail the webhook. The player has paid and the
 * entitlement is already recorded by the time this runs; answering the provider
 * with a non-2xx because an email bounced would make them retry the *notification*,
 * which is a working payment being reprocessed because a mail server was slow.
 *
 * ### The vendor is behind an interface, like the payment rail
 *
 * Constitution XIX, and the same reason: `tests/payments/grantPath.test.ts` scans
 * `src/` for vendor names outside `payments/vendor/`. The mailer is injected,
 * so every test here runs without an account and without sending mail.
 */

import { desc, eq, isNotNull, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { identities } from '../db/schema/identities.js';
import { entitlementFor } from './entitlements.js';
import { skuById } from './catalog.js';
import type { RailNotification } from './rail.js';

/**
 * What the charge will look like on a statement.
 *
 * ⚠️ **A placeholder until T042.** The real string must be read from the live
 * provider dashboard rather than guessed — a descriptor that differs from the
 * actual one by even a word is worse than none, because it teaches the cardholder
 * that the email and the statement disagree.
 */
export const STATEMENT_DESCRIPTOR = process.env['STATEMENT_DESCRIPTOR'] ?? 'LMNTLZ';

export interface Email {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

let mailer: Mailer | null = null;

/** Install a mailer. **Returns the undo**, so a test cannot leak one. */
export function setMailer(next: Mailer | null): () => void {
  const previous = mailer;
  mailer = next;
  return () => {
    mailer = previous;
  };
}

export function mailerInstalled(): boolean {
  return mailer !== null;
}

/** The body a purchase confirmation carries. Pure, so its content is testable. */
export function receiptBody(
  notification: RailNotification,
  daysRemaining: number,
): Email | null {
  const sku = skuById(notification.sku);
  if (!sku) return null;

  const dollars = (notification.amount / 100).toFixed(2);

  return {
    to: '',
    /** The descriptor is in the subject so an inbox search for it finds this. */
    subject: `Your LMNTLZ boost pass — charged as "${STATEMENT_DESCRIPTOR}"`,
    text: [
      `Thanks — your ${sku.days}-day boost pass is active.`,
      ``,
      `What you bought:  ${sku.days}-day boost pass`,
      `Amount:           $${dollars} USD`,
      `On your statement this appears as: ${STATEMENT_DESCRIPTOR}`,
      ``,
      `You now have ${daysRemaining} days of pass time. A pass doubles the shards`,
      `you earn from your first 10 attack victories and first 10 defensive holds`,
      `each day. It does not grant shards directly and it raises no ceiling — a`,
      `fully kitted player with a pass and one without are exactly equal.`,
      ``,
      `NOTHING AUTO-RENEWS. This is a one-off purchase. There is no subscription`,
      `to cancel and you will not be charged again unless you buy another pass.`,
      ``,
      `Reference: ${notification.providerEventId}`,
    ].join('\n'),
  };
}

/**
 * Send the confirmation. **Never throws** — a mail failure is logged and dropped.
 *
 * Returns whether anything was sent, so a caller that wants to assert on it can,
 * without the return value being load-bearing for the payment.
 */
/**
 * The contact address for an account, or `null`.
 *
 * **`identities.email` is contact-only and allowed to be stale** — that file says
 * so at length, because keying identity on a mutable attribute is how a player who
 * changes their Google address becomes a stranger. Reading it *for contact* is the
 * one thing it is for.
 *
 * `null` is an ordinary outcome, not a failure: Steam supplies no address, so a
 * Steam-only account has nowhere to send a receipt and the purchase is still
 * perfectly valid.
 */
export async function contactAddress(accountId: string): Promise<string | null> {
  const [row] = await db()
    .select({ email: identities.email })
    .from(identities)
    .where(and(eq(identities.accountId, accountId), isNotNull(identities.email)))
    .orderBy(desc(identities.linkedAt))
    .limit(1);

  return row?.email ?? null;
}

export async function sendReceipt(
  notification: RailNotification,
  to: string,
): Promise<boolean> {
  if (!mailer || !to) return false;

  const held = await entitlementFor(notification.accountId, 'boost-pass', notification.occurredAt);
  const body = receiptBody(notification, held.daysRemaining);
  if (!body) return false;

  try {
    await mailer.send({ ...body, to });
    return true;
  } catch (err) {
    /** The message, never the key. */
    console.warn(`[receipt] could not send for ${notification.providerEventId}: ${String(err)}`);
    return false;
  }
}
