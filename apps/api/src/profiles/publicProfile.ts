/**
 * The public profile — **a fixed field set** (012 T010–T012).
 *
 * ### TL;DR
 *
 * What one player is allowed to see about another. The list is fixed: a player
 * chooses their name and their avatar and nothing else about what is shown.
 *
 * ### Why fixed, when configurable sounds friendlier
 *
 * Because in a game where everyone owns the same 27 heroes, **absence is
 * information.** Every hideable field becomes a signal — an opponent learns
 * something from the fact that you hid it, and the design would have spent its
 * scouting mechanic on a privacy toggle nobody asked for. `FR-001`.
 *
 * **Only time zone and languages may ever be hidden** (`HIDEABLE_FIELDS`), and
 * neither is collected yet, so today the answer to "what can I hide?" is nothing.
 * The constant exists so that adding a third is a visible edit to a named list
 * rather than a quiet consequence of adding a column.
 *
 * ### This module does not share a serialiser with `scout`, ever
 *
 * Feature 006's `/scout` shows a Visible squad's composition, because that is
 * what scouting *is*. This surface shows no composition at all. Two routes, two
 * disclosure rules — **a shared serialiser between them is precisely how the
 * Hidden squad leaks**, because the leak arrives as someone widening one
 * response and not noticing the other changed with it.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { playerRatings } from '../db/schema/ratings.js';
import { squads } from '../db/schema/squads.js';
import { leagueOf } from '../matchmaking/league.js';
import { recentVisibleBattles, type ProfileBattle } from './visibleRecord.js';

/**
 * **The complete list of fields a player may hide. Two, and no mechanism to add
 * a third by accident** (FR-002).
 *
 * Neither is collected anywhere yet. That is not an oversight to fix here — it
 * means there is currently nothing hideable, which is the strongest possible
 * form of "these are the only two".
 */
export const HIDEABLE_FIELDS = ['timeZone', 'languages'] as const;

export interface PublicProfile {
  readonly playerId: string;
  readonly username: string;
  /** A curated key, an approved custom URL, or null for the default. */
  readonly avatar: { readonly kind: 'curated' | 'custom' | 'default'; readonly value: string | null };
  readonly accountAgeDays: number;
  readonly league: string | null;
  readonly rating: number | null;
  readonly gearScore: number | null;
  /**
   * **The Hidden zone contributes exactly one number to this response, and this
   * is it.** A streak is a count of holds; it says nothing about who is in the
   * squad, and it is already public by design — it is what makes a long-standing
   * defense worth attacking.
   */
  readonly holdStreaks: { readonly visible: number; readonly hidden: number };
  /**
   * **Null until feature 013 exists.** Guild membership is 013's table; the field
   * is in the shape now because the contract declares it and because a client
   * built against a profile without it would need changing twice.
   */
  readonly guild: { readonly id: string; readonly name: string; readonly role: string } | null;
  readonly recentBattles: readonly ProfileBattle[];
}

export class PlayerNotFoundError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build one player's public profile.
 *
 * **Every field is read explicitly.** There is no spread of an account row and
 * no `SELECT *` anywhere in this module — `accounts` carries an email-bearing
 * identity relation, a ban scope and a bot flag, and a spread would publish
 * whichever of them a later migration adds.
 */
export async function publicProfile(targetId: string): Promise<PublicProfile> {
  const [account] = await db()
    .select({
      id: accounts.id,
      username: accounts.username,
      createdAt: accounts.createdAt,
      avatarKey: accounts.avatarKey,
      customAvatarUrl: accounts.customAvatarUrl,
    })
    .from(accounts)
    .where(eq(accounts.id, targetId))
    .limit(1);

  if (!account) throw new PlayerNotFoundError(targetId);

  const [standing] = await db()
    .select({ rating: playerRatings.rating, gearScore: playerRatings.gearScore })
    .from(playerRatings)
    .where(eq(playerRatings.accountId, targetId))
    .limit(1);

  /**
   * Both defense squads' streaks, by zone. A player who has not built a zone has
   * no row, and the streak is 0 — which is also what a zone that has never held
   * reads as. **The two are deliberately indistinguishable**: "they have not
   * built a Hidden squad" is exactly the kind of fact this feature does not tell
   * anyone.
   */
  const defenseSquads = await db()
    .select({ zone: squads.zone, holdStreak: squads.holdStreak })
    .from(squads)
    .where(and(eq(squads.accountId, targetId), eq(squads.kind, 'defense')));

  const streakFor = (zone: 'visible' | 'hidden'): number =>
    defenseSquads.find((s) => s.zone === zone)?.holdStreak ?? 0;

  const recentBattles = await recentVisibleBattles(targetId);

  const gearScore = standing?.gearScore ?? null;

  return {
    playerId: account.id,
    username: account.username,
    avatar: account.customAvatarUrl
      ? { kind: 'custom', value: account.customAvatarUrl }
      : account.avatarKey
        ? { kind: 'curated', value: account.avatarKey }
        : { kind: 'default', value: null },
    /**
     * **Clamped at zero, because it went negative on the first run.**
     *
     * `created_at` defaults to Postgres's `now()` — the *database's* clock — and
     * this subtracts it from the *API process's* clock. Neon runs a few hundred
     * milliseconds ahead, so an account created moments ago has a `createdAt` in
     * the future and `Math.floor` of a small negative is **-1**. A profile
     * reading "account age: -1 days" is the kind of defect that ships, because
     * it is only ever visible on accounts under a day old.
     */
    accountAgeDays: Math.max(
      0,
      Math.floor((Date.now() - account.createdAt.getTime()) / DAY_MS),
    ),
    league: gearScore === null ? null : leagueOf(gearScore),
    rating: standing?.rating ?? null,
    gearScore,
    holdStreaks: { visible: streakFor('visible'), hidden: streakFor('hidden') },
    guild: null,
    recentBattles,
  };
  /**
   * ### What is absent, and why each one is listed rather than merely omitted
   *
   * | withheld | because |
   * |---|---|
   * | email, provider identity | never public, on any surface |
   * | entitlements | what somebody paid for is nobody else's business |
   * | shard balance | a live target list for anyone deciding whom to attack |
   * | **either** zone's composition | the Visible squad is scoutable via `/scout`; that is a different route with a different rule |
   * | any Hidden battle | `recentVisibleBattles` selects them out rather than filtering |
   * | a guild application | another player's pending application is theirs |
   *
   * The Visible squad being withheld *here* is the one that looks like a mistake
   * and is not. It is public elsewhere. Publishing it from two places means two
   * places to get the Hidden squad wrong.
   */
}
