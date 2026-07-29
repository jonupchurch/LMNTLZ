/**
 * Player standing — **both axes, one row** (009 T002).
 *
 * `09-matchmaking.md` keeps gear and skill deliberately separate: **gear
 * restricts** who is in the pool, via leagues, and **rating orders** the pool and
 * can never remove anybody. They share a row because they share a lifetime — one
 * per account, created on first need — not because they are the same kind of
 * number. Nothing here should ever combine them into a score.
 *
 * ### `rated_battles` exists to decay K, and for nothing else
 *
 * The rating converges rather than accumulates (`06-progression.md`, *It
 * converges; it does not accumulate*), which is what lets the weekly ladder pay on
 * **standing at the close** rather than on volume. A strong player with two hours
 * outranks a weaker one with twenty. Three decaying bands do that:
 *
 * | Phase | Rated battles | K |
 * |---|---|---|
 * | Provisional | first 30 | 40 |
 * | Settling | 31 – 200 | 20 |
 * | Established | 200 + | 10 |
 *
 * `kFactor()` lives in `../../matchmaking/rating.ts` with the rest of the rating
 * math; the boundaries are here because they are a property of this column.
 *
 * > **The bands are a starting point, not a decision** — `06-progression.md` says
 * > so explicitly. Convergence speed is what a simulated population settles; the
 * > *shape* (one number, convergent, three decaying bands) is the settled part.
 *
 * ### Two deviations from T002, both deliberate
 *
 * **`attack_streak` is NOT here.** T002 lists it, and it already exists on
 * `player_streaks` (006 T034) whose own header warns at length against conflating
 * the three streaks. A second column for the one streak that feeds ambush is not a
 * convenience, it is two sources of truth for the number that decides whether a
 * player gets into a Hidden battle at all. Read it from `playerStreaks`.
 *
 * **`gear_score` is nullable, and null is not zero.** The honest states are
 * *"computed from placed runes"* and *"never computed"*, and they must be
 * distinguishable. Feature 010 owns rune placement and does not exist yet, so
 * every row is the second state today and `gearScore()` answers with the
 * 1,500 starter grant. **Defaulting the column to 1500 instead would write the
 * placeholder into the database**, where no later reader could tell a real Bronze
 * player from an unmigrated one — the same reasoning that made 008's league
 * columns nullable rather than `0`.
 */

import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/** Every account starts here — the same number for everyone. */
export const STARTING_RATING = 1000;

/** Band boundaries for `kFactor()`. Counted in **rated** battles, not all battles. */
export const PROVISIONAL_BATTLES = 30;
export const SETTLING_BATTLES = 200;

export const playerRatings = pgTable('player_ratings', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),

  /**
   * The skill axis. **Visible to the player**, because it is also what the game
   * acts on — `06-progression.md` dropped the hidden/shown split precisely so the
   * number a player brags about is the number that orders their opponents.
   */
  rating: integer('rating').notNull().default(STARTING_RATING),

  /**
   * Drives the K band above. **Not a battle count** — a battle that does not move
   * rating does not belong in it, or the bands would decay for reasons the player
   * cannot see.
   */
  ratedBattles: integer('rated_battles').notNull().default(0),

  /**
   * The gear axis: `2.5 × effective stat points` over every rune **currently
   * placed**. Recomputed on placement rather than on request (FR-002), so this
   * column is the value, not a cache of a query.
   *
   * **Null means never computed.** See the header — 010 owns placement.
   */
  gearScore: integer('gear_score'),

  /**
   * Drives inactivity eviction from the defender pool. An account that stops
   * playing must stop being offered, or `09-matchmaking.md`'s thin-Bronze problem
   * gets worse in exactly the league where it already hurts most.
   *
   * **It tracks activity, not sign-in.** An account kept warm by opening the game
   * and doing nothing would keep collecting hold income, which the mechanics doc
   * names as the thing this prevents.
   */
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerRating = typeof playerRatings.$inferSelect;
