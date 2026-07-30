/**
 * What a squad saved without touching a control actually plays (FR-023, T049) —
 * and what the roster tells the editor about it.
 *
 * ### Why this file exists now rather than with 006
 *
 * 006 built the whole squad screen and left one thing unwired: nothing called
 * `PUT /v1/squads/defense/:zone`. Wiring it exposed a circular problem the route
 * had always had — **a defense seat was required to carry a config, and the client
 * has no legal way to produce one.** The role-default table lives behind
 * `@lmntlz/sim/ai`, which a purity test makes unreachable from the client on
 * purpose: shipping it would hand every player the exact ranking the engine plays
 * against them.
 *
 * So the shape settled here is:
 *
 * | Direction | Rule |
 * |---|---|
 * | in | `config` is **optional**; absent means *the Role default*, resolved here |
 * | out | a **seated** champion's config is served, resolved; an unseated one's is not |
 *
 * The second row is the disclosure boundary. Serving all 27 would publish the
 * table one champion at a time.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { ROLE_DEFAULTS, TARGET_RULES, needsAllyRule } from '@lmntlz/sim/ai';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];
let restore: (() => void) | undefined;
let session = '';
let accountId = '';

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
    body: JSON.stringify({ idToken: `sub:sq-def-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  accountId = body.account.id;
  created.push(accountId);
  session = body.session.token;
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

interface WireConfig {
  readonly targeting: readonly [string, string];
  readonly ranking: readonly number[];
  readonly allyRule: string | null;
}

interface WireSeat {
  readonly row: string;
  readonly index: number;
  readonly heroId: string;
  readonly config?: WireConfig;
}

interface Roster {
  readonly assignments: { readonly defense: Record<string, { readonly seats: WireSeat[] }> };
  readonly rules: {
    readonly target: string[];
    readonly ally: string[];
    readonly needsAllyRule: string[];
  };
}

/** Seats with no config at all — what the client sends for a fresh squad. */
const bare = (ids: readonly string[]) => [
  { row: 'front', index: 0, heroId: ids[0] },
  { row: 'front', index: 1, heroId: ids[1] },
  { row: 'middle', index: 0, heroId: ids[2] },
  { row: 'middle', index: 1, heroId: ids[3] },
  { row: 'middle', index: 2, heroId: ids[4] },
  { row: 'back', index: 0, heroId: ids[5] },
];

const put = (zone: string, seats: unknown) =>
  app.request(`/v1/squads/defense/${zone}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
    body: JSON.stringify({ seats }),
  });

const rosterOf = async (): Promise<Roster> => {
  const res = await app.request('/v1/roster', {
    headers: { authorization: `Bearer ${session}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Roster;
};

const SIX = ROSTER.slice(0, 6);

describe('a squad saved with no configuration at all', () => {
  it('is accepted, and stores each champion’s Role default', async () => {
    expect((await put('visible', bare(SIX))).status).toBe(200);

    const roster = await rosterOf();
    const seats = roster.assignments.defense['visible']!.seats;
    expect(seats).toHaveLength(6);

    for (const seat of seats) {
      const hero = getHero(seat.heroId);
      const expected = ROLE_DEFAULTS[hero.role];

      expect(seat.config, `${seat.heroId} came back with no config`).toBeDefined();
      /**
       * **Compared against the engine's own table, not against a literal.** A
       * literal here would keep passing after the hero-numbers pass re-picks every
       * default — `defaults.ts` carries a standing instruction to re-run that sweep
       * — and would then be asserting a ranking nothing plays.
       */
      expect(seat.config!.targeting, seat.heroId).toEqual([...expected.targeting]);
      expect(seat.config!.ranking, seat.heroId).toEqual([...expected.ranking]);
    }
  });

  it('carries an ally rule only for champions that own a friendly power', async () => {
    /**
     * FR-004. A stored rule on a champion who cannot heal is a decision nothing
     * will ever read, sitting there looking meaningful.
     */
    const seats = (await rosterOf()).assignments.defense['visible']!.seats;

    for (const seat of seats) {
      const heals = needsAllyRule(getHero(seat.heroId));
      if (heals) {
        expect(seat.config!.allyRule, `${seat.heroId} heals but has no ally rule`).not.toBeNull();
      } else {
        expect(seat.config!.allyRule, `${seat.heroId} cannot heal but carries an ally rule`).toBeNull();
      }
    }
  });

  it('does not reset the hold streak when saved again with what the roster served', async () => {
    /**
     * ### The bug this is here to catch, which is subtle and permanent-feeling
     *
     * The repository's fallback for a missing config is empty strings and an empty
     * ranking. If the route stored *that* and the editor then saved the resolved
     * defaults it had been served, the two canonical forms would differ — and the
     * player would lose a hold streak by pressing Save twice without changing
     * anything. `canonical.ts` opens with the rule that a no-op save must cost
     * nothing; this is the case where the code, not the player, does the changing.
     */
    const served = (await rosterOf()).assignments.defense['visible']!.seats;
    const again = served.map((s) => ({
      row: s.row,
      index: s.index,
      heroId: s.heroId,
      config: s.config,
    }));

    const res = await put('visible', again);
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { streakReset: boolean }).streakReset,
      'saving the served configuration back counted as an edit',
    ).toBe(false);
  });

  it('keeps an explicit choice rather than reasserting the default', async () => {
    const served = (await rosterOf()).assignments.defense['visible']!.seats;
    const target = served[0]!;

    const changed = served.map((s) =>
      s.heroId === target.heroId
        ? {
            row: s.row,
            index: s.index,
            heroId: s.heroId,
            config: { ...s.config!, targeting: ['highest-might', 'furthest'] },
          }
        : { row: s.row, index: s.index, heroId: s.heroId, config: s.config },
    );

    const res = await put('visible', changed);
    expect(res.status).toBe(200);
    // A real change, so the streak resets — which is the other half of the rule.
    expect(((await res.json()) as { streakReset: boolean }).streakReset).toBe(true);

    const after = (await rosterOf()).assignments.defense['visible']!.seats;
    const stored = after.find((s) => s.heroId === target.heroId)!;
    expect(stored.config!.targeting).toEqual(['highest-might', 'furthest']);
  });
});

describe('what the roster does and does not disclose about configuration', () => {
  it('serves a config for seated champions only', async () => {
    /**
     * **The disclosure boundary.** Resolving the other twenty-one would publish the
     * role-default table one champion at a time, which is exactly what keeping
     * `@lmntlz/sim/ai` off the client exists to prevent. Nothing outside the two
     * defense zones may carry one.
     */
    const roster = await rosterOf();
    const seated = ['visible', 'hidden'].flatMap(
      (zone) => roster.assignments.defense[zone]?.seats ?? [],
    );

    expect(seated.length, 'nothing is seated, so this would prove nothing').toBeGreaterThan(0);
    expect(seated.length).toBeLessThan(27);

    /**
     * **Counted across the whole payload, not walked structurally.** A structural
     * walk asserts about the shapes it knows to visit; the leak worth catching is a
     * config appearing somewhere it was not expected — on `heroes`, or on
     * `available` — which a walk would step straight past.
     *
     * `"ranking"` is the marker because it is the field the role-default table
     * exists to hold, and it appears exactly once per served config.
     */
    const rankings = JSON.stringify(roster).match(/"ranking"/g)?.length ?? 0;
    expect(
      rankings,
      `${rankings} configurations in the payload for ${seated.length} seated champions`,
    ).toBe(seated.length);
  });

  it('serves the rule menus, so the client compiles none of its own', async () => {
    const roster = await rosterOf();

    expect(roster.rules.target).toEqual([...TARGET_RULES]);
    // The same list, deliberately: the ally menu discriminates better than the
    // enemy one, not differently.
    expect(roster.rules.ally).toEqual([...TARGET_RULES]);
  });

  it('names exactly the champions who face the ally decision', async () => {
    const roster = await rosterOf();
    const expected = getAllHeroes()
      .filter((h) => needsAllyRule(h))
      .map((h) => h.id);

    expect([...roster.rules.needsAllyRule].sort()).toEqual([...expected].sort());
    // Not everybody, and not nobody — either would make the third control wrong
    // for most of the roster.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(27);
  });
});

describe('saving a defense squad is activity', () => {
  it('stamps last_activity_at, so the account stays in the defender pool', async () => {
    /**
     * `matchmaking/candidates.ts` requires activity inside thirty days to be
     * offered as a defender, and `touchActivity()` shipped with **no caller** — so
     * every account would have quietly aged out of every pool a month after signing
     * up, with no error anywhere. A defense-squad edit is one of the two places
     * activity is defined to happen.
     */
    await db().delete(playerRatings).where(eq(playerRatings.accountId, accountId));

    expect((await put('visible', bare(SIX))).status).toBe(200);

    const [row] = await db()
      .select({ at: playerRatings.lastActivityAt })
      .from(playerRatings)
      .where(eq(playerRatings.accountId, accountId));

    expect(row?.at, 'a defense save left no activity stamp').toBeTruthy();
    expect(Date.now() - row!.at.getTime()).toBeLessThan(120_000);
  });
});
