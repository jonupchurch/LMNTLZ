/**
 * The pool is every eligible defender, ordered and never filtered (009 T012, T013 · SC-004).
 *
 * `gearBound.test.ts` proves the *guarantee* across all 8,626 scores in closed
 * form. This file proves the *query* — that the SQL restricts to the band, that
 * rating only sorts, and that nothing about having fought somebody removes them.
 *
 * ### T012 is a test of the signature, and that is deliberate
 *
 * `contracts/matchmaking-api.md`: *"There is no parameter that would let rating
 * exclude anybody — the signature is the enforcement."* A behavioural test can only
 * show that today's caller passes no filter; reading the signature shows that no
 * caller **could**. The two are different promises and the structural one is the
 * durable half.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inArray } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { squads, squadSeats } from '../../src/db/schema/squads.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { candidates, eligiblePool } from '../../src/matchmaking/candidates.js';

const SUFFIX = `test-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];

/**
 * An account with a complete Visible defense — the minimum to be a candidate.
 *
 * **Backdated past the starter week, and that is load-bearing rather than cosmetic.**
 * Every account here is about the *ordinary* pool, and a brand-new account is a starter
 * player: bot-only opponents and a dormant defense. Left at `now`, these fixtures
 * changed meaning the moment `starter.test.ts` authored a bot in a parallel worker —
 * two of the tests below failed intermittently on nothing but file scheduling.
 *
 * Fixing it here rather than by serialising the project: a test file that depends on
 * another file's global state is the actual defect, and ordering only hides it.
 */
const GRADUATED_DAYS = 8;

/**
 * **Eligibility is asked of the pool; the offer is a separate question.**
 *
 * `candidates()` draws `OFFER_LIMIT` (5) spread across the rating order, so asking it
 * *"is this fixture present?"* is really asking where that fixture sorts among every
 * defender in Bronze — a fact about the rest of the database rather than about the rule
 * under test. Presence and absence go to `eligiblePool()`; ordering, field shape and the
 * cap itself stay on `candidates()`, which is what the route serves.
 */
const poolIds = async (viewer: string): Promise<string[]> =>
  (await eligiblePool(viewer)).pool.map((r) => r.playerId);

/**
 * Draw until a named defender is one of the five offered, and return their card.
 *
 * **Only for assertions about the DECORATION** — `visibleHeroIds`, the rating swing —
 * which exist only on what was actually offered. `OFFER_LIMIT` draws five at random
 * (Jon, 2026-08-01), so a given eligible defender appears about `5/poolSize` of the
 * time and a single call is a coin toss rather than a test.
 *
 * Eligibility is asserted first, so a genuinely-missing defender fails with *that*
 * message instead of exhausting the attempts and blaming the draw. Forty attempts
 * against a pool of ~22 leaves a false failure at roughly one in thirty thousand.
 */
const drawUntilOffered = async (viewer: string, playerId: string, attempts = 40) => {
  expect(await poolIds(viewer), 'the defender is not even eligible').toContain(playerId);

  for (let i = 0; i < attempts; i += 1) {
    const found = (await candidates(viewer)).candidates.find((c) => c.playerId === playerId);
    if (found) return found;
  }

  throw new Error(`${playerId} was eligible but never drawn in ${attempts} offers`);
};

async function defender(label: string, options: { seats?: number; rating?: number } = {}) {
  const [account] = await db()
    .insert(accounts)
    .values({
      username: `${label}${SUFFIX}`.slice(0, 16),
      usernameKey: `${label}-${SUFFIX}`,
      createdAt: new Date(Date.now() - GRADUATED_DAYS * 86_400_000),
    })
    .returning();
  const id = account!.id;
  created.push(id);

  const [squad] = await db()
    .insert(squads)
    .values({ accountId: id, kind: 'defense', zone: 'visible' })
    .returning();

  const seats = options.seats ?? 6;
  const positions = [
    { row: 'front' as const, index: 0 },
    { row: 'front' as const, index: 1 },
    { row: 'middle' as const, index: 0 },
    { row: 'middle' as const, index: 1 },
    { row: 'middle' as const, index: 2 },
    { row: 'back' as const, index: 0 },
  ].slice(0, seats);

  if (positions.length) {
    await db()
      .insert(squadSeats)
      .values(positions.map((p, i) => ({ squadId: squad!.id, ...p, heroId: ROSTER[i]! })));
  }

  if (options.rating !== undefined) {
    await db().insert(playerRatings).values({ accountId: id, rating: options.rating });
  }

  return id;
}

let attacker: string;
let strong: string;
let weak: string;

beforeAll(async () => {
  attacker = await defender('mmA');
  strong = await defender('mmS', { rating: 1400 });
  weak = await defender('mmW', { rating: 900 });
  await defender('mmI', { seats: 3 }); // incomplete Visible squad
}, 120_000);

afterAll(async () => {
  if (created.length) await db().delete(accounts).where(inArray(accounts.id, created));
  await closeDb();
});

describe('the signature cannot exclude anybody (T012)', () => {
  it('takes exactly one argument', () => {
    // JS arity. A second parameter is the first step to a filter, and this fails the
    // moment one is added — before any behaviour changes.
    expect(candidates.length).toBe(1);
  });

  it('names no filtering parameter anywhere in the module', async () => {
    /**
     * Comment-stripped first, then searched, then proved not to have eaten the file
     * — the same discipline `gearScore.test.ts` needed, and for the same reason: the
     * source *names* `excludeIds`, `minRating` and `maxAttempts` in the comment
     * explaining that none exists, so the naive scan passes on its own explanation.
     */
    const code = (
      await readFile(new URL('../../src/matchmaking/candidates.ts', import.meta.url), 'utf8')
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code, 'the strip ate the file').toContain('export async function candidates');
    expect(code.length).toBeGreaterThan(800);

    for (const forbidden of ['excludeIds', 'minRating', 'maxRating', 'maxAttempts', 'cursor']) {
      expect(code, `${forbidden} exists — the pool can be filtered`).not.toContain(forbidden);
    }
  });

  it('mentions rating only where it sorts, never where it filters', async () => {
    /**
     * The claim that actually matters, and it is checkable: `orderBy` is the one
     * clause rating may appear in. `where(...)` is built from `and(...)` above it, so
     * a rating comparison inside it would show up as `rating` next to `gte`/`lt`/`eq`
     * on the same line.
     */
    const code = (
      await readFile(new URL('../../src/matchmaking/candidates.ts', import.meta.url), 'utf8')
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    const filteringOnRating = code
      .split('\n')
      .filter((line) => /playerRatings\.rating/.test(line))
      .filter((line) => /\b(gte|lte|lt|gt|ne|eq)\(/.test(line));

    expect(filteringOnRating, 'rating is being used to filter').toEqual([]);
  });
});

describe('the pool', () => {
  it('offers same-league defenders and never the requester', async () => {
    const ids = await poolIds(attacker);

    expect(ids).toContain(strong);
    expect(ids).toContain(weak);
    expect(ids, 'a player must never be offered themselves').not.toContain(attacker);

    /* And the exclusion holds through the cap too — the requester must not be able to
       reappear as one of the five, which is a different code path from the query. */
    const offered = (await candidates(attacker)).candidates.map((c) => c.playerId);
    expect(offered, 'a player was offered themselves').not.toContain(attacker);
  });

  it('excludes an account whose Visible squad cannot defend', async () => {
    // Three of six seats. Reported, never repaired — 006 refuses to substitute a
    // hero into the gap, so such a squad simply is not a candidate.
    const ids = await poolIds(attacker);
    const incomplete = created.find((id) => ![attacker, strong, weak].includes(id));

    expect(ids).not.toContain(incomplete);
  });

  it('orders by rating, descending', async () => {
    const list = await candidates(attacker);
    const ratings = list.candidates.map((c) => c.rating);

    expect([...ratings]).toEqual([...ratings].sort((a, b) => b - a));

    /**
     * **Relative order is read from the pool, because the cap samples it.**
     * `takeSpread` preserves order but not membership, so `indexOf` on the offered five
     * can return `-1` for either fixture — and `-1 < n` is *true*, so this assertion
     * would have gone on passing while measuring nothing.
     */
    const positions = await poolIds(attacker);
    expect(positions).toContain(strong);
    expect(positions).toContain(weak);
    expect(positions.indexOf(strong)).toBeLessThan(positions.indexOf(weak));
  });

  it('puts everybody in Bronze today, and says so honestly', async () => {
    /**
     * The 010 seam, asserted rather than assumed. Every gear score is null and
     * coalesces to the 1,500 starter grant, so the whole population shares one band.
     * **This test is expected to change when 010 lands** — and if it silently keeps
     * passing then, gear score never started being computed.
     */
    const list = await candidates(attacker);

    expect(list.league).toBe('bronze');
    expect(list.gearScore).toBe(1500);
    expect(list.positionInLeague).toBe(0);
  });

  it('reports ambush chance and the streak on every response', async () => {
    const list = await candidates(attacker);

    // Always displayed, never conditional — the player is owed the reason.
    expect(list.ambushChance).toBe(0);
    expect(list.consecutiveWins).toBe(0);

    /**
     * **Shape, not value — and the value it used to assert was reading a real hole.**
     *
     * This test is about the ambush fields. `widened === false` rode along and went red
     * once the bot ramp was seeded, because it was measuring something this fixture does
     * not control: **no authored bot carries `band: 'bronze'`.** The twenty starter bots
     * are `band: 'starter'` and the nursery clause keeps them out of every ordinary pool,
     * and `leagueBots.ts` starts at Silver — so an ordinary Bronze player is offered
     * whichever real accounts happen to be there, falls under `MIN_POOL`, and widens.
     *
     * That is a content gap, not a test defect, and pinning `false` here would have hidden
     * it behind a fixture. The *value* is owned by `widening.test.ts`, which controls its
     * own band; what belongs in this test is that the field is always present, because an
     * optional field is a field clients forget to read.
     */
    expect(typeof list.widened, 'widened must always be present, never optional').toBe('boolean');
    expect(list.poolSize, 'the pool size must be reported alongside it').toBeGreaterThan(0);
  });
});

describe('no slate, no rotation, no cooldown (T013)', () => {
  it('returns the same defender on twenty consecutive calls', async () => {
    /**
     * **Scoped honestly: this proves statelessness, not post-battle behaviour.**
     *
     * The requirement is that attacking somebody twenty times leaves them in the
     * pool all twenty times. Twenty *calls* prove `candidates()` keeps no per-pair
     * state of its own — no slate it draws down, no rotation cursor, no memory
     * between requests. That is the mechanism a cooldown would have to live in, and
     * it does not exist.
     *
     * What it does **not** prove is that twenty real settled battles leave the pool
     * unchanged, which needs 007's battle machinery and belongs with the route test.
     * Recorded rather than implied, because a green test that reads like the stronger
     * claim is worse than an absent one.
     */
    for (let i = 0; i < 20; i++) {
      const ids = await poolIds(attacker);
      expect(ids, `call ${i + 1}`).toContain(strong);
      expect(ids, `call ${i + 1}`).toContain(weak);
    }
  }, 60_000);

  it('keeps every candidate it already offered, so nothing is being consumed', async () => {
    /**
     * **This asserted byte equality and that was stronger than the claim.** Two calls
     * returning identical JSON also requires that *no other account was created in
     * between* — and the pool is every eligible defender in a shared database, so a
     * parallel suite inserting a fixture made this fail with a diff of one extra
     * candidate. Nothing had been consumed; somebody else had signed up.
     *
     * The actual promise is that attacking somebody does not remove them, so it is
     * *survival* that has to be checked: everything in the first response is still in
     * the second, with every field unchanged. A new arrival is not consumption, and a
     * test that treats it as one is a test that fails for being right.
     */
    /**
     * ⚠️ **Asked of the pool, because the offer is now a random draw** (2026-08-01).
     *
     * Two calls no longer return the same five — that is the point of the draw — so
     * "still present on the second call" is only a claim about *eligibility*. Comparing
     * the offered lists would fail roughly four times in five while nothing whatsoever
     * had been consumed, which is a test failing for being right.
     */
    const first = await eligiblePool(attacker);
    const second = await eligiblePool(attacker);

    /**
     * **Scoped to this file's own defenders, and it took two tries to get there.** The
     * first rewrite checked that *every* candidate survived, which failed when another
     * suite's `afterAll` deleted its fixture mid-test: a candidate really did vanish,
     * and nothing had been consumed. The pool is every eligible defender in one shared
     * database, so rows appear and disappear for reasons this file cannot see.
     *
     * `strong` and `weak` are ours, they live until this file's own cleanup, and they are
     * the only two the claim is about.
     */
    const find = (list: typeof first, id: string) => list.pool.find((r) => r.playerId === id);

    for (const [label, id] of [
      ['strong', strong],
      ['weak', weak],
    ] as const) {
      const before = find(first, id);
      expect(before, `${label} was not eligible on the first call`).toBeDefined();
      expect(find(second, id), `${label} vanished between calls`).toEqual(before);
    }

    // The requester's own fields are per-player, so those *are* byte-stable.
    expect(second.own).toEqual(first.own);
    expect(second.league).toBe(first.league);
    expect(second.widened).toBe(first.widened);
  });
});

/**
 * What a candidate card needs to be a decision rather than a name (019).
 *
 * `LMNTLZ Matchmaking and Results.dc.html` draws every offering with a
 * twelve-bar type spread and a `WIN +18 / LOSE −12` swing. Both were named in
 * `CandidateRail.tsx` as *"one server field each"* and deliberately left out.
 */
describe('an offering carries enough to choose with', () => {
  it('serves each defender’s Visible six, in seat order', async () => {
    const them = await drawUntilOffered(attacker, strong);

    // Six, because the query inner-joins on a *complete* Visible squad.
    expect(them.visibleHeroIds).toHaveLength(6);

    /*
     * **Seat order, and this is the assertion that catches the enum trap.**
     * `row` is a text column, so `ORDER BY row` sorts `back, front, middle` —
     * alphabetically, not by formation. The fixture seats the roster in order
     * across front/front/middle/middle/middle/back, so correct output is the
     * first six roster ids and the alphabetical bug puts the back-line champion
     * first.
     */
    expect(them.visibleHeroIds).toEqual(ROSTER.slice(0, 6));
  });

  it('never serves anybody’s Hidden squad', async () => {
    const list = await candidates(attacker);
    for (const c of list.candidates) {
      // The absence of the field *is* the disclosure rule (XVII). A count, a
      // key or an empty array would each tell a scout something.
      expect(Object.keys(c)).not.toContain('hiddenHeroIds');
      expect(JSON.stringify(c)).not.toContain('hidden_hero');
    }
  });

  it('quotes a swing that is a gain on a win and a cost on a loss', async () => {
    const list = await candidates(attacker);
    for (const c of list.candidates) {
      expect(c.winDelta, `${c.username} gains nothing for winning`).toBeGreaterThan(0);
      expect(c.lossDelta, `${c.username} loses nothing for losing`).toBeLessThan(0);
    }
  });

  /**
   * **The assertion a hardcoded pair cannot satisfy.** Beating somebody rated
   * far above you must be worth more than beating somebody far below — that is
   * what the ladder is for — so a constant, or a copied field, fails here while
   * passing every shape check above.
   */
  it('is worth more to beat a stronger defender than a weaker one', async () => {
    /**
     * **Taken from the offered five by rating rather than by fixture id.** The swing is
     * a decoration, so it only exists on what was actually offered — but *which*
     * defenders those are is a fact about the whole league, and naming two fixtures made
     * this test depend on them surviving `OFFER_LIMIT`. The claim is about the rating
     * gap, so the extremes of whatever came back prove it just as well and cannot flake.
     */
    const list = await candidates(attacker);
    const byRating = [...list.candidates].sort((a, b) => b.rating - a.rating);
    const up = byRating[0]!;
    const down = byRating.at(-1)!;
    expect(byRating.length, 'a single candidate cannot show a gap').toBeGreaterThan(1);
    expect(up.rating, 'every offered defender shares one rating').toBeGreaterThan(down.rating);

    expect(up.winDelta).toBeGreaterThan(down.winDelta);
    // And the reverse: losing to somebody weaker costs more than losing to
    // somebody stronger.
    expect(down.lossDelta).toBeLessThan(up.lossDelta);
  });
});
