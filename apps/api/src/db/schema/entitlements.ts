/**
 * What a player is entitled to (011 T005 · FR-007).
 *
 * > **An entitlement belongs to the ACCOUNT, never to the storefront it was
 * > bought through.** There is deliberately **no `storefront` column** on this
 * > table, and `tests/payments/accountLevel.test.ts` asserts its absence.
 *
 * ### Why that is a launch-blocking shape rather than a preference
 *
 * `docs/tech-stack.md` commits to browser at 1.0 and Steam as a fast-follow, with
 * every Steam seam built in advance. The seam that cannot be retrofitted is this
 * one: a player who buys a pass on the web and then links Steam must still hold
 * it, and the reverse. Add a storefront column now and the migration that removes
 * it later has to answer *"which of this account's two identities owns this
 * grant"* — a question with no correct answer once both exist.
 *
 * It is the same shape as Constitution XVI's un-backfillable records. The data to
 * make it right is available only at the moment of writing.
 *
 * ### Grants accumulate; they are never mutated
 *
 * A purchase inserts a row. A refund inserts a `revoked_at` on the row it
 * reverses. **Entitlement is computed from the set** (`entitlements.ts`), never
 * maintained as a running total — because notifications arrive out of order, and a
 * running total updated in arrival order gets a refund-before-purchase pair
 * permanently wrong.
 */

import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { paymentEvents } from './payments.js';

/**
 * What a grant confers. **One gameplay-affecting kind**, and that is the audit
 * surface for *what is sold is speed, never ceiling*.
 */
export const ENTITLEMENT_KINDS = ['boost-pass'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

export const entitlementGrants = pgTable(
  'entitlement_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** **The account. There is no storefront column and there must never be one.** */
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    kind: text('kind').$type<EntitlementKind>().notNull(),

    /** Days of pass this grant confers. Additive — see `entitlements.ts`. */
    daysGranted: integer('days_granted').notNull(),

    /**
     * The notification that produced this grant. **Not nullable**: a grant with no
     * payment event behind it is exactly what FR-011 forbids, and making the
     * column required means no code path can create one by accident.
     */
    providerEventId: text('provider_event_id')
      .notNull()
      .references(() => paymentEvents.providerEventId, { onDelete: 'restrict' }),

    /** When the granted time starts counting. Set by the additive rule, not by arrival. */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),

    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),

    /** Set by a refund or chargeback. **The row stays** — the past is immutable. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('entitlement_grants_account_idx').on(table.accountId, table.startsAt),
  ],
);

export type EntitlementGrantRow = typeof entitlementGrants.$inferSelect;
