/**
 * The route-level rejections (T013).
 *
 * Each of these is a different status for a different reason, and collapsing any
 * two would make the client unable to tell the player what to do:
 *
 * ```
 * 422  the squad you sent is not a squad         → fix the shape
 * 409  that hero is committed elsewhere          → move her first
 * 404  there is no such zone or slot             → a client bug
 * ```
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];
let restore: (() => void) | undefined;
let session = '';

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

beforeAll(async () => {
  restore = overrideProvider('google', provider);
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:sq-val-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  session = body.session.token;
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

interface WireConfig {
  targeting: string[];
  ranking: number[];
  /** Widened from `null` so a test can substitute an unknown rule. */
  allyRule: string | null;
}

const config = (ranking: number[] = [5, 4, 3, 2, 1, 0]): WireConfig => ({
  targeting: ['lowest-current-hp', 'nearest'],
  ranking,
  allyRule: null,
});

/** Six ids into 2 front / 3 middle / 1 back, each with a valid defense config. */
const defenseSeats = (ids: readonly string[], ranking?: number[]) => [
  { row: 'front', index: 0, heroId: ids[0], config: config(ranking) },
  { row: 'front', index: 1, heroId: ids[1], config: config() },
  { row: 'middle', index: 0, heroId: ids[2], config: config() },
  { row: 'middle', index: 1, heroId: ids[3], config: config() },
  { row: 'middle', index: 2, heroId: ids[4], config: config() },
  { row: 'back', index: 0, heroId: ids[5], config: config() },
];

const putDefense = (zone: string, seats: unknown) =>
  app.request(`/v1/squads/defense/${zone}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body: JSON.stringify({ seats }),
  });

const putOffense = (slot: number | string, seats: unknown, name = 'Vanguard') =>
  app.request(`/v1/squads/offense/${slot}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body: JSON.stringify({ name, seats }),
  });

describe('the shape is 422', () => {
  it('rejects five seats instead of six', async () => {
    const res = await putDefense('visible', defenseSeats(ROSTER.slice(0, 6)).slice(0, 5));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('wrong-size');
  });

  it('rejects a ranking that is not a permutation of 0-5', async () => {
    // **`[0,1,2,3,4,4]` is six entries, all in range.** A length check passes it.
    // It leaves one power unreachable and another ranked twice, and the engine
    // would resolve it into something — silently, and differently on each side.
    const res = await putDefense('visible', defenseSeats(ROSTER.slice(0, 6), [0, 1, 2, 3, 4, 4]));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/permutation/i);
  });

  it('rejects a ranking with a value out of range', async () => {
    const res = await putDefense('visible', defenseSeats(ROSTER.slice(0, 6), [0, 1, 2, 3, 4, 6]));
    expect(res.status).toBe(422);
  });

  /**
   * ### This assertion was inverted on purpose, and the reason is worth keeping
   *
   * It used to require `422` for a defense seat with no `config`, and that made
   * the builder impossible to finish. The role-default table is **server-only** —
   * shipping it would hand every player the exact ranking the engine plays against
   * them — so a client seating a champion for the first time has no configuration
   * to send and no legal way to derive one. Requiring the field meant the only
   * accepted save was one where the client had *invented* a configuration.
   *
   * So an absent config now means *"the Role default"*, which is the promise
   * FR-023 already made about a squad saved without touching a control. See
   * `defaults.test.ts` for what actually gets stored.
   */
  it('accepts a defense seat with no config, and does not silently drop it', async () => {
    const seats = defenseSeats(ROSTER.slice(0, 6)).map(({ config: _c, ...rest }) => rest);
    expect((await putDefense('visible', seats)).status).toBe(200);
  });

  it('rejects a targeting rule the engine does not have', async () => {
    /**
     * **The failure this prevents landed on the wrong player.** `battle/snapshot.ts`
     * refuses to parse a defender carrying an unknown rule — so a squad saved with
     * one was a squad that raised `MalformedSnapshotError` against *whoever attacked
     * it*, about a value its owner supplied. Both boundaries now use one predicate.
     */
    const seats = defenseSeats(ROSTER.slice(0, 6));
    seats[0]!.config = { targeting: ['lowest-current-hp', 'whatever'], ranking: [5, 4, 3, 2, 1, 0], allyRule: null };

    const res = await putDefense('visible', seats);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/known rules/i);
  });

  it('rejects an allyRule the engine does not have', async () => {
    const seats = defenseSeats(ROSTER.slice(0, 6));
    seats[0]!.config = {
      targeting: ['lowest-current-hp', 'nearest'],
      ranking: [5, 4, 3, 2, 1, 0],
      allyRule: 'heal-the-strongest',
    };

    const res = await putDefense('visible', seats);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/known rule/i);
  });
});

describe('a hero committed elsewhere is 409', () => {
  it('refuses a hero already on the other defense zone, and names it', async () => {
    expect((await putDefense('visible', defenseSeats(ROSTER.slice(0, 6)))).status).toBe(200);

    // Overlaps by one with the visible zone.
    const res = await putDefense('hidden', defenseSeats([ROSTER[0]!, ...ROSTER.slice(6, 11)]));
    expect(res.status).toBe(409);

    const body = (await res.json()) as { heroId: string; zone: string };
    expect(body.heroId).toBe(ROSTER[0]);
    // "cannot be used" is not actionable; naming the zone is.
    expect(body.zone).toBe('visible');
  });

  it('refuses a defending hero on an attack squad, naming the zone', async () => {
    const res = await putOffense(0, [
      { row: 'front', index: 0, heroId: ROSTER[0] },
      { row: 'front', index: 1, heroId: ROSTER[12] },
      { row: 'middle', index: 0, heroId: ROSTER[13] },
      { row: 'middle', index: 1, heroId: ROSTER[14] },
      { row: 'middle', index: 2, heroId: ROSTER[15] },
      { row: 'back', index: 0, heroId: ROSTER[16] },
    ]);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { zone: string }).zone).toBe('visible');
  });

  it('permits re-saving the SAME zone with the same heroes', async () => {
    // The exclusivity check looks at the OTHER zone only. Checking both would
    // make a defense squad impossible to edit — every hero in it would collide
    // with itself.
    expect((await putDefense('visible', defenseSeats(ROSTER.slice(0, 6)))).status).toBe(200);
  });
});

describe('offense takes no per-champion config', () => {
  it('accepts seats with no config', async () => {
    const res = await putOffense(1, [
      { row: 'front', index: 0, heroId: ROSTER[12] },
      { row: 'front', index: 1, heroId: ROSTER[13] },
      { row: 'middle', index: 0, heroId: ROSTER[14] },
      { row: 'middle', index: 1, heroId: ROSTER[15] },
      { row: 'middle', index: 2, heroId: ROSTER[16] },
      { row: 'back', index: 0, heroId: ROSTER[17] },
    ]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { complete: boolean }).complete).toBe(true);
  });
});

describe('a bad zone or slot is 404, not 422', () => {
  it('404s an unknown zone', async () => {
    expect((await putDefense('sideways', defenseSeats(ROSTER.slice(0, 6)))).status).toBe(404);
  });

  it('404s slot 3 — there are three attack squads, 0 to 2', async () => {
    expect((await putOffense(3, [])).status).toBe(404);
  });
});

describe('every squad route needs a session', () => {
  it('401s without one', async () => {
    expect((await app.request('/v1/roster')).status).toBe(401);

    for (const path of ['/v1/squads/defense/visible', '/v1/squads/offense/0']) {
      const res = await app.request(path, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seats: [] }),
      });
      expect(res.status, path).toBe(401);
    }
  });
});
