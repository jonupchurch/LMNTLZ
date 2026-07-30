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

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** How wide a ban reaches. `null` in `banScope` means no ban has ever applied. */
export const BAN_SCOPES = ['chat', 'guild', 'full'] as const;
export type BanScope = (typeof BAN_SCOPES)[number];

/**
 * Which pool a bot was authored for (009 · FR-015).
 *
 * **The one bit of a bot that its gear score cannot tell you.** For every other band
 * the label is derivable — `leagueOf(gearScore)` says it — but the *starter* ramp is
 * deliberately built across the Bronze floor: bots 1–5 carry no rune fill and sit
 * *below* the 1,500 grant every real account starts with, while bots 13–20 *"set the
 * graduation standard"* and therefore sit at or above it. `leagueOf` clamps
 * everything under the floor to `bronze`, so the two ends of one authored ramp would
 * come back as different bands.
 *
 * So this is not derived data stored twice (Constitution XV) — it is the authoring
 * intent, which is what the starter pool has to select on.
 */
export const BOT_BANDS = ['starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type BotBand = (typeof BOT_BANDS)[number];

/**
 * Why an account is no longer in the starter league (009 · FR-022).
 *
 * Four exits, and the reason is worth keeping rather than collapsing to a boolean:
 * *which* door a player left by is the only measure of whether the week is the right
 * length. If everybody leaves on `time` the shard cap is doing nothing; if everybody
 * leaves on `shards` the week is too long.
 *
 * **`time` never appears in this column**, and that is deliberate — see
 * `starterLeague.ts`. It is derived from `created_at`, so it needs no write and
 * therefore no job that could fail and leave somebody protected past their week.
 */
export const STARTER_EXIT_REASONS = ['time', 'shards', 'voluntary', 'guild'] as const;
export type StarterExitReason = (typeof STARTER_EXIT_REASONS)[number];

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
     * The chosen **curated** avatar, or null for the default (012 T027).
     *
     * Curated avatars need no review, which is why they are a plain column: the
     * whole set ships with the client, the value is validated against it, and
     * nothing a player can type reaches a screen.
     */
    avatarKey: text('avatar_key'),

    /**
     * An **approved** custom avatar. Wins over `avatarKey` when set.
     *
     * ### Two columns rather than one, because the invariant is the point
     *
     * A single `avatar` column holding either kind would make "is this image
     * approved?" a question about the *format of a string*, and the pre-moderation
     * rule (FR-013) is the one rule in this feature whose failure cannot be undone
     * — a bad image seen by every opponent stays seen.
     *
     * With two columns the invariant is structural: **this column is written by
     * exactly one code path, the approval, and by nothing else.** A pending
     * submission lives in `avatar_submissions` and has no way to reach a profile,
     * because no profile query reads that table.
     */
    customAvatarUrl: text('custom_avatar_url'),

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

    /**
     * **A bot is an account** (009 · settled). Not a parallel table, not a shadow
     * type — a row here with no identity in `identities`, so nothing can sign into
     * one and every table that points at `accounts.id` works unchanged.
     *
     * The cost of that choice is that **every aggregate must remember to exclude
     * bots**, and forgetting is silent. Two things mitigate it: the flag is
     * `notNull` with a `false` default so it is never ambiguous, and
     * `battle_records.defender_is_bot` already carries the same fact on the row
     * feature 008 actually queries — so a balance question answered from the battle
     * record cannot be polluted even if a bot slips into a player query.
     */
    isBot: boolean('is_bot').notNull().default(false),

    /** `null` for a real player. Non-null exactly when `is_bot`. */
    botBand: text('bot_band', { enum: BOT_BANDS }),

    /**
     * When this account left the starter league, or `null` if it never has.
     *
     * **A timestamp rather than a boolean, and the same argument as `bannedUntil`
     * one field up** — except inverted. Leaving is *permanent*, so what a boolean
     * would lose is not correctness but the answer to *when*: a week whose players
     * all leave on day two is a week that is not working, and that question cannot
     * be asked of a flag.
     *
     * **Null does not mean "in the starter league."** The time exit is derived from
     * `created_at`, so an account seven days old has left with nothing written here.
     * `starterStatus()` is the only correct reader of this column.
     */
    starterExitedAt: timestamp('starter_exited_at', { withTimezone: true }),

    /** Why they left. `null` while `starterExitedAt` is null. Never `'time'`. */
    starterExitReason: text('starter_exit_reason', { enum: STARTER_EXIT_REASONS }),
  },
  (table) => [
    uniqueIndex('accounts_username_key_unique').on(table.usernameKey),
    // Feature 015 lists currently-banned accounts; feature 009 excludes them
    // from matchmaking. Both scan on this and neither wants a seq scan.
    index('accounts_banned_until_idx').on(table.bannedUntil),
    /**
     * **Partial, because bots are a rounding error of the table.** The derived floor
     * is ~66 bots against every account ever created, so an index on the whole
     * column would be useless for the `false` case and is unnecessary for it — no
     * query asks for "every human". Every query asks for the bots.
     */
    index('accounts_bot_band_idx').on(table.botBand).where(sql`${table.isBot}`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
