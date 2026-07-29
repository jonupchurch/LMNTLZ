/**
 * The permanent battle record (008 T005–T007).
 *
 * ### TL;DR
 *
 * When a battle ends, one row is written here and never changed again. The game
 * runs no analytics service, so **this table is the analytics product** — every
 * balance question the design promises to answer is answered by querying it. A
 * column missing from the first battle ever fought is missing from history
 * forever, because a migration can add a column but cannot invent the value it
 * should have held. That is Constitution XVI, and it is the only principle in the
 * set that cannot be retrofitted.
 *
 * ### Why this is a second table and not two more columns on `battles`
 *
 * The two tables carry nearly the same fields, which looks like duplication and
 * is worth defending. **`battles` is the working copy; this is the published
 * fact.** Four differences make them genuinely different objects:
 *
 * | | `battles` | `battle_records` |
 * |---|---|---|
 * | Discarded battle | **deleted** | never written |
 * | While in flight | exists, `winner` null | absent |
 * | Carries the seed | yes, server-only | **no** |
 * | Lifetime | prunable with its action log | **forever** |
 *
 * The first row is the load-bearing one. `discard()` deletes a battle that
 * expired, was dropped by a maintenance window, or became unresolvable — and
 * FR-016 says that battle *did not happen*. A single table would need every
 * aggregate to remember to exclude it, and an aggregate that forgets reports a
 * fight nobody finished as a real result. Writing the record only at conclusion
 * makes the exclusion structural: **there is no row to forget about.**
 *
 * The third row is a security boundary. `battles.seed` never leaves the server,
 * and this table is the one that reporting queries, exports and future admin
 * views read. Keeping the seed out of the object that gets read widely is
 * cheaper than remembering to strip it at every point it might escape.
 *
 * These are not two mutable sources of truth. The record is written **once**,
 * inside feature 007's conclusion transaction, and afterwards only
 * `replay_blob_url` and `replay_deleted_at` ever move — both of which are about
 * the *replay*, not the battle.
 *
 * ### Three deliberate deviations from `contracts/replays-api.md`
 *
 * The contract's DDL is stricter than the system can honestly support. Each
 * deviation is recorded at the column.
 *
 * 1. **`attacker_id` and `defender_id` are nullable** — the contract has them
 *    `NOT NULL`, which contradicts the published privacy policy.
 * 2. **The four league and rating columns are nullable** — features 009 and 010
 *    do not exist, so those values were never real.
 * 3. **`reason` carries the engine's vocabulary, not `battles.reason`'s** — this
 *    is an improvement, and it closes a loss 007 flagged.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/**
 * Why the fight ended, in **the engine's own words**.
 *
 * ### This is not `battles.reason`, and the difference is the point
 *
 * `battles.reason` records how the *record* ended and has to express `abandoned`
 * and `discarded`, so it collapses the engine's three cap outcomes into one
 * `turn_cap`. That schema's own comment flags the cost:
 *
 * > *"Collapsing the three cap reasons loses information Constitution XVI would
 * > otherwise keep… If that changes, the tiebreak has to be recorded from the
 * > first battle onwards — it cannot be backfilled."*
 *
 * **This column is that change, made before the first battle is recorded.** The
 * four values are kept apart here, because the question they answer is a balance
 * question and this is the table balance reads: *"how many capped battles were
 * decided on HP share versus champions standing versus the defender tiebreak"*
 * distinguishes a cap that was nearly a win from one that was a genuine stall.
 * `cap-tiebreak` in particular always favours the defender, so its frequency is
 * a direct measure of how often the engine hands out a win nobody earned.
 *
 * `abandoned` and `discarded` have no counterpart here **because those battles
 * are never recorded at all** — no conclusion, no row. That asymmetry is why the
 * two columns can afford different vocabularies.
 */
export const RECORD_REASONS = [
  'wipe',
  'cap-hp-share',
  'cap-champions-standing',
  'cap-tiebreak',
] as const;
export type RecordReason = (typeof RECORD_REASONS)[number];

export const battleRecords = pgTable(
  'battle_records',
  {
    /**
     * **The battle's own id, and deliberately no foreign key to `battles`.**
     *
     * A record outlives the battle row it came from. The action log is the
     * largest thing this system stores and is worthless once a battle is over —
     * pruning `battles` and `battle_actions` is a legitimate future decision,
     * and a foreign key here would either forbid it or, with a cascade, quietly
     * delete history. Constitution XVI outranks referential tidiness.
     *
     * Nothing is lost by its absence: the only writer is `recordBattle`, called
     * from inside the conclusion transaction with the battle in hand.
     */
    battleId: uuid('battle_id').primaryKey(),

    /**
     * **Wall-clock, and distinct from `turn_count` on purpose** (T006).
     *
     * `turn_count` is *engine* length — hero-turns elapsed. These two are
     * elapsed *time*, and feature 016's drain needs the difference: it has to
     * know how long a real battle takes in minutes to decide how long to wait
     * before a deploy. No amount of turn counting answers that, because a player
     * can leave a battle open overnight.
     *
     * The risk this comment exists to prevent is somebody reading them as
     * redundant with `turn_count` and dropping them in a later migration.
     */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    concludedAt: timestamp('concluded_at', { withTimezone: true }).notNull(),

    /**
     * **Nullable, `set null` — and the contract's `NOT NULL` is wrong.**
     *
     * `contracts/replays-api.md` declares both participants `NOT NULL`. That
     * cannot hold, because the published privacy policy promises account
     * deletion *"removes your identity from these records rather than deleting
     * the records themselves — what remains is not linked to you."* A `NOT NULL`
     * column has exactly two ways to keep that promise: delete the row, which
     * XVI forbids and which would reshape every aggregate behind every balance
     * decision; or invent a placeholder account, which is a lie in the table
     * whose only job is to be true.
     *
     * So deletion is **delinking**, matching `battles.attacker_id` for the same
     * three reasons recorded there. The record keeps the battle and stops
     * pointing at anybody.
     */
    attackerId: uuid('attacker_id').references(() => accounts.id, { onDelete: 'set null' }),
    defenderId: uuid('defender_id').references(() => accounts.id, { onDelete: 'set null' }),

    /**
     * **The field most likely to be dropped as obviously unnecessary, and the
     * one that poisons everything if it is missing** (FR-005, SC-002).
     *
     * Curated bot defenders are a stated balance lever: the design moves the meta
     * by adding opponents rather than changing numbers. So a table full of
     * battles against bots measures **our own curation**, not what players do —
     * and every hold rate, every length distribution and every pick rate is
     * wrong in a way that looks entirely plausible.
     *
     * **Not derivable from `defender_id IS NULL`.** The `set null` above means a
     * deleted account's battles would otherwise start reading as bot battles
     * years later, silently removing a real player's history from every aggregate
     * that filters bots out. Recorded as a fact at battle time.
     */
    defenderIsBot: boolean('defender_is_bot').notNull(),

    /** `visible` | `hidden`. Hidden is reachable only by ambush and pays more. */
    zone: text('zone').notNull(),

    winner: text('winner').notNull(),
    /** One of `RECORD_REASONS` — the engine's four, not `battles.reason`'s. */
    reason: text('reason').notNull(),
    /** Engine length in hero-turns. See `started_at` for why both exist. */
    turnCount: integer('turn_count').notNull(),

    /**
     * Both compositions as they stood when the battle was fought.
     *
     * **Storing is not exposing** (Constitution XVII). `defender_squad` is
     * populated on every row and appears in **no** response: not in
     * `GET /v1/me/battles`, not in feature 012's CSV export, not on a profile.
     * The rules about what may leave the system live where data leaves it, and
     * they are not weakened by what is recorded here — pick rates cannot be
     * computed from squads nobody stored.
     *
     * Frozen, so a later squad edit cannot rewrite what was fought.
     */
    attackerSquad: jsonb('attacker_squad').notNull(),
    defenderSquad: jsonb('defender_squad').notNull(),

    /**
     * **Nullable, and that is not a backfill failure** — the contract's
     * `NOT NULL` assumes features 009 and 010 already exist.
     *
     * Leagues come from 009 and rating from 010. Battles fought before them had
     * no league and no rating to record, so there is no true value to write.
     * **XVI protects values that were real at the time; it does not require
     * inventing ones that were not** — and a sentinel would be worse than null
     * here, because `rating = 0` is indistinguishable from a real rating of 0 to
     * every query, whereas null says *"this battle predates rating"* out loud.
     *
     * They become non-null in practice the moment 009 and 010 ship. The columns
     * exist now because XVI means they cannot be added then.
     *
     * **Four columns, one per side.** `battles` has a single `league_at_battle`
     * and `rating_at_battle`, which cannot say whose — a matchup needs both to
     * be worth anything, since the interesting question is always about the
     * *gap*. Those two columns hold no data and are superseded by these; 009
     * should write here.
     */
    attackerLeague: text('attacker_league'),
    defenderLeague: text('defender_league'),
    attackerRating: integer('attacker_rating'),
    defenderRating: integer('defender_rating'),

    /**
     * **Three stamps, never merged** (T007).
     *
     * A single `version` column cannot answer *"did this move because the roster
     * changed or because the engine did"* — the first question any balance
     * investigation asks, and under the no-nerf rule the investigation is the
     * whole intervention. Merging them is not a smaller schema, it is an
     * unanswerable question.
     *
     * - `engine_version` — the rules and the generator
     * - `content_version` — the roster
     * - `build_sha` — everything else
     *
     * `build_sha` is nullable to match `battles.build_sha`: it comes from
     * `VERCEL_GIT_COMMIT_SHA`, which does not exist locally, and a `NOT NULL`
     * would make the test suite unable to record a battle. Null means *"not a
     * deployed build"*, which is true and useful.
     */
    engineVersion: text('engine_version').notNull(),
    contentVersion: text('content_version').notNull(),
    buildSha: text('build_sha'),

    /**
     * The replay's two states, and **the only columns here that ever change.**
     *
     * `replay_blob_url` is null in three distinguishable situations, and the
     * `watchable` flag on the battle list (T020) covers all of them: the blob
     * write failed, the replay expired, or it was deleted. `replay_deleted_at`
     * separates *"expired and cleaned up"* from *"never written"*, which is what
     * makes `expiredButUndeletedCount()` a real monitoring signal rather than a
     * count of two different things.
     *
     * **Deleting a replay never alters the record** (FR-018, T030) — only these
     * two move. The outcome, the streak and the rating change are all in the
     * columns above, which is why nothing breaks when a replay expires. Only
     * *watching* has a shelf life.
     */
    replayBlobUrl: text('replay_blob_url'),
    replayDeletedAt: timestamp('replay_deleted_at', { withTimezone: true }),
  },
  (t) => [
    // `GET /v1/me/battles` — the most recent 50 a player took part in, newest
    // first. Two indexes because a player appears on either side.
    index('battle_records_attacker_idx').on(t.attackerId, t.concludedAt),
    index('battle_records_defender_idx').on(t.defenderId, t.concludedAt),

    /**
     * **Partial, and it is the cleanup query's whole cost story.**
     *
     * `cleanupExpired` selects concluded-past-7-days rows with a blob still
     * present and not yet deleted. In steady state that is a *tiny* slice of a
     * table that grows forever — and the rows it wants are the ones this index
     * contains, so the scan is proportional to work outstanding rather than to
     * history. A plain index on `concluded_at` would grow with every battle ever
     * fought to answer a question only ever asked about the last week.
     *
     * This is also what makes the standing rule affordable: **`list()` never
     * appears in this feature.** Postgres knows what exists, the bucket is
     * write-and-delete only, and `del()` is free while `list()` is billed.
     */
    index('battle_records_cleanup_idx')
      .on(t.concludedAt)
      .where(sql`${t.replayBlobUrl} is not null and ${t.replayDeletedAt} is null`),
  ],
);

export const battleRecordsRelations = relations(battleRecords, ({ one }) => ({
  attacker: one(accounts, {
    fields: [battleRecords.attackerId],
    references: [accounts.id],
    relationName: 'recordAttacker',
  }),
  defender: one(accounts, {
    fields: [battleRecords.defenderId],
    references: [accounts.id],
    relationName: 'recordDefender',
  }),
}));
