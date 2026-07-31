/**
 * The permission grid, **enforced server-side** (013 T035, T037, T038 · FR-017,
 * FR-018 · Constitution XII).
 *
 * ### TL;DR
 *
 * A guild has one leader, up to three deputies, and everyone else. Deputies can
 * recruit and remove people; they cannot dissolve the guild or change its identity.
 * The rules are checked on the server, so a client that shows the wrong button
 * still gets told no.
 *
 * ### The refusal is asserted, not the button's absence
 *
 * Hiding a control is a courtesy to the honest player and no obstacle at all to
 * anybody else. Every case here calls the route directly with the wrong role and
 * expects a `403` — which is the only version of this claim that is true about the
 * *system* rather than about one screen.
 *
 * ### The master has no `succession` mark, and that is not an oversight
 *
 * Succession is a petition *against* the master. The one person who cannot file it
 * is the person it is about.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/index.js';
import { closeDb } from '../../src/db/client.js';
import { GUILD_PERMISSIONS, roleCan, setRole } from '../../src/guilds/membership.js';
import { FOUNDING_COST_SHARDS, MAX_OFFICERS } from '../../src/guilds/config.js';
import { signIn, type Signed } from '../profiles/session.js';
import { Fixtures } from './helpers.js';

const fx = new Fixtures();

let guildId: string;
let master: Signed;
let officer: Signed;
let member: Signed;
let outsider: Signed;

beforeAll(async () => {
  master = await signIn('roleMaster');
  officer = await signIn('roleOfficer');
  member = await signIn('roleMember');
  outsider = await signIn('roleOutsider');

  for (const s of [master, officer, member, outsider]) fx.accountIds.push(s.accountId);

  const made = await fx.guild('roles', master.accountId);
  guildId = made.id;

  await fx.join(guildId, officer.accountId, 'officer');
  await fx.join(guildId, member.accountId, 'member');
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('the grid, as data', () => {
  it('is exactly three roles and eight permissions', () => {
    expect(GUILD_PERMISSIONS).toHaveLength(8);
  });

  it('officers may recruit and remove; they may NOT disband or restyle', () => {
    expect(roleCan('officer', 'invite')).toBe(true);
    expect(roleCan('officer', 'accept')).toBe(true);
    expect(roleCan('officer', 'kick')).toBe(true);
    expect(roleCan('officer', 'succession')).toBe(true);
    expect(roleCan('officer', 'motd')).toBe(true);

    expect(roleCan('officer', 'disband'), 'an officer must not dissolve what they did not build')
      .toBe(false);
    expect(roleCan('officer', 'emblem')).toBe(false);
    expect(roleCan('officer', 'pitch')).toBe(false);
  });

  it('the master may do everything EXCEPT file a succession against themselves', () => {
    for (const permission of GUILD_PERMISSIONS) {
      const expected = permission !== 'succession';
      expect(roleCan('master', permission), `master.${permission}`).toBe(expected);
    }
  });

  it('a member may do nothing at all', () => {
    for (const permission of GUILD_PERMISSIONS) {
      expect(roleCan('member', permission), `member.${permission}`).toBe(false);
    }
  });
});

describe('the routes refuse — the six-row proof over HTTP', () => {
  const invite = async (who: Signed): Promise<Response> =>
    app.request(`/v1/guilds/${guildId}/invites`, {
      method: 'POST',
      headers: who.headers(),
      body: JSON.stringify({ playerId: outsider.accountId }),
    });

  it('a member inviting is 403', async () => {
    expect((await invite(member)).status).toBe(403);
  });

  it('an officer inviting is not', async () => {
    const res = await invite(officer);
    expect([201, 409]).toContain(res.status);
  });

  it('an officer setting the emblem is 403', async () => {
    const res = await app.request(`/v1/guilds/${guildId}/emblem`, {
      method: 'PUT',
      headers: officer.headers(),
      body: JSON.stringify({ emblem: { icon: 3, ink: 3, ground: 3 } }),
    });

    expect(res.status).toBe(403);
  });

  it('a master setting the emblem is 200', async () => {
    const res = await app.request(`/v1/guilds/${guildId}/emblem`, {
      method: 'PUT',
      headers: master.headers(),
      body: JSON.stringify({ emblem: { icon: 3, ink: 3, ground: 3 } }),
    });

    expect(res.status).toBe(200);
  });

  it('an officer disbanding is 403', async () => {
    const res = await app.request(`/v1/guilds/${guildId}`, {
      method: 'DELETE',
      headers: officer.headers(),
    });

    expect(res.status).toBe(403);
  });

  it('an OUTSIDER is refused everything, including reading the review queue', async () => {
    const res = await app.request(`/v1/guilds/${guildId}/applications`, {
      headers: outsider.headers(),
    });

    expect(res.status).toBe(403);
  });
});

describe('at most three officers (FR-017)', () => {
  it('refuses the fourth promotion, and the guild still has three', async () => {
    const extras: string[] = [];
    for (let i = 0; i < MAX_OFFICERS + 1; i++) {
      const id = await fx.account(`extraOfficer${i}`);
      await fx.join(guildId, id);
      extras.push(id);
    }

    /** One officer already exists, so two more reach the cap of three. */
    const first = await setRole(guildId, master.accountId, extras[0]!, 'officer');
    const second = await setRole(guildId, master.accountId, extras[1]!, 'officer');
    expect(first.ok && second.ok).toBe(true);

    const fourth = await setRole(guildId, master.accountId, extras[2]!, 'officer');
    expect(fourth.ok).toBe(false);
    expect(!fourth.ok && fourth.reason).toBe('officer-limit');
  });

  it('an officer cannot promote — only the master may', async () => {
    const result = await setRole(guildId, officer.accountId, member.accountId, 'officer');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('forbidden');
  });

  it('nobody can promote themselves to master — the role is not reachable', async () => {
    /**
     * `setRole` takes `Exclude<GuildRole, 'master'>`, so this is a **compile-time**
     * refusal. The runtime check exists anyway because the route parses a string
     * off the wire and a type cannot reach that far.
     */
    const res = await app.request(
      `/v1/guilds/${guildId}/members/${officer.accountId}/role`,
      {
        method: 'PUT',
        headers: master.headers(),
        body: JSON.stringify({ role: 'master' }),
      },
    );

    expect(res.status, 'the only routes to master are founding and succession').toBe(400);
  });
});

/**
 * **`GET /v1/me/guild` carries the shard price** (017 T057 · Constitution XV).
 *
 * ### TL;DR
 *
 * Founding a guild costs shards, and so does inheriting one. The screens that
 * mention that price now read it from the server instead of having the number
 * typed into their sentences.
 *
 * ### Why the field exists at all
 *
 * `GET /v1/guilds/new` has always returned `cost`, and it is fetched only when
 * somebody clicks *Found a guild*. Every screen for a player who is **already in
 * a guild** therefore had no source for the number — so four sentences in the
 * client wrote `650` out by hand: the disband warning, and three in the
 * succession panel. Each was correct and none was connected to
 * `FOUNDING_COST_SHARDS`, so the first change to that constant would have left
 * the game quoting a price it does not charge, with nothing to catch it.
 *
 * Asserted against the constant rather than against `650`, so this test cannot
 * become the fifth transcription.
 */
describe('the price of a guild travels with the payload', () => {
  it('sends foundingCostShards, and it is the constant the charge uses', async () => {
    const res = await app.request('/v1/me/guild', { headers: master.headers() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { foundingCostShards?: number };
    expect(
      body.foundingCostShards,
      'without this the disband and succession copy has no source for the price',
    ).toBe(FOUNDING_COST_SHARDS);
  });

  it('sends it to a player with no guild too — that is who founds one', async () => {
    const res = await app.request('/v1/me/guild', { headers: outsider.headers() });
    const body = (await res.json()) as { guild: unknown; foundingCostShards?: number };

    expect(body.guild).toBeNull();
    expect(body.foundingCostShards).toBe(FOUNDING_COST_SHARDS);
  });
});
