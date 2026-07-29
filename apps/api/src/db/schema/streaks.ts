/**
 * The attack streak (006 T034).
 *
 * ### Three numbers that look alike and must never be conflated (FR-012)
 *
 * ```
 * attackStreak   ONE per player     consecutive attack wins  → feeds ambush
 * holdStreak     ONE per Visible squad   days held           → public, cosmetic
 * holdStreak     ONE per Hidden squad    days held           → public, cosmetic
 * ```
 *
 * They are all "a streak", they are all integers, and **only the first one
 * changes what happens to anybody**. Conflating them is not a display bug: a
 * hold streak feeding ambush would make editing a defense squad lower the
 * player's own ambush odds, which nothing in the design says and no player would
 * ever guess.
 *
 * **The attack streak lives here, on the account, and not on a squad** — that
 * placement *is* FR-013. On a squad it would reset when the player switched
 * squads, and switching squads is the ordinary way to answer a different
 * opponent. A player who reads the counter would learn to attack with one squad
 * forever, which is the opposite of the counter-building the game is about.
 */

import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

export const playerStreaks = pgTable('player_streaks', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),

  /**
   * Consecutive attack wins, **across all three offense squads**. The only
   * streak that feeds ambush.
   */
  attackStreak: integer('attack_streak').notNull().default(0),

  /** Kept so a player can see what they have held, not used in any formula. */
  bestAttackStreak: integer('best_attack_streak').notNull().default(0),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerStreak = typeof playerStreaks.$inferSelect;
