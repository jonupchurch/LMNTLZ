/**
 * Chat, in **its own file and its own tables** (014 T002).
 *
 * ### Separate from the outset, because the split is the cheap part today
 *
 * FR-009 asks for chat to be separable later. Doing that now costs a file; doing
 * it after chat has grown foreign keys into six other features costs a rewrite.
 * Nothing here references anything but `accounts` and `guilds`, and both of those
 * references are `onDelete: 'cascade'` rather than a join the read path depends
 * on — so lifting these three tables out is a `pg_dump` of a table list.
 *
 * ### The scope is a string key, and it carries a `lang` slot nothing uses yet
 *
 * `global:all` and `ads:all` today, because **the language split is deferred**
 * (FR-002, decided 2026-07-30 — there is no language data anywhere in the game).
 * The slot exists so that turning the split on is a data migration and a changed
 * default, rather than a rename of every channel, every token and every row ever
 * stored. See `chat/scopes.ts`.
 *
 * ### `ad_credits` is a rate cap wearing a table, and must not become a balance
 *
 * FR-017/FR-018: two free credits a day, a hard cap of four, and **unused credits
 * do not accumulate**. `granted` and `used` are per **day**, keyed by date — there
 * is deliberately no running total anywhere, because a stockpile that happens to
 * be limited is one refactor away from being a stockpile. The uniqueness on
 * `(guild_id, day)` is what makes "today's credits" a row rather than a sum.
 */

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { guilds } from './guilds.js';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The full scope key, e.g. `global:all`, `guild:<uuid>`, `direct:<a>:<b>`.
     *
     * **A string rather than an enum plus a nullable id**, because four of the six
     * scopes are parameterised and two are not, and the alternative is four
     * nullable columns that are only ever meaningful in combination.
     */
    scope: text('scope').notNull(),

    authorId: uuid('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    body: text('body').notNull(),

    /**
     * A resolved embed, or null. **Resolved server-side at send time** into
     * `{type, id, snapshot}` and stored — never a client-supplied blob, and never
     * uploaded content (FR-013). Storing the snapshot is what makes a message
     * readable a month later when the squad it showed has been rebuilt.
     */
    embed: text('embed'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **The only read pattern that exists**: the last N of one scope, newest
     * first, bounded by that scope's retention. History is never searched and
     * never paged by author, so there is one index and it is this one.
     */
    index('chat_messages_scope_idx').on(table.scope, table.createdAt),
    index('chat_messages_author_idx').on(table.authorId),
  ],
);

/**
 * The embed types, and their prices in shards (FR-014, T032).
 *
 * **`looking-for-guild` is the cheapest deliberately** — it is posted by whoever
 * has the least, and it is the posting the design most wants to happen (FR-020).
 */
export const EMBED_TYPES = [
  'looking-for-guild',
  'own-squad',
  'visible-replay',
  'opponent-visible-wall',
] as const;
export type EmbedType = (typeof EMBED_TYPES)[number];

export const chatEmbeds = pgTable(
  'chat_embeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),

    type: text('type', { enum: EMBED_TYPES }).notNull(),

    /** The id of the thing referenced — a squad, a replay, an account. */
    referenceId: text('reference_id').notNull(),

    /**
     * The resolved snapshot, as JSON text.
     *
     * **A Hidden squad can never appear here**, and the reason is structural
     * rather than a check: resolution happens server-side from a typed reference,
     * so there is no request shape that names one (FR-015). A rejected embed
     * leaves **no row and no marker** — a redaction marker is itself a disclosure
     * that a Hidden battle happened at that point.
     */
    snapshot: text('snapshot').notNull(),

    shardsCharged: integer('shards_charged').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_embeds_message_idx').on(table.messageId)],
);

export const adCredits = pgTable(
  'ad_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),

    /**
     * The UTC day, as `YYYY-MM-DD`.
     *
     * **A date string, not a timestamp**, because the question is *"which day's
     * allowance is this"* and a timestamp invites a range scan that answers a
     * slightly different question near midnight.
     */
    day: text('day').notNull(),

    /** Free credits granted for this day. Two, today (FR-017). */
    granted: integer('granted').notNull(),

    /** Consumed so far. **Never exceeds the hard cap of four** (FR-018). */
    used: integer('used').notNull().default(0),
  },
  (table) => [
    /**
     * **One row per guild per day, and that is the cap.** Without this, two
     * concurrent postings each read `used = 3` and each write `4`, and the guild
     * posts five times. The row is the thing to contend on.
     */
    uniqueIndex('ad_credits_guild_day').on(table.guildId, table.day),
  ],
);
