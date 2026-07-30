/**
 * Fixtures for the guilds suite.
 *
 * Rows are inserted directly rather than driven through routes: the cases this
 * feature turns on are *races* and *timelines*, and a fixture that signs in over
 * HTTP adds several Neon round trips to every one of them. The route layer is
 * covered by its own tests.
 *
 * **Names must not collide with the roster.** `profiles/export.test.ts` learned
 * this the hard way — a fixture opponent called "Vantric" is champion `h22`, and a
 * correct leak scan failed reading like a real disclosure. Everything here is
 * prefixed and suffixed, so nothing can look like authored content.
 */

import { inArray } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { guilds, guildMembers, type GuildRole } from '../../src/db/schema/guilds.js';

export const suffix = (tag: string): string =>
  `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

/**
 * Accounts a test made, so `afterAll` can take them back out.
 *
 * Guilds cascade from nothing — a guild is not owned by an account — so they are
 * tracked separately. **`a-flake-leaves-evidence`**: a leftover row here is the
 * cause of the next run's failure, not a shrug.
 */
export class Fixtures {
  readonly accountIds: string[] = [];
  readonly guildIds: string[] = [];

  async account(tag: string, over: { readonly createdAt?: Date } = {}): Promise<string> {
    const key = suffix(tag);
    const [row] = await db()
      .insert(accounts)
      .values({
        username: `GT ${key}`,
        usernameKey: key,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      })
      .returning({ id: accounts.id });

    this.accountIds.push(row!.id);
    return row!.id;
  }

  /** A guild with a master already in it — the state every other test starts from. */
  async guild(tag: string, masterId?: string): Promise<{ id: string; masterId: string }> {
    const key = suffix(tag);
    const [row] = await db()
      .insert(guilds)
      .values({ name: `GT ${key}`, nameKey: key })
      .returning({ id: guilds.id });

    const master = masterId ?? (await this.account(`${tag}-m`));
    this.guildIds.push(row!.id);
    await db()
      .insert(guildMembers)
      .values({ accountId: master, guildId: row!.id, role: 'master' });

    return { id: row!.id, masterId: master };
  }

  async join(guildId: string, accountId: string, role: GuildRole = 'member'): Promise<void> {
    await db().insert(guildMembers).values({ accountId, guildId, role });
  }

  async cleanup(): Promise<void> {
    if (this.guildIds.length > 0) {
      await db().delete(guilds).where(inArray(guilds.id, this.guildIds));
      this.guildIds.length = 0;
    }
    if (this.accountIds.length > 0) {
      await db().delete(accounts).where(inArray(accounts.id, this.accountIds));
      this.accountIds.length = 0;
    }
  }
}
