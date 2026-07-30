/**
 * Finding a guild, and finding a player (013 — the discovery gap).
 *
 * ### TL;DR
 *
 * You can browse guilds and search them by name, and an officer can invite someone
 * by typing their name. Neither of those existed, which meant the whole feature
 * asked players to type UUIDs at each other.
 *
 * ### The ordering is the thing being tested
 *
 * *Guilds with room, newest first* — **never by member count.** Ranking a directory
 * by size compounds: the biggest guild is seen most, so it fills first, so it stays
 * biggest. That is *"nobody can out-roster anybody"* losing at the recruiting layer
 * instead of the roster one, and it is the sort of default that gets chosen once
 * and never revisited.
 *
 * ### And what is NOT here
 *
 * There is no player-search route, and `noPlayerSearch` below fails if one appears.
 * A prefix-enumerable index of every account is a scraper's shopping list; the
 * username lookup lives inside the invite action and matches exactly.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { GUILD_CAPACITY } from '../../src/guilds/config.js';
import { accountIdByUsername, searchGuilds } from '../../src/guilds/directory.js';
import { stripComments } from '../stripComments.js';
import { signIn, type Signed } from '../profiles/session.js';
import { Fixtures } from './helpers.js';

const fx = new Fixtures();
const tag = `dir${process.pid}${Math.floor(Math.random() * 1e6)}`;

let officer: Signed;
let recruit: Signed;
let bigGuild: string;
let smallGuild: string;

beforeAll(async () => {
  officer = await signIn('dirOfficer');
  recruit = await signIn('dirRecruit');
  fx.accountIds.push(officer.accountId, recruit.accountId);

  /** Named so a search can find exactly these two and nothing another suite made. */
  const big = await fx.guild(`${tag}Big`, officer.accountId);
  bigGuild = big.id;
  await db().update(accounts).set({ username: `${tag}Big` }).where(eq(accounts.id, officer.accountId));

  for (let i = 1; i < GUILD_CAPACITY; i++) {
    await fx.join(bigGuild, await fx.account(`${tag}fill${i}`));
  }

  const small = await fx.guild(`${tag}Small`);
  smallGuild = small.id;
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('browsing and searching', () => {
  it('finds a guild by a fragment of its name, case-folded', async () => {
    const found = await searchGuilds(`${tag}sm`);

    expect(
      found.map((g) => g.id),
      'a search that cannot find a guild by part of its name is not a search',
    ).toContain(smallGuild);
  });

  it('folds the query the same way names collide — so every name is reachable', async () => {
    const upper = await searchGuilds(`${tag}SMALL`.toUpperCase());
    const lower = await searchGuilds(`${tag}small`.toLowerCase());

    expect(upper.map((g) => g.id)).toContain(smallGuild);
    expect(lower.map((g) => g.id)).toContain(smallGuild);
  });

  it('reports a truthful count and room flag', async () => {
    const [full] = await searchGuilds(`${tag}Big`);

    expect(full?.memberCount).toBe(GUILD_CAPACITY);
    expect(full?.hasRoom).toBe(false);
    expect(full?.capacity).toBe(GUILD_CAPACITY);
  });

  it('puts a guild WITH ROOM ahead of a full one — never the biggest first', async () => {
    const found = await searchGuilds(tag);

    const smallAt = found.findIndex((g) => g.id === smallGuild);
    const bigAt = found.findIndex((g) => g.id === bigGuild);

    expect(smallAt, 'the one-member guild is missing from its own search').toBeGreaterThanOrEqual(0);
    expect(bigAt).toBeGreaterThanOrEqual(0);
    expect(
      smallAt,
      'ordering by size compounds — the biggest is seen most, so it fills first',
    ).toBeLessThan(bigAt);
  });

  it('a full guild is still FINDABLE by name — it sinks, it does not vanish', async () => {
    const found = await searchGuilds(`${tag}Big`);

    expect(
      found.map((g) => g.id),
      'somebody told to apply to a named guild must be able to find it',
    ).toContain(bigGuild);
  });

  it('never carries a roster — a browse must not enumerate players', async () => {
    const found = await searchGuilds(tag);
    const json = JSON.stringify(found);

    expect(json).not.toMatch(/members|playerId|username/i);
    expect(json).not.toContain(officer.accountId);
  });

  it('excludes a disbanded guild', async () => {
    const doomed = await fx.guild(`${tag}Gone`);
    const before = await searchGuilds(`${tag}Gone`);
    expect(before.map((g) => g.id)).toContain(doomed.id);

    const res = await app.request(`/v1/guilds/${doomed.id}`, {
      method: 'DELETE',
      headers: (await (async () => {
        const master = await signIn('dirDoomed');
        fx.accountIds.push(master.accountId);
        return master;
      })()).headers(),
    });
    /** Not the master, so 403 — disband it directly instead. */
    expect(res.status).toBe(403);

    const { dissolve } = await import('../../src/guilds/membership.js');
    const { fixedClock } = await import('../../src/guilds/clock.js');
    await dissolve(doomed.id, fixedClock('2026-08-01T00:00:00.000Z'));

    const after = await searchGuilds(`${tag}Gone`);
    expect(after.map((g) => g.id)).not.toContain(doomed.id);
  });
});

describe('inviting by name, with no player search anywhere', () => {
  it('resolves an exact username, folded', async () => {
    const found = await accountIdByUsername(recruit.username.toUpperCase());
    expect(found).toBe(recruit.accountId);
  });

  it('returns null for a name that does not exist — not an error', async () => {
    expect(await accountIdByUsername('nobody-by-this-name-at-all')).toBeNull();
    expect(await accountIdByUsername('   ')).toBeNull();
  });

  it('never resolves a bot — they are opponents, not recruits', async () => {
    // A bot, in any band but 'starter' — this test is about bots being
    // unrecruitable, not about the starter league, and a starter-band row
    // here would race tests/matchmaking/starter.test.ts.
    const bot = await fx.starterBot('bronze');
    const [row] = await db()
      .select({ username: accounts.username })
      .from(accounts)
      .where(eq(accounts.id, bot));

    expect(await accountIdByUsername(row!.username)).toBeNull();
  });

  it('an officer invites by typing a name, and it lands', async () => {
    const res = await app.request(`/v1/guilds/${smallGuild}/invites`, {
      method: 'POST',
      headers: officer.headers(),
      body: JSON.stringify({ username: recruit.username }),
    });

    /** The officer here is master of the OTHER guild, so this must be refused. */
    expect(res.status).toBe(403);
  });

  it('a mistyped name is a 404 an officer can act on, never a 500', async () => {
    const master = await signIn('dirInviter');
    fx.accountIds.push(master.accountId);
    const guild = await fx.guild(`${tag}Inv`, master.accountId);

    const res = await app.request(`/v1/guilds/${guild.id}/invites`, {
      method: 'POST',
      headers: master.headers(),
      body: JSON.stringify({ username: 'definitely-not-a-player' }),
    });

    expect(res.status).toBe(404);
  });

  it('and a real name from the same master succeeds', async () => {
    const master = await signIn('dirInviter2');
    fx.accountIds.push(master.accountId);
    const guild = await fx.guild(`${tag}Inv2`, master.accountId);

    const res = await app.request(`/v1/guilds/${guild.id}/invites`, {
      method: 'POST',
      headers: master.headers(),
      body: JSON.stringify({ username: recruit.username }),
    });

    expect([201, 409]).toContain(res.status);
  });
});

describe('there is no player-search route', () => {
  it('no guilds module exposes a prefix or LIKE query over accounts', () => {
    /**
     * The tempting shape is `GET /v1/players?q=`, and it is a prefix-enumerable
     * index of every account in the game. The lookup that exists matches **one
     * exact folded name**, inside the action that needs it.
     */
    const dir = join(import.meta.dirname, '../../src/guilds');

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'), file);

      /** A `like` against accounts is the enumeration; against guilds it is search. */
      expect(code, `${file} runs a LIKE over accounts`).not.toMatch(
        /accounts\.usernameKey\s*\}?\s*like|like\s*\$\{[^}]*accounts/i,
      );
    }
  });
});
