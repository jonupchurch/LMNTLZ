/**
 * Guilds, and the one constraint the whole feature rests on (013 T003).
 *
 * ### `UNIQUE (account_id)` on `guild_members` is not a tidiness rule
 *
 * It is **the lock**, and picking the right row to lock is the entire concurrency
 * design. Two guilds can accept the same applicant at the same instant, from two
 * connections, and exactly one must win.
 *
 * | Lock on | Why not |
 * |---|---|
 * | the **guild** row | serialises two *different* guilds accepting two *different* applicants — contention bought for nothing |
 * | the **application** row | two guilds accepting two *different* applications from the same player touch **different rows**, conflict on nothing, and produce **two memberships** |
 * | the **membership** row ✓ | the invariant is *"an account belongs to at most one guild"*, and that invariant lives on the applicant |
 *
 * **Lock what the invariant is about.** The loser's `INSERT` raises `23505` and
 * `applications.ts` turns that into `409 { reason: 'already-joined' }` — the officer
 * whose click lost sees *"Reyna joined The Long Reach a moment ago"*, not a 500.
 *
 * ### There are no Wings, events or funds here, deliberately
 *
 * A Wing exists **only** for an event, so deferring events defers Wings; they are
 * not separable. `tests/guilds/deferred.test.ts` fails if the word appears in this
 * feature at all. **A "harmless" Wing column now is a structure with no rules
 * attached, and it will acquire wrong ones** — the capacity of 24 is a guild fact
 * and stays; three Wings of 8 is an event fact and does not.
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/**
 * The three roles, and there are exactly three (FR-017).
 *
 * One master, **at most 3** officers, and members. The counts are enforced in
 * `membership.ts` rather than by the type, because "at most 3" is a property of a
 * guild's roster and not of a single row.
 */
export const GUILD_ROLES = ['master', 'officer', 'member'] as const;
export type GuildRole = (typeof GUILD_ROLES)[number];

/** Capacity is a **guild** fact. Three Wings of 8 is an event fact and is deferred. */
export const GUILD_CAPACITY = 24;

/** Founding, and succession, cost one full rune. */
export const GUILD_FOUNDING_COST = 650;

export const guilds = pgTable(
  'guilds',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * **Permanent** (FR-002). There is no rename route — the only write that
     * changes this is feature 015's moderation-forced rename, which is free.
     *
     * *A permanent name is not a trap*, because founding a new guild is always
     * available for 650; you simply start over with no history.
     */
    name: text('name').notNull(),

    /**
     * The case-folded name, unique.
     *
     * Same reasoning as `accounts.username_key`: a lookalike of a guild master's
     * guild is an impersonation vector, and *"The Long Reach"* versus *"the long
     * reach"* is not a distinction a player can see in a list.
     */
    nameKey: text('name_key').notNull().unique(),

    /**
     * The emblem, as **three indices into a curated palette** — never an upload.
     *
     * This is what removes the review surface entirely. All 5,184 combinations are
     * vetted at authoring time and none of them is player-supplied content, so
     * there is nothing to moderate and no pending state. **An avatar is an upload
     * and is still pre-moderated (012); composition is the difference, not a
     * relaxed policy.**
     */
    emblemIcon: integer('emblem_icon').notNull().default(0),
    emblemInk: integer('emblem_ink').notNull().default(0),
    emblemGround: integer('emblem_ground').notNull().default(0),

    /** A stored guild property validated for length, not text typed per posting (FR-007). */
    pitch: text('pitch').notNull().default(''),

    /**
     * The message of the day is a **pin**, not a message (FR-019).
     *
     * `motdSetAt` is what the login notice compares against a member's last seen
     * time — which is why it is a column and not derivable from the text.
     */
    motd: text('motd'),
    motdSetAt: timestamp('motd_set_at', { withTimezone: true }),

    foundedAt: timestamp('founded_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Set when the last member leaves, or the master disbands.
     *
     * A row rather than a delete, because applications, invitations and battle
     * records all point here and *the past is immutable* (Constitution XVI). The
     * founding fee is **not** returned — the rule is *a guild costs 650 to hold*,
     * not *you get your money back*.
     */
    disbandedAt: timestamp('disbanded_at', { withTimezone: true }),
  },
  (table) => [index('guilds_founded_idx').on(table.foundedAt)],
);

export const guildMembers = pgTable(
  'guild_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * ### The contended row. **`UNIQUE`, and that is the feature.**
     *
     * Not a composite with `guild_id` — a composite would permit one account in two
     * guilds, which is the exact bug. The uniqueness is on the **account alone**.
     */
    accountId: uuid('account_id')
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),

    role: text('role', { enum: GUILD_ROLES }).notNull().default('member'),

    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('guild_members_guild_idx').on(table.guildId, table.role)],
);

export const APPLICATION_STATES = ['open', 'accepted', 'withdrawn', 'dismissed', 'expired'] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const guildApplications = pgTable(
  'guild_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),

    state: text('state', { enum: APPLICATION_STATES }).notNull().default('open'),

    message: text('message').notNull().default(''),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),

    /**
     * **Written, not derived**, unlike the starter league's time exit.
     *
     * The opposite call to `starterLeague.ts`, and for the opposite reason: there,
     * a job that fails leaves a player *protected* past their week, so deriving is
     * the safe failure. Here a job that fails leaves an application *open* past its
     * week, and the 5-concurrent budget fills up permanently. So expiry is a stored
     * instant the read path can also honour without waiting for the sweep.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Set on any terminal transition, so the 24-hour re-apply cooldown can read it. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    /** The applicant's budget: how many are open right now. */
    index('guild_applications_account_state_idx').on(table.accountId, table.state),
    /** An officer's review queue. */
    index('guild_applications_guild_state_idx').on(table.guildId, table.state),
    /** The expiry sweep. */
    index('guild_applications_expiry_idx').on(table.state, table.expiresAt),
  ],
);

export const INVITE_STATES = ['open', 'accepted', 'withdrawn', 'declined', 'expired'] as const;
export type InviteState = (typeof INVITE_STATES)[number];

export const guildInvites = pgTable(
  'guild_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),

    /** Who sent it. Kept because *"applications survive the reviewer"* — so do invites. */
    invitedBy: uuid('invited_by').references(() => accounts.id, { onDelete: 'set null' }),

    state: text('state', { enum: INVITE_STATES }).notNull().default('open'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('guild_invites_account_state_idx').on(table.accountId, table.state),
    /**
     * One **open** invitation per guild per player; a second is the same offer.
     *
     * **Partial, and it has to be.** A plain `UNIQUE (guild_id, account_id, state)`
     * would also permit exactly one `declined` row forever — so a player who
     * declined once could never be invited and decline again. The constraint is
     * about the open offer; the history is unconstrained.
     */
    uniqueIndex('guild_invites_one_open')
      .on(table.guildId, table.accountId)
      .where(sql`${table.state} = 'open'`),
  ],
);

export const SUCCESSION_STATES = ['pending', 'completed', 'lapsed', 'refused'] as const;
export type SuccessionState = (typeof SUCCESSION_STATES)[number];

/**
 * An officer's petition against an absent master.
 *
 * **Requested, not claimed** (FR-020) — and the two timers are stored rather than
 * recomputed, so *"the master has been inactive 14 days"* is answered once, at
 * request time, by the clock that was injected then.
 */
export const guildSuccessions = pgTable(
  'guild_successions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),

    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /** Recorded so a completed succession can say who it displaced, forever. */
    formerMasterId: uuid('former_master_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    state: text('state', { enum: SUCCESSION_STATES }).notNull().default('pending'),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),

    /** `requestedAt` + 7 days. Stored, so changing the config cannot move a live timer. */
    completesAt: timestamp('completes_at', { withTimezone: true }).notNull(),

    /**
     * When the master's return lapsed it. **Presence is the reply** — the email
     * carries no link that grants anything, so there is nothing to phish.
     */
    lapsedAt: timestamp('lapsed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    /** The completion sweep, and the "is one already pending" check. */
    index('guild_successions_state_completes_idx').on(table.state, table.completesAt),
    index('guild_successions_guild_idx').on(table.guildId, table.state),
  ],
);

export type Guild = typeof guilds.$inferSelect;
export type GuildMember = typeof guildMembers.$inferSelect;
export type GuildApplication = typeof guildApplications.$inferSelect;
export type GuildInvite = typeof guildInvites.$inferSelect;
export type GuildSuccession = typeof guildSuccessions.$inferSelect;
