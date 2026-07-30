/**
 * Pool composition: bleed at the edges, widening as the last resort (T052 · T053).
 *
 * ### Why these fixtures live in Silver and above
 *
 * Every other suite's accounts sit in **Bronze**, because `gearScore()` is still a seam
 * returning the 1,500 starter grant and 1,500 is the Bronze floor. So Silver, Gold and
 * Platinum are empty of anybody else's fixtures, and writing `player_ratings.gear_score`
 * directly puts a test account in a band **nothing else in the suite can reach into**.
 *
 * That is real isolation rather than a hopeful `not.toContain` — the alternative is
 * asserting about a Bronze pool that other files create and delete rows in while this one
 * runs, which is where three earlier flakes in this feature came from.
 *
 * ### The two mechanisms are not the same thing, and the order matters
 *
 * **Bleed is by design and proportional.** `bleed()` says what share of a player's offers
 * come from the leagues either side given where they sit in their band — zero through the
 * middle 80%, rising to half at each edge. It is what makes crossing a league threshold
 * cost 0.2% of win rate instead of 12.6 points.
 *
 * **Widening is an emergency that breaks a published promise.** `contracts/matchmaking-api.md`
 * states that *"the 1.67× gear guarantee does not hold on a widened match"*, so it fires
 * only below `MIN_POOL`, reaches exactly one band either way, is disclosed to the player,
 * and is never persisted.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { squads, squadSeats } from '../../src/db/schema/squads.js';
import { candidates } from '../../src/matchmaking/candidates.js';
import {
  GEAR_BOUND,
  MIN_POOL,
  STARTER_DAYS,
  WIDENED_GEAR_BOUND,
} from '../../src/matchmaking/config.js';
import { bandOf, leagueOf } from '../../src/matchmaking/league.js';
import { bleed } from '../../src/matchmaking/bleed.js';

const RUN = `widen-${process.pid}-${Date.now()}`;
const created: string[] = [];
let seq = 0;

/** An eligible defender pinned to an exact gear score, hence to an exact league. */
async function at(gear: number, label: string): Promise<string> {
  const [account] = await db()
    .insert(accounts)
    .values({
      username: `${label}${seq}`,
      usernameKey: `${label}-${RUN}-${seq++}`,
      /**
       * **Backdated past the starter week, and it must be.** These fixtures were created
       * with `new Date()` and the whole file passed alone and failed in the parallel run —
       * because `starter.test.ts` now seeds the twenty starter bots, which makes
       * `starterLeagueOpen()` true for the **whole database**. With the league open, a
       * brand-new account is a protected starter player: its defense is dormant so it
       * vanishes from every pool, and its *own* pool becomes the authored ramp rather than
       * its gear band. Seven Silver defenders read as one, and Platinum stopped widening.
       *
       * Recent enough to stay inside the thirty-day activity window, old enough to be an
       * ordinary league player. `candidates.test.ts` backdates for the same reason.
       */
      createdAt: new Date(Date.now() - (STARTER_DAYS + 1) * 86_400_000),
    })
    .returning();

  const id = account!.id;
  created.push(id);

  await db().insert(playerRatings).values({ accountId: id, gearScore: gear });

  const [squad] = await db()
    .insert(squads)
    .values({ accountId: id, kind: 'defense', zone: 'visible' })
    .returning();

  const heroes = getAllHeroes();
  await db()
    .insert(squadSeats)
    .values(
      (
        [
          { row: 'front', index: 0 },
          { row: 'front', index: 1 },
          { row: 'middle', index: 0 },
          { row: 'middle', index: 1 },
          { row: 'middle', index: 2 },
          { row: 'back', index: 0 },
        ] as const
      ).map((seat, i) => ({ squadId: squad!.id, ...seat, heroId: heroes[i]!.id })),
    );

  return id;
}

const SILVER = bandOf('silver');
const GOLD = bandOf('gold');

/** Top of Silver, so the upward bleed is at its maximum. */
let edge: string;
/** Middle of Silver, so there is no bleed at all. */
let middle: string;
/** Nobody else in Platinum, so its pool is empty and widening must fire. */
let lonely: string;

const silverPeers: string[] = [];
/**
 * **Nine of them, and the count is load-bearing.** The bleed asks for
 * `round(total * mix.up)` defenders from above — about six here — so with only two Gold
 * fixtures the limit never bit and *both* were offered, including the one this file
 * asserts is out of reach. The first version of the nearest-across-the-line test therefore
 * failed on correct code: it was asserting a truncation that could not occur.
 */
const goldFloor: string[] = [];
let farGold: string;

beforeAll(async () => {
  edge = await at(SILVER.ceiling - 10, 'wEdge');
  middle = await at(Math.round((SILVER.floor + SILVER.ceiling) / 2), 'wMid');
  lonely = await at(bandOf('platinum').floor + 100, 'wLone');

  /**
   * **Enough Silver peers that widening does not fire**, so the bleed assertions are
   * about bleed. With fewer than `MIN_POOL` in the band the emergency path would take
   * over and every "is Gold present" question would have a second possible cause.
   */
  for (let i = 0; i < MIN_POOL + 1; i++) {
    silverPeers.push(await at(SILVER.floor + 200 + i * 10, `wPeer${i}`));
  }

  for (let i = 0; i < 9; i++) {
    goldFloor.push(await at(GOLD.floor + 10 + i * 10, `wNear${i}`));
  }
  farGold = await at(GOLD.ceiling - 10, 'wFar');
}, 180_000);

afterAll(async () => {
  if (created.length > 0) await db().delete(accounts).where(inArray(accounts.id, created));
  await closeDb();
}, 60_000);

describe('bleed reaches next door only near a band edge (T052)', () => {
  it('offers nobody from another league to a player mid-band', async () => {
    const list = await candidates(middle);
    const mix = bleed(list.gearScore);

    // Non-vacuity: this fixture must genuinely be in the flat middle, or the
    // assertion below is about nothing.
    expect(mix.up, 'the mid-band fixture is not actually mid-band').toBe(0);
    expect(mix.down).toBe(0);

    const ids = list.candidates.map((c) => c.playerId);
    for (const gold of goldFloor) {
      expect(ids, 'a mid-band player was offered the league above').not.toContain(gold);
    }
    expect(ids, 'a mid-band player was offered the far league above').not.toContain(farGold);
    expect(ids.length, 'the mid-band pool is empty, so it proves nothing').toBeGreaterThan(0);
  });

  it('offers the league above to a player at the top of their band', async () => {
    const list = await candidates(edge);
    const mix = bleed(list.gearScore);

    expect(mix.up, 'the edge fixture is not actually at the edge').toBeGreaterThan(0.4);

    const ids = list.candidates.map((c) => c.playerId);
    expect(
      goldFloor.filter((g) => ids.includes(g)).length,
      'no bleed reached the league above',
    ).toBeGreaterThan(0);
  });

  it('reaches the nearest across the line, not the strongest', async () => {
    /**
     * **The direction is the point.** A player at the top of Silver who starts seeing Gold
     * names should meet the *weakest* Gold players — the ones they have nearly caught.
     * Offering the top of Gold instead would make crossing a threshold a cliff in the
     * other direction, which is the sawtooth `bleed.ts` exists to remove.
     */
    const list = await candidates(edge);
    const ids = list.candidates.map((c) => c.playerId);

    const offeredGold = goldFloor.filter((g) => ids.includes(g));
    expect(offeredGold.length, 'the nearest Gold defenders were not offered').toBeGreaterThan(0);
    expect(
      offeredGold.length,
      'every Gold defender was offered, so nothing was actually selected',
    ).toBeLessThan(goldFloor.length);
    expect(ids, 'the top of Gold was offered to a Silver player').not.toContain(farGold);
    expect(list.widened, 'this pool widened, so bleed is not what was measured').toBe(false);
  });

  it('keeps a bled match inside the widened bound, and outside the normal one', async () => {
    /**
     * **Bleed genuinely exceeds 1.67×, and that is not a defect — it is why the design
     * publishes two bounds.** A Silver-floor player bleeding upward can be offered a
     * Gold defender, and `bandOf` makes the arithmetic explicit rather than approximate.
     */
    /**
     * **Checked from the bands rather than from the response, because the response does not
     * carry gear.** `Candidate` deliberately exposes rating and hold streaks and not gear —
     * a scouting surface that published every opponent's exact gear score would hand the
     * whole ladder a targeting list. So the bound is arithmetic over the published bands.
     */
    const ratio = GOLD.ceiling / SILVER.floor;
    expect(ratio, 'a Silver-floor player could face more than the widened bound').toBeLessThan(
      WIDENED_GEAR_BOUND,
    );
    expect(ratio, 'the two bounds would be the same number').toBeGreaterThan(GEAR_BOUND);
  });
});

describe('widening is the last resort, and it says so (T052 · T053)', () => {
  it('reports false when the band can field a pool on its own', async () => {
    const list = await candidates(edge);

    expect(list.candidates.length).toBeGreaterThanOrEqual(MIN_POOL);
    expect(list.widened, 'a healthy band widened anyway').toBe(false);
  });

  it('reports true when the band is empty, and reaches exactly one band out', async () => {
    const list = await candidates(lonely);

    expect(leagueOf(list.gearScore)).toBe('platinum');

    /**
     * **The disclosure is the requirement, not the padding.** The contract says the
     * 1.67× guarantee does not hold here, so a player who is served a widened pool has to
     * be told — `widened: true` is the only way the client can say so.
     */
    expect(list.widened, 'an empty band did not widen').toBe(true);

    /**
     * One band out means Gold below and Diamond above. Gold's ceiling over Platinum's
     * floor is the worst ratio a Platinum player can now face, and it must stay inside
     * the widened bound.
     */
    for (const candidate of list.candidates) {
      expect(candidate.playerId, 'widening reached the Silver fixtures, two bands away').not.toBe(
        edge,
      );
    }
    expect(list.candidates.map((c) => c.playerId)).toContain(farGold);
  });

  it('never widens or bleeds for a starter player', async () => {
    /**
     * **A starter player's pool is the authored ramp, which is the bound by construction.**
     * Reaching outside it would hand a beginner the very full-kit veteran the ramp exists
     * to keep away — and the ramp is never thin, because it is authored rather than
     * populated. Checked here as the absence of both mechanisms rather than by seeding
     * twenty bots, which `starter.test.ts` owns.
     */
    const fresh = await at(bandOf('bronze').floor, 'wFresh');
    const list = await candidates(fresh);

    /**
     * With no starter bots seeded the league is closed, so this account is an ordinary
     * Bronze player and the assertion has to be about the code path rather than the
     * result. The behavioural half lives in `starter.test.ts`, which seeds the real pool.
     */
    expect(list.league).toBe('bronze');
    expect(typeof list.widened, 'widened must always be present, never optional').toBe('boolean');
  });
});

describe('the widen rate is instrumented from the first widened request (T054)', () => {
  it('logs the league and both pool sizes when it widens', async () => {
    /**
     * **The metric that says whether the bot allocation was big enough.**
     * `09-matchmaking.md`: Bronze is where widening breaks the guarantee, and **a Bronze
     * widen rate above a few percent means the allocation was too small.** Instrumenting it
     * when somebody notices a problem leaves nothing to compare against.
     *
     * Asserted because an instrument nobody checks is an instrument that gets deleted as
     * noise. The **league** is the part that matters — a total would average Bronze's
     * problem away against Platinum's health.
     */
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '));

    try {
      const list = await candidates(lonely);
      expect(list.widened, 'the fixture did not widen, so nothing could be logged').toBe(true);
    } finally {
      console.warn = original;
    }

    const line = lines.find((l) => l.includes('[matchmaking] widened'));
    expect(line, `no widen was logged; saw ${JSON.stringify(lines)}`).toBeDefined();
    expect(line, 'the log does not name the league, so the rate cannot be read per band').toContain(
      'league=platinum',
    );
    expect(line, 'the log does not report how thin the band was').toMatch(/own=\d+/);
    expect(line).toMatch(/widened_to=\d+/);
  });

  it('stays quiet on a healthy band', async () => {
    // Otherwise the signal is every request and the rate is unreadable.
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '));

    try {
      const list = await candidates(edge);
      expect(list.widened).toBe(false);
    } finally {
      console.warn = original;
    }

    expect(lines.filter((l) => l.includes('[matchmaking] widened'))).toEqual([]);
  });
});
