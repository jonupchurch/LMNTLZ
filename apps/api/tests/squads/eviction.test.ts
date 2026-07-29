/**
 * The eviction warning (T021–T022, SC-003).
 *
 * **Written first, and written for three squads, because that is the case it
 * exists for.** 3 x 6 = 18 seats drawn from 15 heroes, so one champion commonly
 * sits in all three attack squads — the plural path is the default and singular
 * is the branch, not the other way round.
 *
 * A warning built for one squad and scaled up reads wrong precisely when it
 * fires most, and a truncated list ("and 2 others") is how a player discovers
 * the third squad mid-battle.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';
import {
  SquadCannotAttackError,
  assertSquadCanAttack,
  type SquadShape,
} from '../../src/squads/allocation.js';

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

const seats = (ids: readonly string[]) => [
  { row: 'front', index: 0, heroId: ids[0] },
  { row: 'front', index: 1, heroId: ids[1] },
  { row: 'middle', index: 0, heroId: ids[2] },
  { row: 'middle', index: 1, heroId: ids[3] },
  { row: 'middle', index: 2, heroId: ids[4] },
  { row: 'back', index: 0, heroId: ids[5] },
];

const auth = () => ({ 'content-type': 'application/json', authorization: `Bearer ${session}` });

const putOffense = (slot: number, ids: readonly string[], name: string) =>
  app.request(`/v1/squads/offense/${slot}`, {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ name, seats: seats(ids) }),
  });

const defenseConfig = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
};

const putDefense = (zone: string, ids: readonly string[]) =>
  app.request(`/v1/squads/defense/${zone}`, {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ seats: seats(ids).map((s) => ({ ...s, config: defenseConfig })) }),
  });

const preview = (zone: string, heroId: string) =>
  app.request(`/v1/squads/defense/${zone}/preview-move`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ heroId }),
  });

/**
 * Fifteen free heroes, three squads of six, one champion in all three.
 * `SHARED` is the hero the warning is about.
 */
const FREE = ROSTER.slice(12);
const SHARED = FREE[0]!;

beforeAll(async () => {
  restore = overrideProvider('google', provider);
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:evict-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  session = body.session.token;

  // **Both defense zones full first.** SC-003's `heroes: 14` is 27 - 12 - 1, so
  // the scenario is a fully-committed player — which is also the only state in
  // which the pool sentence means anything.
  expect((await putDefense('visible', ROSTER.slice(0, 6))).status).toBe(200);
  expect((await putDefense('hidden', ROSTER.slice(6, 12))).status).toBe(200);

  expect(FREE).toHaveLength(15);
  expect((await putOffense(0, [SHARED, ...FREE.slice(1, 6)], 'Vanguard')).status).toBe(200);
  expect((await putOffense(1, [SHARED, ...FREE.slice(6, 11)], 'Second Wind')).status).toBe(200);
  expect((await putOffense(2, [SHARED, ...FREE.slice(11, 15), FREE[1]!], 'Long Reach')).status).toBe(200);
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

interface PreviewBody {
  evicts: { slot: number; name: string; wasComplete: boolean; wouldBe: number }[];
  poolAfter: { heroes: number; squads: number; seatsNeeded: number };
  streakReset?: boolean;
}

describe('a hero in all three attack squads (SC-003)', () => {
  it('names all three, untruncated', async () => {
    const res = await preview('visible', SHARED);
    expect(res.status).toBe(200);

    const body = (await res.json()) as PreviewBody;
    expect(body.evicts).toHaveLength(3);
    expect(body.evicts.map((e) => e.name)).toEqual(['Vanguard', 'Second Wind', 'Long Reach']);

    // Every entry carries what it costs, so the confirm can say "was ready".
    for (const e of body.evicts) {
      expect(e.wasComplete).toBe(true);
      expect(e.wouldBe).toBe(5);
    }

    // And nothing anywhere says "and N others".
    expect(JSON.stringify(body)).not.toMatch(/other/i);
  });

  it('states the pool, which is the sentence that makes the constraint legible', async () => {
    // 27 roster - 12 already defending - this one = 14, for 3 squads of 6.
    const body = (await (await preview('visible', SHARED)).json()) as PreviewBody;

    expect(body.poolAfter).toEqual({ heroes: 14, squads: 3, seatsNeeded: 18 });

    // **The whole point of the sentence**: 14 heroes cannot fill 18 seats, so
    // overlap is not a mistake the player made. No per-squad message says this.
    expect(body.poolAfter.heroes).toBeLessThan(body.poolAfter.seatsNeeded);
  });

  it('does NOT commit the move — the warning comes before anything changes', async () => {
    await preview('visible', SHARED);

    const roster = (await (
      await app.request('/v1/roster', { headers: auth() })
    ).json()) as { assignments: { offense: { seats: unknown[]; valid: boolean }[] } };

    for (const squad of roster.assignments.offense) {
      expect(squad.seats).toHaveLength(6);
      expect(squad.valid).toBe(true);
    }
  });
});

describe('the branches that get less exercise (T022)', () => {
  it('renders singular for a hero in exactly one squad', async () => {
    // FREE[6] is only in Second Wind.
    const body = (await (await preview('visible', FREE[6]!)).json()) as PreviewBody;
    expect(body.evicts).toHaveLength(1);
    expect(body.evicts[0]!.name).toBe('Second Wind');
  });

  it('returns an empty list for a hero in no squad, rather than an error', async () => {
    // ROSTER[0] is not on any attack squad. The client skips the confirm
    // entirely — an empty warning dialog is worse than none.
    const body = (await (await preview('visible', ROSTER[0]!)).json()) as PreviewBody;
    expect(body.evicts).toEqual([]);
  });

  it('is 422 for a hero that does not exist', async () => {
    expect((await preview('visible', 'h99')).status).toBe(422);
  });

  it('404s an unknown zone', async () => {
    expect((await preview('sideways', SHARED)).status).toBe(404);
  });
});

describe('committing the move actually evicts (T025, T026, T027)', () => {
  it('removes the hero from every squad and marks each invalid', async () => {
    const defense = [SHARED, ...ROSTER.slice(0, 5)];
    const res = await app.request('/v1/squads/defense/visible', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({
        seats: seats(defense).map((s) => ({
          ...s,
          config: { targeting: ['lowest-current-hp', 'nearest'], ranking: [5, 4, 3, 2, 1, 0], allyRule: null },
        })),
      }),
    });
    expect(res.status).toBe(200);

    const roster = (await (
      await app.request('/v1/roster', { headers: auth() })
    ).json()) as {
      assignments: { offense: { name: string; seats: { heroId: string }[]; valid: boolean; complete: boolean }[] };
    };

    expect(roster.assignments.offense).toHaveLength(3);
    for (const squad of roster.assignments.offense) {
      // **No auto-repair (T027).** Nothing substituted a hero into the gap —
      // the squad is the player's plan, and filling it replaces the plan with a
      // guess while hiding that they are now over-committed.
      expect(squad.seats).toHaveLength(5);
      expect(squad.seats.some((s) => s.heroId === SHARED)).toBe(false);

      // `valid: false` is a stored fact, not a derived view: the player has to
      // see WHICH squads a defensive change broke, and a merely-unfinished
      // squad looks identical to one they never completed.
      expect(squad.valid).toBe(false);
      expect(squad.complete).toBe(false);
    }
  });

  it('refuses to attack with a squad left short by the eviction (T026, SC-009)', () => {
    // **The squad in this state was broken by our own rule, not by the player
    // leaving it unfinished.** Letting it fight five-strong would be a loss the
    // game caused and the player could not see coming.
    const broken: SquadShape = {
      id: 'x',
      kind: 'offense',
      slotIndex: 0,
      name: 'Vanguard',
      seats: [
        { row: 'front', index: 0, heroId: ROSTER[13]! },
        { row: 'front', index: 1, heroId: ROSTER[14]! },
        { row: 'middle', index: 0, heroId: ROSTER[15]! },
        { row: 'middle', index: 1, heroId: ROSTER[16]! },
        { row: 'middle', index: 2, heroId: ROSTER[17]! },
      ],
    };

    expect(() => assertSquadCanAttack(broken, 0)).toThrow(SquadCannotAttackError);
    try {
      assertSquadCanAttack(broken, 0);
    } catch (err) {
      expect((err as SquadCannotAttackError).status).toBe(409);
      expect((err as SquadCannotAttackError).seated).toBe(5);
      // Names the squad, so the player knows which one to refill.
      expect((err as Error).message).toContain('Vanguard');
    }

    // Refilled to six, it can attack again. No other action is required — and
    // in particular nothing auto-filled it.
    const refilled: SquadShape = {
      ...broken,
      seats: [...broken.seats, { row: 'back', index: 0, heroId: ROSTER[18]! }],
    };
    expect(() => assertSquadCanAttack(refilled, 0)).not.toThrow();
  });
});
