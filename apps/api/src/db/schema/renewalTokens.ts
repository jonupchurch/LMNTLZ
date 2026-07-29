/**
 * Refresh-credential state. **Rotate on use, store only a hash, and group tokens
 * into a family.**
 *
 * ### The retry problem, and why a grace period is the wrong answer
 *
 * Rotation on use detects theft: if a token is ever presented twice, one of the
 * two presenters is not the owner. But a client whose renewal request times out
 * mid-flight will retry with the same token, and a naive implementation
 * revokes a legitimate session for a dropped packet.
 *
 * The common fix is a grace period — accept the old token for N seconds. **That
 * is wrong, and it fails in the direction that matters**: it hands a genuine
 * thief a genuinely valid credential for N seconds, which is the entire attack.
 *
 * The fix here is a **bounded idempotency window** instead. A replay inside 60
 * seconds returns *the pair that was already issued*, byte-identical, rather than
 * minting a new one — provided that pair has not itself been used yet. The
 * moment the successor is used, the old token is dead and presenting it kills
 * the whole family. So the honest retry gets its answer and the thief gets
 * nothing, and the two cases are distinguished by *whether the new pair was
 * consumed* rather than by a clock.
 *
 * `issuedPair` exists solely to make that possible: you cannot return the same
 * pair twice unless you kept it.
 */

import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/** How long a replay of an already-rotated token returns the same pair. */
export const IDEMPOTENCY_WINDOW_SECONDS = 60;

export const renewalTokens = pgTable(
  'renewal_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /**
     * **One family per sign-in.** Theft is detected on a single token and
     * answered on the whole family — killing one token would leave the thief
     * holding the successor they already minted.
     */
    familyId: uuid('family_id').notNull(),

    /**
     * `sha256(token)`. **The raw token is never stored.** A database leak is
     * then a leak of hashes rather than a leak of live sessions.
     *
     * No salt and no slow KDF, deliberately: these are 256-bit random values,
     * not passwords. There is no dictionary to attack and no rainbow table to
     * build, and a slow hash here would add latency to the single most frequent
     * authenticated call in the game.
     */
    tokenHash: text('token_hash').notNull(),

    /** The token that replaced this one. `null` while this is the live tip. */
    replacedBy: uuid('replaced_by'),

    /**
     * The access/renewal pair this rotation minted, kept **only** for the
     * idempotency window so an honest retry gets a byte-identical answer.
     * Cleared by the cleanup cron once `usedAt` is older than the window.
     */
    issuedPair: text('issued_pair'),

    /** When this token was presented. `null` means it is still unused. */
    usedAt: timestamp('used_at', { withTimezone: true }),

    /**
     * Set on every token in a family the moment theft is detected. A row with
     * this set is dead regardless of `usedAt` or `expiresAt`.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The lookup on every single renewal — it must be an index seek.
    uniqueIndex('renewal_tokens_token_hash_unique').on(table.tokenHash),
    // Killing a family touches every row in it.
    index('renewal_tokens_family_id_idx').on(table.familyId),
    // "Sign me out everywhere", and feature 015's ban action.
    index('renewal_tokens_account_id_idx').on(table.accountId),
    // The cleanup cron sweeps on this.
    index('renewal_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export type RenewalToken = typeof renewalTokens.$inferSelect;
export type NewRenewalToken = typeof renewalTokens.$inferInsert;
