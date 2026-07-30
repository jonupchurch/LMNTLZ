/**
 * Finding a guild to apply to (013 — a gap found during the wiring pass).
 *
 * ### Why this file is not in the task list
 *
 * It is not in `contracts/guilds-api.md` either, and that is the defect: the
 * contract has `POST /v1/guilds/:guildId/applications` and no way on earth to
 * learn a `guildId`. The client shipped an application form asking a human to type
 * a UUID. **Every route worked and the feature was unusable** — the same shape as
 * a component nothing renders, one level up.
 *
 * The spec leans on feature 014's Guild Ads for recruiting, but 014 ships *after*
 * this one, so at 1.0 there would be no way to reach the screen the feature is
 * about.
 *
 * ### The ordering is a design decision, not a default
 *
 * A directory is a ranking surface, and the obvious ranking — **most members
 * first** — is the one to avoid. It compounds: the biggest guild is seen most, so
 * it fills first, so it stays biggest. That is the *"nobody can out-roster
 * anybody"* principle losing at the recruiting layer instead of the roster one.
 *
 * So the order is **guilds with room, newest first**. A guild founded an hour ago
 * is on the first page; a full guild sinks but stays findable by name, because
 * somebody told to *"apply to The Long Reach"* must be able to find The Long Reach
 * whether or not it has a seat free today.
 *
 * ### No player search anywhere in this feature
 *
 * Inviting needs a username → id lookup, and the tempting shape is
 * `GET /v1/players?q=`. That is a prefix-enumerable index of every account in the
 * game, which is a scraper's shopping list (Constitution XVII). The lookup happens
 * **inside the invite route, on an exact name**, so you can only reach somebody you
 * could already name.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { guildMembers, guilds } from '../db/schema/guilds.js';
import { usernameKey } from '../auth/username.js';
import { GUILD_CAPACITY } from './config.js';

export interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly emblem: { readonly icon: number; readonly ink: number; readonly ground: number };
  readonly pitch: string;
  readonly memberCount: number;
  readonly capacity: number;
  readonly foundedAt: Date;
  readonly hasRoom: boolean;
}

/** One page. Deliberately small: a wall of guilds is not a choice, it is a list. */
export const DIRECTORY_PAGE = 24;

/**
 * Browse or search.
 *
 * `query` matches on the **folded** key, so a search for *"long reach"* finds
 * *"The Long Reach"* — the same folding that decides whether two names collide,
 * which means a name you cannot find is a name that could not have been taken.
 *
 * **The roster is not here.** A directory entry is the poster, not the guild;
 * `GET /v1/guilds/:guildId` is where members live, and keeping them apart is what
 * stops a browse from enumerating every player in the game a page at a time.
 */
export async function searchGuilds(
  query: string,
  options: { readonly offset?: number } = {},
): Promise<readonly DirectoryEntry[]> {
  const trimmed = query.trim();

  /**
   * **A `LEFT JOIN`, and the "left" is load-bearing.** An inner join would drop
   * every guild with zero members — and a guild whose last member left should stop
   * appearing *because `disbanded_at` is set*, deliberately, not vanish as a
   * side-effect of a join type.
   *
   * A correlated subquery was tried first and returned **0 for every guild**: it
   * read correctly, produced no error, and `directory.test.ts` caught it only
   * because one assertion checks the count rather than the ordering. An aggregate
   * that is silently zero is worse than one that throws — the page still renders,
   * every guild simply looks empty.
   */
  const memberCount = sql<number>`count(${guildMembers.accountId})::int`;

  const rows = await db()
    .select({
      id: guilds.id,
      name: guilds.name,
      icon: guilds.emblemIcon,
      ink: guilds.emblemInk,
      ground: guilds.emblemGround,
      pitch: guilds.pitch,
      foundedAt: guilds.foundedAt,
      memberCount,
    })
    .from(guilds)
    .leftJoin(guildMembers, eq(guildMembers.guildId, guilds.id))
    .where(
      trimmed === ''
        ? isNull(guilds.disbandedAt)
        : and(
            isNull(guilds.disbandedAt),
            sql`${guilds.nameKey} like ${`%${usernameKey(trimmed)}%`}`,
          ),
    )
    .groupBy(
      guilds.id,
      guilds.name,
      guilds.emblemIcon,
      guilds.emblemInk,
      guilds.emblemGround,
      guilds.pitch,
      guilds.foundedAt,
    )
    /**
     * Room first, then newest. **Not member count** — see the header; ranking by
     * size is how a directory quietly decides the game's social structure.
     */
    .orderBy(sql`count(${guildMembers.accountId}) < ${GUILD_CAPACITY} desc`, desc(guilds.foundedAt))
    .limit(DIRECTORY_PAGE)
    .offset(options.offset ?? 0);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    emblem: { icon: row.icon, ink: row.ink, ground: row.ground },
    pitch: row.pitch,
    memberCount: row.memberCount,
    capacity: GUILD_CAPACITY,
    foundedAt: row.foundedAt,
    hasRoom: row.memberCount < GUILD_CAPACITY,
  }));
}

/**
 * A username → account id, **exact match only**.
 *
 * Folded, so `reyna` finds `Reyna` — the same rule that decides collisions, which
 * means every name that exists is reachable and no name that does not is guessable
 * by prefix. Returns `null` rather than throwing: *"no such player"* is an ordinary
 * answer to an officer who mistyped, not an error.
 *
 * **Bots are excluded.** They are opponents, not recruits, and a guild of authored
 * accounts would quietly defeat the starter league's own pool.
 */
export async function accountIdByUsername(username: string): Promise<string | null> {
  const key = usernameKey(username.normalize('NFC').trim());
  if (key === '') return null;

  const [row] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.usernameKey, key), eq(accounts.isBot, false)))
    .limit(1);

  return row?.id ?? null;
}
