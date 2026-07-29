/**
 * Every rename, kept.
 *
 * ### Why history rather than a counter on `accounts`
 *
 * The rule is *three changes per rolling 30 days*, and a counter cannot express
 * a rolling window — it would need a reset job, and a reset job is a thing that
 * can fail at 3am and either lock somebody out of a rename or hand them
 * unlimited ones. Rows with timestamps answer the question by counting, with
 * nothing scheduled.
 *
 * ### And because moderation needs it
 *
 * A forced rename (feature 015) has to be distinguishable from a voluntary one:
 * it is free, and it does not consume the player's allowance — they did not
 * choose it. Without `forced` there is no way to tell them apart after the fact,
 * and a moderator's action would silently spend the player's quota.
 *
 * The previous name is kept because a report naming somebody who has since
 * renamed is otherwise unresolvable.
 */

import { index, pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

export const usernameChanges = pgTable(
  'username_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /** What it was. Kept so a stale moderation report stays resolvable. */
    previousUsername: text('previous_username').notNull(),
    newUsername: text('new_username').notNull(),

    /**
     * **A moderation action, not the player's choice.** Free, and does not
     * consume their allowance — charging somebody for a rename they did not ask
     * for would be a second punishment nobody decided on.
     */
    forced: boolean('forced').notNull().default(false),

    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The rolling-window count: by account, ordered by time.
    index('username_changes_account_changed_idx').on(table.accountId, table.changedAt),
  ],
);

export type UsernameChange = typeof usernameChanges.$inferSelect;
