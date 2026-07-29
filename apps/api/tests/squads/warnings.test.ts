/**
 * The two non-blocking warnings (T046, T050).
 *
 * **The assertion that matters is `200`, not the message.** Both of these look
 * like mistakes, which is exactly why the tempting implementation makes them
 * `422`s — and blocking them would make the builder refuse legitimate strategy.
 * A reach-1 champion in the back seat is how you protect a fragile high-damage
 * attacker; it is a real choice with a real cost.
 *
 * Constitution XVIII: **harm is a gate, taste is a note.** The only thing this
 * feature gates is eviction, which is destructive and non-obvious.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { BATTLE_TURNS, SWEEP_TURNS, firingProfile, type PowerRanking } from '@lmntlz/sim/rules';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const HEROES = getAllHeroes();
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

const HEALTHY: PowerRanking = [5, 4, 3, 2, 1, 0] as PowerRanking;
/** Puts the two highest tiers below the ungated tier-0, so neither ever fires. */
const SELF_DEFEATING: PowerRanking = [1, 2, 3, 4, 5, 0] as PowerRanking;

const reach1 = HEROES.find((h) => h.reach === 1)!;
const reach2 = HEROES.filter((h) => h.reach === 2);

interface Body {
  warnings: { code: string; heroId: string; message: string; tiers?: number[] }[];
  holdStreak: number;
}

const save = (backHero: string, ranking: PowerRanking) => {
  // **The other five must exclude the back-seat champion.** A hero in two seats
  // is a 422 for a completely different reason, and it would look like the
  // warning had blocked the save.
  const others = reach2.filter((h) => h.id !== backHero).slice(0, 5);

  return app.request('/v1/squads/defense/visible', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body: JSON.stringify({
      seats: [
        { row: 'front', index: 0, heroId: others[0]!.id },
        { row: 'front', index: 1, heroId: others[1]!.id },
        { row: 'middle', index: 0, heroId: others[2]!.id },
        { row: 'middle', index: 1, heroId: others[3]!.id },
        { row: 'middle', index: 2, heroId: others[4]!.id },
        { row: 'back', index: 0, heroId: backHero },
      ].map((s, i) => ({
        ...s,
        config: {
          targeting: ['lowest-current-hp', 'nearest'],
          // Only the back seat gets the ranking under test, so the assertions
          // below are about one champion rather than six.
          ranking: i === 5 ? ranking : HEALTHY,
          allyRule: null,
        },
      })),
    }),
  });
};

beforeAll(async () => {
  restore = overrideProvider('google', provider);
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:warn-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  session = body.session.token;

  expect(reach1, 'the roster has no reach-1 champion to test with').toBeTruthy();
  expect(reach2.length).toBeGreaterThanOrEqual(6);
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

describe('a reach-1 champion in the back seat', () => {
  it('WARNS and SAVES', async () => {
    const res = await save(reach1.id, HEALTHY);

    // The save is the assertion. A 422 here would refuse a real tactic.
    expect(res.status).toBe(200);

    const body = (await res.json()) as Body;
    const warning = body.warnings.find((w) => w.code === 'reach-1-back-seat');
    expect(warning).toBeTruthy();
    expect(warning!.heroId).toBe(reach1.id);
    // Names the champion, so the player knows which row to look at.
    expect(warning!.message).toContain(reach1.name);
  });

  it('does not warn for a reach-2 champion in the same seat', async () => {
    const res = await save(reach2[0]!.id, HEALTHY);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Body;
    expect(body.warnings.some((w) => w.code === 'reach-1-back-seat')).toBe(false);
  });
});

describe('a ranking that switches powers off', () => {
  it('WARNS and SAVES, naming the dead tiers', async () => {
    const hero = reach2[0]!;
    const dead = firingProfile(hero, SELF_DEFEATING, SWEEP_TURNS).filter((e) => e.fires === 0);
    expect(dead.length, 'the fixture ranking kills nothing — pick another').toBeGreaterThan(0);

    const res = await save(hero.id, SELF_DEFEATING);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Body;
    // By heroId: the other five seats carry HEALTHY, and `find` would return
    // whichever seat came first rather than the one under test.
    const warning = body.warnings.find((w) => w.code === 'power-never-fires' && w.heroId === hero.id);
    expect(warning).toBeTruthy();
    expect(warning!.tiers).toEqual([...new Set(dead.map((e) => e.tier))].sort((a, b) => a - b));
    expect(warning!.message).toContain('never fire at all');
  });

  it('says nothing for the RECOMMENDED ranking, which is the whole point', async () => {
    /**
     * **This is the assertion that keeps the warning meaningful.**
     *
     * Measured at the 9-turn display horizon, `5·4·3·2·1·0` leaves a "dead"
     * power on 21 of 27 champions — and it is one of the twelve orderings
     * feature 004 measured as safe. A warning that fires on 21/27 champions
     * using the game's own recommendation is noise, and the first thing a
     * player learns is to ignore it.
     *
     * At 60 turns it leaves none: those powers are slow, not switched off.
     */
    const atBattle = HEROES.filter(
      (h) => firingProfile(h, HEALTHY, BATTLE_TURNS).some((e) => e.fires === 0),
    ).length;
    const atSweep = HEROES.filter(
      (h) => firingProfile(h, HEALTHY, SWEEP_TURNS).some((e) => e.fires === 0),
    ).length;

    expect(atBattle).toBeGreaterThan(20); // the noise a 9-turn warning would make
    expect(atSweep).toBe(0); // the signal a 60-turn warning makes

    const res = await save(reach2[0]!.id, HEALTHY);
    const body = (await res.json()) as Body;
    expect(body.warnings.some((w) => w.code === 'power-never-fires')).toBe(false);
  });
});

describe('warnings never block', () => {
  it('saves a squad carrying BOTH warnings at once', async () => {
    const res = await save(reach1.id, SELF_DEFEATING);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Body;
    expect(body.warnings.map((w) => w.code).sort()).toEqual(
      expect.arrayContaining(['power-never-fires', 'reach-1-back-seat']),
    );

    // And it really persisted, rather than being accepted and dropped.
    const roster = (await (
      await app.request('/v1/roster', { headers: { authorization: `Bearer ${session}` } })
    ).json()) as { assignments: { defense: { visible: { seats: { heroId: string }[] } } } };

    expect(roster.assignments.defense.visible.seats.some((s) => s.heroId === reach1.id)).toBe(true);
  });
});
