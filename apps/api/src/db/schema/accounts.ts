/**
 * The account. **The most expensive table in the project to get wrong**, which
 * is why it lands in migration one rather than when something needs it.
 *
 * ### `id` and `username` are two columns and must never be one
 *
 * `id` is an **immutable internal identifier** that every other table in the
 * project points at. `username` is a mutable display string the player chooses.
 * Collapsing them — keying rows on the name — makes a rename rewrite every
 * foreign key in the schema.
 *
 * That is not hypothetical here: **moderation makes forced rename a real
 * action** (feature 015). With an internal identifier a forced rename is one
 * `UPDATE` on one column. Without one it is a migration across every table that
 * ever referenced a player, run while people are online. Constitution XVI —
 * this is the archetype of the thing that cannot be retrofitted.
 *
 * ### `username` and `username_key` are also two columns, for a different reason
 *
 * The display form is stored **exactly as the player typed it**, NFC-normalised
 * and nothing more. The key is a lossy skeleton used only for uniqueness, and
 * **neither is ever reconstructed from the other** — rendering the key back to a
 * player would show them a name they did not choose.
 */

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** How wide a ban reaches. `null` in `banScope` means no ban has ever applied. */
export const BAN_SCOPES = ['chat', 'guild', 'full'] as const;
export type BanScope = (typeof BAN_SCOPES)[number];

export const accounts = pgTable(
  'accounts',
  {
    /**
     * Immutable. **Nothing may key on anything else**, and no route accepts it
     * from a request body — it comes from the verified session (`context.ts`).
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * What the player typed, NFC-normalised. **Not unique** — uniqueness is
     * `usernameKey`'s job, and putting a constraint here too would reject a
     * legitimately distinct name that merely skeletonises the same way as its
     * own previous form.
     */
    username: text('username').notNull(),

    /**
     * The uniqueness key, computed in three steps:
     *
     * ```
     * 1  NFKD normalise, strip combining marks   "Ｒéyna" → "Reyna"
     * 2  case-fold                                "Reyna" → "reyna"
     * 3  confusable skeleton (Unicode TR39)       "rеynа" → "reyna"   ← Cyrillic е, а
     * ```
     *
     * **Steps 1 and 2 are hygiene; step 3 is the security control.** A
     * case-insensitive collision is a support ticket. A *homoglyph* collision is
     * an impersonation vector, and this game has guild masters, an officer role
     * and public profiles — "the guild master is asking you to hand over the
     * emblem" is a live attack the moment somebody can register a Cyrillic
     * lookalike of the guild master's name.
     *
     * Computed in application code rather than as a generated column: step 3
     * needs a Unicode confusables table Postgres does not ship.
     */
    usernameKey: text('username_key').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * **A timestamp, not a boolean.** Most bans are temporary, and a boolean
     * would need a separate expiry column plus a job to flip it — which is a job
     * that can fail, leaving somebody banned after their time. An expiry in the
     * past simply stops applying, with nothing to run.
     */
    bannedUntil: timestamp('banned_until', { withTimezone: true }),

    /** `null` unless `bannedUntil` is set. Feature 015 owns the values. */
    banScope: text('ban_scope', { enum: BAN_SCOPES }),

    /**
     * How many battles this account walked away from (007 T007, FR-013).
     *
     * **A counter here rather than a row in `battles`, and the distinction is
     * not bookkeeping.** Recording *that* somebody abandoned a battle is a fact
     * about the player; recording it as a battle would put a fight nobody
     * finished into the table every aggregate in feature 008 reads — turn
     * counts, hold rates, league thresholds, hero pick rates would all quietly
     * include contests that never happened.
     *
     * Constitution XVI keeps those records forever, so a row added here in
     * error cannot be reasoned away later. The cheap version is a number on the
     * account, and the cheap version is also the correct one.
     */
    abandonedBattles: integer('abandoned_battles').notNull().default(0),
  },
  (table) => [
    uniqueIndex('accounts_username_key_unique').on(table.usernameKey),
    // Feature 015 lists currently-banned accounts; feature 009 excludes them
    // from matchmaking. Both scan on this and neither wants a seq scan.
    index('accounts_banned_until_idx').on(table.bannedUntil),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
