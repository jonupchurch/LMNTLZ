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
import { guildMembers, guilds } from '../db/schema/guilds.js';
import { leagueOf } from '../matchmaking/league.js';
import { avatarFrom, type AvatarChoice } from './identity.js';
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
  readonly avatar: AvatarChoice;
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
   * **Filled by feature 013** (013 T063). `null` means *not in a guild*, which is
   * an ordinary state — it no longer means *not built*.
   *
   * Guild membership is **public**, which is why it is here at all: Constitution
   * XVII is *storing is not exposing*, and this is the half that is deliberately
   * exposed. What stays private is the **application** history — whether somebody
   * applied to four guilds and was turned down by three is between them and those
   * guilds. `boundary.test.ts` asserts that separation from the other side.
   */
  readonly guild: { readonly id: string; readonly name: string; readonly role: string } | null;
  readonly recentBattles: readonly ProfileBattle[];
}

export class PlayerNotFoundError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The public half of guild membership (013 T063).
 *
 * **Three fields and no fourth.** Not the roster — that is `GET /v1/guilds/:id`,
 * which a viewer can follow if they want it — and never the guild's applications.
 * A profile that carried the roster would make every player's profile a way to
 * enumerate every guild's membership without asking for it.
 *
 * Kept in this module rather than imported from `guilds/` as a view helper because
 * **this file owns what a profile discloses**; a guild-shaped object arriving from
 * elsewhere is exactly how a field nobody audited gets published.
 */
async function guildBadge(
  accountId: string,
): Promise<{ readonly id: string; readonly name: string; readonly role: string } | null> {
  const [row] = await db()
    .select({
      id: guilds.id,
      name: guilds.name,
      role: guildMembers.role,
    })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(eq(guildMembers.accountId, accountId))
    .limit(1);

  return row ?? null;
}

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
    /** One precedence rule, in `identity.ts`. See `avatarFrom` for why. */
    avatar: avatarFrom(account),
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
    guild: await guildBadge(targetId),
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
