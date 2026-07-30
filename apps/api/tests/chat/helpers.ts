/**
 * Fixtures for the chat suite.
 *
 * Rows are inserted directly, as in the guilds suite and for the same reason:
 * what this feature turns on is *who may read what*, and driving every setup
 * through HTTP adds Neon round trips to assertions that are really about a
 * channel list.
 *
 * **Names are prefixed and suffixed** so nothing can collide with the roster —
 * `profiles/export.test.ts` learned that when a fixture opponent called "Vantric"
 * turned out to be champion `h22` and a correct leak scan failed, reading like a
 * real disclosure.
 */

import { inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts, type BotBand } from '../../src/db/schema/accounts.js';
import { guilds, guildMembers, type GuildRole } from '../../src/db/schema/guilds.js';
import { usernameKey } from '../../src/auth/username.js';

export const suffix = (tag: string): string =>
  `CT-${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

export class ChatFixtures {
  readonly accountIds: string[] = [];
  readonly guildIds: string[] = [];

  async account(
    tag: string,
    over: {
      readonly createdAt?: Date;
      readonly isEnvoy?: boolean;
      readonly bannedUntil?: Date;
      readonly banScope?: 'chat' | 'guild' | 'full';
    } = {},
  ): Promise<string> {
    const key = suffix(tag);
    const [row] = await db()
      .insert(accounts)
      .values({
        username: `GT ${key}`,
        usernameKey: key,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
        ...(over.isEnvoy === undefined ? {} : { isEnvoy: over.isEnvoy }),
        ...(over.bannedUntil ? { bannedUntil: over.bannedUntil } : {}),
        ...(over.banScope ? { banScope: over.banScope } : {}),
      })
      .returning({ id: accounts.id });

    this.accountIds.push(row!.id);
    return row!.id;
  }

  /**
   * **One starter-band bot, so the starter league is OPEN.**
   *
   * `starterStatus()` reports `no-authored-pool` when the database holds no
   * `is_bot` row in the `starter` band, which makes *every* "is this player in
   * the starter league?" question answer no — and a Beginner-chat test without
   * this would assert the room is unreachable and pass for entirely the wrong
   * reason. See `fixtures-must-match-production`.
   *
   * **The band is a parameter** because `'starter'` is globally observable: one
   * such row anywhere makes `starterLeagueOpen()` true for every file, and
   * `tests/matchmaking/starter.test.ts` opens by asserting it is false. Ask for
   * `'starter'` only when the league genuinely has to be open.
   */
  async bot(band: BotBand = 'starter'): Promise<string> {
    const key = suffix('bot');
    const [row] = await db()
      .insert(accounts)
      .values({ username: `GT ${key}`, usernameKey: key, isBot: true, botBand: band })
      .returning({ id: accounts.id });

    this.accountIds.push(row!.id);
    return row!.id;
  }

  /** A guild with one member in it, since a channel list needs a membership. */
  async guildWith(accountId: string, role: GuildRole = 'master'): Promise<string> {
    const name = `GT ${suffix('guild')}`;
    const [guild] = await db()
      .insert(guilds)
      // nameKey folded exactly as foundGuild folds it — a fixture that writes a
      // row differently from production tests a database nobody has.
      .values({ name, nameKey: usernameKey(name) })
      .returning({ id: guilds.id });

    this.guildIds.push(guild!.id);
    await db().insert(guildMembers).values({ accountId, guildId: guild!.id, role });
    return guild!.id;
  }

  async cleanup(): Promise<void> {
    if (this.guildIds.length > 0) {
      await db().delete(guilds).where(inArray(guilds.id, this.guildIds));
    }
    if (this.accountIds.length > 0) {
      await db().delete(accounts).where(inArray(accounts.id, this.accountIds));
    }
  }
}
