/**
 * Processed provider notifications (011 T004).
 *
 * **`provider_event_id` is the PRIMARY KEY, and it is *theirs*.**
 *
 * That single choice is the whole idempotency story. Retries are the normal case
 * for a payment webhook — providers retry on any non-2xx, on a timeout, and
 * sometimes simply twice — so "process exactly once" cannot be a convention, it
 * has to be a constraint the database enforces.
 *
 * ### Why not a key we derive
 *
 * A key derived from `(account_id, sku, amount)` looks equivalent and is not: the
 * same person buying the same pass twice is **a legitimate second purchase**, and
 * a derived key silently de-duplicates it away. They paid twice and hold one pass,
 * with no error anywhere — a revenue defect and a support case at once, and the
 * kind that is only ever discovered by the customer.
 *
 * `tests/payments/idempotency.test.ts` pins exactly that case: the same account,
 * sku and amount 45 seconds apart must grant **twice**.
 *
 * ### An `INSERT` that conflicts is the guard, not a preceding `SELECT`
 *
 * `webhook.ts` inserts first and treats a unique violation as *"already handled,
 * answer 200"*. A check-then-act would leave the window two concurrent retries
 * need, and two concurrent retries is precisely what a provider does when the
 * first one times out.
 */

import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/** The kinds of notification the rail normalises to. Text, not an enum — 016 adds `comp`. */
export const NOTIFICATION_KINDS = ['purchase', 'refund', 'chargeback', 'comp'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const paymentEvents = pgTable(
  'payment_events',
  {
    /** **The provider's id.** Primary key, so a replay cannot be processed twice. */
    providerEventId: text('provider_event_id').primaryKey(),

    kind: text('kind').$type<NotificationKind>().notNull(),

    /**
     * Nullable, and **`set null` on delete rather than cascade**. A payment is a
     * financial record: deleting the account must not delete the evidence that
     * money changed hands, or a chargeback arrives with nothing to answer it.
     */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),

    sku: text('sku').notNull(),
    /** Cents. Integer, because floating-point money is a defect waiting for a rounding. */
    amount: integer('amount').notNull(),

    /** **The provider's timestamp**, which is what orders an out-of-order pair. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    /** The purchase a refund or chargeback reverses, when the provider says. */
    reverses: text('reverses'),

    /**
     * The raw normalised notification, kept for support and dispute handling.
     * **Not the raw body** — that can carry card metadata we have no reason to
     * hold and every reason not to.
     */
    payload: jsonb('payload').notNull(),

    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Reconciliation diffs a 48-hour window by provider time. */
    index('payment_events_occurred_idx').on(table.occurredAt),
    index('payment_events_account_idx').on(table.accountId),
  ],
);

export type PaymentEventRow = typeof paymentEvents.$inferSelect;
