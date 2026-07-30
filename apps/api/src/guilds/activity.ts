/**
 * Whether a guild is active (013 T051, T052 · FR-026, FR-027 · SC-007, SC-008).
 *
 * ### The newborn grace is part of the DEFINITION, not an exception
 *
 * FR-026: *a guild is considered active for 14 days from founding **regardless of
 * headcount***. Written as an exception — `if (isNew) skip the check` — it would
 * need repeating at every site that reads activity, and the one site that forgot
 * would dissolve a guild on its first day. Written into `guildActive()` there is
 * exactly one place to be right.
 *
 * ### Activity does not depend on *when* anybody plays (FR-027 · SC-008)
 *
 * The window is a **rolling count of days**, never a calendar day, an hour range or
 * a timezone. *"The activity window is social only"* — when a player plays has no
 * bearing on what they contribute, and a guild of night-shift players is not a dead
 * guild.
 *
 * This is the one place in the codebase where that is enforced rather than merely
 * intended, so `activity.test.ts` shifts a member's activity across every hour of
 * the day and asserts the answer never moves.
 *
 * > **Nothing dissolves a guild for inactivity yet, and that is deliberate.** This
 * > answers the question; no caller acts on it. A sweep that deletes guilds is a
 * > destructive job with no undo, and it wants a real population and a warning
 * > email before it exists. `guildActive()` is what a future sweep would ask.
 */

import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { guildMembers, guilds } from '../db/schema/guilds.js';
import { playerRatings } from '../db/schema/ratings.js';
import { daysBetween, type Clock } from './clock.js';
import { NEW_GUILD_GRACE_DAYS } from './config.js';

/** How recently a member must have played for the guild to count as active. */
export const ACTIVITY_WINDOW_DAYS = 30;

export type GuildActivity =
  | { readonly active: true; readonly reason: 'new' | 'members-active'; readonly lastSeen: Date | null }
  | { readonly active: false; readonly reason: 'no-members' | 'dormant'; readonly lastSeen: Date | null };

/**
 * One question, one answer, one place.
 *
 * The order matters and is the opposite of the obvious one: **the newborn grace is
 * checked first**, before headcount, because *"regardless of headcount"* is the
 * whole of FR-026. A guild founded an hour ago with one member is active; so is one
 * founded an hour ago whose founder has not yet played a battle.
 */
export async function guildActivity(guildId: string, clock: Clock): Promise<GuildActivity> {
  const now = clock.now();

  const [guild] = await db()
    .select({ foundedAt: guilds.foundedAt })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  if (!guild) return { active: false, reason: 'no-members', lastSeen: null };

  /**
   * The most recent activity of any member, **or null**. Read before the grace
   * check so the answer can report it either way — a caller showing *"active
   * (new guild)"* still wants to say when somebody last played.
   */
  const [recent] = await db()
    .select({ lastActivityAt: playerRatings.lastActivityAt })
    .from(guildMembers)
    .innerJoin(playerRatings, eq(playerRatings.accountId, guildMembers.accountId))
    .where(eq(guildMembers.guildId, guildId))
    .orderBy(desc(playerRatings.lastActivityAt))
    .limit(1);

  const lastSeen = recent?.lastActivityAt ?? null;

  /** FR-026 · SC-007. **First**, and regardless of everything below. */
  if (daysBetween(guild.foundedAt, now) < NEW_GUILD_GRACE_DAYS) {
    return { active: true, reason: 'new', lastSeen };
  }

  const [anyMember] = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId))
    .limit(1);

  if (!anyMember) return { active: false, reason: 'no-members', lastSeen };

  /**
   * **A rolling count of days, and nothing else.** Not `date_trunc`, not a
   * calendar day, not an hour range — those are the shapes that would make the
   * answer depend on *when* somebody plays, which FR-027 forbids and SC-008
   * measures.
   */
  const cutoff = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000);

  const [active] = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .innerJoin(playerRatings, eq(playerRatings.accountId, guildMembers.accountId))
    .where(and(eq(guildMembers.guildId, guildId), gte(playerRatings.lastActivityAt, cutoff)))
    .limit(1);

  return active
    ? { active: true, reason: 'members-active', lastSeen }
    : { active: false, reason: 'dormant', lastSeen };
}

/** The boolean, for a caller that only wants the answer. */
export async function guildActive(guildId: string, clock: Clock): Promise<boolean> {
  return (await guildActivity(guildId, clock)).active;
}
