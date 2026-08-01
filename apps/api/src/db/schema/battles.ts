/**
 * Battles and their append-only action log (007 T003–T005).
 *
 * ### In-progress state is never stored, so the log is not a journal — it is the state
 *
 * There is no `current_hp` column and there will not be one. Every request
 * replays `battle_actions` from the beginning, applies the new action, and
 * appends. One source of truth, no cache, no expiry, no reconciliation job —
 * and state cannot drift from the log because there is no state *to* drift.
 *
 * The cost is a replay per request, which is bounded: a battle is 20–40 actions,
 * because one request resolves the player's intent **and everything following it**
 * up to their next real choice.
 *
 * ### `PRIMARY KEY (battle_id, sequence)` is the idempotency mechanism
 *
 * The client says which sequence it believes it is writing. A retry therefore
 * raises `23505` instead of appending a second time — **a duplicate is a
 * constraint violation, not a race to detect.** Checking first and inserting
 * after leaves a window between the two that a concurrent request fits through;
 * this leaves no window, because the database does the deciding.
 *
 * That matters more here than almost anywhere else in the schema: the log is
 * replayed to rebuild state, so one duplicated append silently changes every
 * turn after it, and the battle stays plausible while being wrong.
 *
 * ### The metadata this carries because it can never be added later
 *
 * **Constitution XVI, and it is the only principle that cannot be retrofitted.**
 * Feature 008 reports on these; feature 007 is what *records* them, and anything
 * missing from a battle at the moment it is fought is missing permanently — a
 * migration can add a column but cannot invent the value it should have held.
 *
 * So this table records more than feature 007 itself reads:
 *
 * | Column | Read by | Why here and not there |
 * |---|---|---|
 * | `turnCount` | 008 | It exists only while the battle is being resolved |
 * | `attackerSquad`, `defenderSnapshot` | 008 | Both compositions; a later edit destroys the truth |
 * | `defenderIsBot` | 008, 009 | Bot battles must be excludable from every aggregate |
 * | `leagueAtBattle`, `ratingAtBattle` | 008, 009 | Nullable — see below |
 *
 * **`leagueAtBattle` and `ratingAtBattle` are nullable on purpose, and that is
 * not a backfill failure.** Leagues and rating are defined by feature 009, which
 * does not exist yet, so battles fought before it had no league to record. XVI
 * protects values that were real at the time; it does not require inventing ones
 * that were not. They become non-null in practice the moment 009 ships.
 *
 * ### `seed` never leaves the server
 *
 * Constitution XII. It is here because a replay must re-derive identically, and
 * it is excluded from every serialiser — the resynchronisation route in
 * `battle/routes.ts` re-derives state on every call and carries neither the seed
 * nor the draw indices.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { SQUAD_ZONES } from './squads.js';

/**
 * Why a battle stopped. `elimination` and `turn_cap` are wins; the rest are not.
 *
 * **These are NOT the engine's `Conclusion['reason']` values, and the difference
 * is deliberate.** `@lmntlz/sim/rules` reports how the *fight* ended — `wipe`,
 * `cap-hp-share`, `cap-champions-standing`, `cap-tiebreak` — four values that
 * distinguish three ways the turn cap can be broken. This column records how the
 * *battle record* ended, which additionally has to express `abandoned` and
 * `discarded`, neither of which the engine has any concept of.
 *
 * So `settle` (T026) maps one onto the other:
 *
 * | `Conclusion.reason` | here |
 * |---|---|
 * | `wipe` | `elimination` |
 * | `cap-hp-share`, `cap-champions-standing`, `cap-tiebreak` | `turn_cap` |
 * | *(none — no conclusion)* | `abandoned`, `discarded` |
 *
 * **The collapse used to lose information; feature 008 took it back.** This
 * comment previously warned that the three cap reasons could not be recovered
 * later. `battle_records.reason` (008 T005) keeps the engine's four values
 * unmerged, and it was added *before the first battle was recorded* — which is
 * the only window Constitution XVI leaves open. So the distinction is preserved
 * where balance reads it, and this column stays collapsed where it is right to
 * be: here it also has to express `abandoned` and `discarded`, which the engine
 * has no concept of.
 *
 * The general lesson, since it will come up again: **a flagged loss is only
 * cheap while it is still flagged.** This one was recoverable because the next
 * feature read the note and acted inside the window.
 */
export const BATTLE_REASONS = ['elimination', 'turn_cap', 'abandoned', 'discarded'] as const;
export type BattleReason = (typeof BATTLE_REASONS)[number];

export const battles = pgTable(
  'battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * **`set null`, not `cascade`, and nullable for the same reason.**
     *
     * Cascading would delete a player's battles when they delete their account,
     * and three separate commitments forbid that:
     *
     * - **Constitution XVI** — these records are kept forever and cannot be
     *   reconstructed; rating, leagues and every balance decision are computed
     *   from the history of battles actually played.
     * - **Feature 008 SC-001** — every design commitment must be answerable
     *   *from records alone*. A departing player would silently reshape the
     *   aggregates behind every one of them.
     * - **The published privacy policy**, which says deletion "removes your
     *   identity from these records rather than deleting the records
     *   themselves — what remains is not linked to you." That is a promise
     *   about this exact foreign key.
     *
     * So the row outlives the account and stops pointing at anybody. Deletion
     * is delinking, which is what was promised, and it is also what keeps the
     * data honest.
     */
    attackerId: uuid('attacker_id').references(() => accounts.id, { onDelete: 'set null' }),

    /**
     * **Nullable, because a bot defender is not an account.** The engine plays
     * every defense, and curated bot defenders are a stated balance lever
     * (`CLAUDE.md`) — so the defender may be authored rather than a player.
     */
    defenderId: uuid('defender_id').references(() => accounts.id, { onDelete: 'set null' }),

    /**
     * **Not derivable from `defenderId` being null**, which is why it is its own
     * column. An account can be deleted, and the `set null` above would then
     * make a real player's battle look like a bot's — quietly excluding it from
     * every aggregate that filters bots out (008 FR-005, SC-002). Recorded as a
     * fact at battle time, not inferred later from a foreign key's survival.
     */
    defenderIsBot: boolean('defender_is_bot').notNull().default(false),

    /**
     * Which of the defender's two zones was fought. `hidden` only via ambush.
     *
     * **`{ enum }` is a TypeScript refinement, not a SQL change** — the column
     * is still `text` and no migration follows — and it is what `squads.zone`
     * has said all along. Without it this read back as a bare `string`, so
     * every consumer that needed the union wrote `battle.zone as SquadZone`;
     * there were two such casts and adding a third is what prompted this.
     */
    zone: text('zone', { enum: SQUAD_ZONES }).notNull(),

    /**
     * **Server-only, and it never appears in a response.** The resolver consumes
     * it; the client is told outcomes, never the means of reproducing them.
     */
    seed: text('seed').notNull(),

    // --- the stamps that make a past battle re-derivable (FR-010) ------------
    engineVersion: text('engine_version').notNull(),
    contentVersion: text('content_version').notNull(),
    buildSha: text('build_sha'),

    // --- recorded for feature 008, because 008 cannot go back and get them ---
    /** Hero-turns elapsed. Null until the battle concludes. */
    turnCount: integer('turn_count'),
    /** The attacking squad as it stood, so a later edit cannot rewrite history. */
    attackerSquad: jsonb('attacker_squad').notNull(),
    /**
     * The defending squad **and its per-champion configuration**, frozen at
     * creation (FR-001). A mid-battle edit to the real squad cannot reach this.
     */
    defenderSnapshot: jsonb('defender_snapshot').notNull(),
    /**
     * **SUPERSEDED by `battle_records`' four columns. Feature 009 should not
     * write here.**
     *
     * These two cannot say *whose* league and rating, and a matchup needs both
     * sides to be worth anything — the interesting question is always the gap.
     * `battle_records` carries `attacker_league`, `defender_league`,
     * `attacker_rating` and `defender_rating` instead.
     *
     * Kept rather than dropped because they hold no data either way and a
     * migration to remove two unused nullable columns buys nothing. They are
     * still null on every row ever written.
     */
    leagueAtBattle: text('league_at_battle'),
    ratingAtBattle: integer('rating_at_battle'),

    /**
     * League and rating **per side, captured when the battle starts** (009 T055).
     *
     * ### Why four columns here as well as on `battle_records`
     *
     * `battle_records` has had these four since 008 and `record.ts` wrote `null` into
     * every one of them, because leagues did not exist yet. They exist now. But the record
     * is built from the concluding `UPDATE`'s `RETURNING` and **never from a second
     * `SELECT`** — that rule is what stops the record disagreeing with the settlement
     * describing it — so a value the record must carry has to be on this row to be
     * returnable.
     *
     * ### Creation time, not settlement time, and the difference is real
     *
     * A battle can stay open for hours. Placing a rune mid-battle can move a player across
     * a league threshold, so reading the league at settlement would record the band the
     * player was in when they *finished* rather than the one the matchmaking decision was
     * made in. The interesting question is always about the **gap the pool offered**, which
     * is a creation-time fact.
     *
     * ### These are the columns Constitution XVI cannot repair
     *
     * Every battle recorded before this landed has null leagues and null ratings, forever.
     * That is not a bug to fix later — it is the reason this is being wired the moment
     * league exists rather than when a screen wants it. `leagueAtBattle` and
     * `ratingAtBattle` above are the previous attempt: single columns that cannot say
     * whose, superseded and still empty.
     */
    attackerLeague: text('attacker_league'),
    defenderLeague: text('defender_league'),
    attackerRating: integer('attacker_rating'),
    defenderRating: integer('defender_rating'),

    winner: text('winner'),
    reason: text('reason'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    concludedAt: timestamp('concluded_at', { withTimezone: true }),
  },
  (t) => [
    // The battle list, newest first, per player.
    index('battles_attacker_started_idx').on(t.attackerId, t.startedAt),
    index('battles_defender_started_idx').on(t.defenderId, t.startedAt),
    /**
     * **Partial, because only unconcluded battles are looked up this way.** A
     * player may have one battle in flight; finished ones are history and are
     * read by the list index above. A plain index here would grow forever to
     * answer a question only ever asked about a handful of rows.
     */
    index('battles_in_flight_idx')
      .on(t.attackerId)
      .where(sql`${t.concludedAt} is null`),
  ],
);

export const battleActions = pgTable(
  'battle_actions',
  {
    battleId: uuid('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),

    /** Supplied by the client. The composite key below is what makes a retry safe. */
    sequence: integer('sequence').notNull(),

    actorInstanceId: text('actor_instance_id').notNull(),
    powerId: text('power_id').notNull(),
    /** Null for powers that take no target. */
    targetInstanceId: text('target_instance_id'),

    /**
     * **Where the RNG stood before this action, and how far it moved.**
     *
     * A replay must consume exactly the draws the original did. Recording only
     * the outcome would make the log un-re-derivable the moment a formula
     * changed; recording the draw window makes the log the authority over the
     * generator rather than the other way round.
     *
     * **`mode: 'bigint'`, because that is the type `@lmntlz/sim/resolver`
     * already uses.** The counter is per battle and never comes near `Number`'s
     * safe range, so `'number'` would also work — and would put a conversion at
     * every boundary between the log and the resolver, which is precisely where
     * a replay divergence would be hardest to see. Same type on both sides, no
     * conversion. A `BigInt` also has no JSON representation, so these can never
     * be serialised into a response by accident.
     */
    drawIndexBefore: bigint('draw_index_before', { mode: 'bigint' }).notNull(),
    drawsConsumed: bigint('draws_consumed', { mode: 'bigint' }).notNull(),

    /**
     * The exact packet returned for this action.
     *
     * **Stored so a retry is answered identically rather than re-resolved.**
     * Re-resolving would be correct and still wrong: two calls must be
     * indistinguishable to the caller, and recomputation invites the day the
     * computation changes underneath a client that already saw the first answer.
     */
    resolvedPacket: jsonb('resolved_packet').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.battleId, t.sequence] })],
);

export const battlesRelations = relations(battles, ({ one, many }) => ({
  attacker: one(accounts, { fields: [battles.attackerId], references: [accounts.id] }),
  actions: many(battleActions),
}));

export const battleActionsRelations = relations(battleActions, ({ one }) => ({
  battle: one(battles, { fields: [battleActions.battleId], references: [battles.id] }),
}));
