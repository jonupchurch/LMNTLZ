/**
 * Custom avatar submissions, and the queue a human works through (012 T028–T033).
 *
 * ### Why a table rather than a column with a `pending` flag
 *
 * A resubmission is **a new submission with a new fee** (FR-012 charges *per
 * change*), so the history is the thing being charged for. A flag on `accounts`
 * could not say how many times somebody has paid, which is exactly the number the
 * throttle depends on.
 *
 * ### The rejection reasons are harm-only, enforced by the type
 *
 * Constitution XVIII: **harm is a gate, taste is a note.** There is deliberately
 * no `low-quality` member, so a reviewer who wants to reject on taste has no value
 * to submit — the enum refuses before any policy document has to be consulted.
 * **A $5 ugly avatar is approved.**
 */

import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

export const AVATAR_STATES = ['pending', 'approved', 'rejected'] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

/**
 * **Harm only.** Adding a member here is a policy change and should read like
 * one; adding `low-quality` would silently convert a harm gate into a taste gate.
 */
export const HARM_REASONS = ['hate', 'sexual', 'impersonation', 'violence'] as const;
export type HarmReason = (typeof HARM_REASONS)[number];

export const avatarSubmissions = pgTable(
  'avatar_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    state: text('state', { enum: AVATAR_STATES }).notNull().default('pending'),

    /**
     * The **private** blob key, never a public URL.
     *
     * An unapproved avatar must not be reachable by URL while it sits in the
     * queue, and a public store cannot express that — the same reason replays
     * live in a private store. `profiles/avatar.ts` mints a short-lived upload
     * URL against this key; nothing hands it out for reading until approval.
     */
    blobKey: text('blob_key').notNull(),

    /**
     * What it cost, recorded rather than assumed.
     *
     * The price is a constant today and will not always be. A refund dispute or a
     * repricing both need to know what *this* submission was charged, and neither
     * can be answered by reading the current constant.
     */
    paidShards: integer('paid_shards'),
    paidCents: integer('paid_cents'),

    rejectedReason: text('rejected_reason', { enum: HARM_REASONS }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),

    /** The moderator. Feature 015 owns operator identity; null until it lands. */
    decidedBy: uuid('decided_by').references(() => accounts.id, { onDelete: 'set null' }),
  },
  (table) => [
    /** The queue: everything pending, oldest first. */
    index('avatar_submissions_state_submitted_idx').on(table.state, table.submittedAt),
    index('avatar_submissions_account_idx').on(table.accountId, table.submittedAt),
  ],
);

export type AvatarSubmission = typeof avatarSubmissions.$inferSelect;
