/**
 * Who a player is, according to somebody else.
 *
 * ### Steam is a second ROW, never a second column and never a second table
 *
 * The whole provider-agnostic seam is this shape. The alternative designs both
 * look reasonable and both are traps:
 *
 * - **A `googleSub` column plus a `steamId` column** — adding a third provider
 *   is a migration, and "which providers is this account linked to?" becomes a
 *   different query for every provider.
 * - **A separate `steam_accounts` table** — now there are two account tables and
 *   every join in the project has to know which one it is talking about.
 *
 * With rows, adding Steam at 1.1 changes nothing outside this feature
 * (Constitution XIX). The route already exists and returns **501**.
 *
 * ### `providerSubject` is `sub`, and it is never the email
 *
 * **`sub` is the identity; `email` is a mutable attribute.** A player can change
 * their Google email address. Keying on email means that player becomes a
 * different account on their next sign-in — or worse, collides with whoever
 * later acquires the address. This is the single most common way
 * provider-agnostic identity is quietly lost, and it fails silently: everything
 * works until the day somebody changes their email.
 */

import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

export const PROVIDERS = ['google', 'steam'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /**
     * `text` with a TypeScript-level enum and **deliberately no database CHECK
     * constraint.** A CHECK would catch a typo'd provider string, but it would
     * also make adding a third provider a schema migration — which is precisely
     * the coupling the row-per-provider design exists to avoid (Constitution
     * XIX). The values are written in exactly one place in the codebase and
     * never come from a request body, so the typo it would guard against cannot
     * reach here.
     */
    provider: text('provider', { enum: PROVIDERS }).notNull(),

    /**
     * The provider's own stable subject — Google's `sub`, Steam's 64-bit id.
     * `text` rather than a numeric type because Steam ids exceed 2^53 and
     * Google's is opaque; neither is ever arithmetic.
     */
    providerSubject: text('provider_subject').notNull(),

    /**
     * **Contact only, and it is allowed to be stale.** Never read for identity,
     * never joined on, never used to find an account. Nullable because Steam
     * does not supply one.
     */
    email: text('email'),

    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **The constraint the whole design rests on.** One provider subject maps to
     * exactly one account, forever. Without it, two sign-ins racing on a
     * first-time account creation both insert, and the player ends up with two
     * accounts and no way to say which one is theirs.
     */
    uniqueIndex('identities_provider_subject_unique').on(table.provider, table.providerSubject),
    // "Which providers is this account linked to?" — the /v1/me query.
    index('identities_account_id_idx').on(table.accountId),
  ],
);

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;
