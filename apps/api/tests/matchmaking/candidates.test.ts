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
import { candidates } from '../../src/matchmaking/candidates.js';

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
    const list = await candidates(attacker);
    const ids = list.candidates.map((c) => c.playerId);

    expect(ids).toContain(strong);
    expect(ids).toContain(weak);
    expect(ids, 'a player must never be offered themselves').not.toContain(attacker);
  });

  it('excludes an account whose Visible squad cannot defend', async () => {
    // Three of six seats. Reported, never repaired — 006 refuses to substitute a
    // hero into the gap, so such a squad simply is not a candidate.
    const ids = (await candidates(attacker)).candidates.map((c) => c.playerId);
    const incomplete = created.find((id) => ![attacker, strong, weak].includes(id));

    expect(ids).not.toContain(incomplete);
  });

  it('orders by rating, descending', async () => {
    const list = await candidates(attacker);
    const ratings = list.candidates.map((c) => c.rating);

    expect([...ratings]).toEqual([...ratings].sort((a, b) => b - a));

    const positions = list.candidates.map((c) => c.playerId);
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
    expect(list.widened).toBe(false);
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
      const ids = (await candidates(attacker)).candidates.map((c) => c.playerId);
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
    const first = await candidates(attacker);
    const second = await candidates(attacker);

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
    const find = (list: typeof first, id: string) => list.candidates.find((c) => c.playerId === id);

    for (const [label, id] of [
      ['strong', strong],
      ['weak', weak],
    ] as const) {
      const before = find(first, id);
      expect(before, `${label} was not offered on the first call`).toBeDefined();
      expect(find(second, id), `${label} vanished between calls`).toEqual(before);
    }

    // The requester's own fields are per-player, so those *are* byte-stable.
    const { candidates: _first, ...mineFirst } = first;
    const { candidates: _second, ...mineSecond } = second;
    expect(mineSecond).toEqual(mineFirst);
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
    const list = await candidates(attacker);
    const them = list.candidates.find((c) => c.playerId === strong);
    expect(them, 'the strong defender is not in the pool').toBeDefined();

    // Six, because the query inner-joins on a *complete* Visible squad.
    expect(them!.visibleHeroIds).toHaveLength(6);

    /*
     * **Seat order, and this is the assertion that catches the enum trap.**
     * `row` is a text column, so `ORDER BY row` sorts `back, front, middle` —
     * alphabetically, not by formation. The fixture seats the roster in order
     * across front/front/middle/middle/middle/back, so correct output is the
     * first six roster ids and the alphabetical bug puts the back-line champion
     * first.
     */
    expect(them!.visibleHeroIds).toEqual(ROSTER.slice(0, 6));
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
    const list = await candidates(attacker);
    const up = list.candidates.find((c) => c.playerId === strong)!;
    const down = list.candidates.find((c) => c.playerId === weak)!;
    expect(up, 'the strong defender is missing').toBeDefined();
    expect(down, 'the weak defender is missing').toBeDefined();

    expect(up.winDelta).toBeGreaterThan(down.winDelta);
    // And the reverse: losing to somebody weaker costs more than losing to
    // somebody stronger.
    expect(down.lossDelta).toBeLessThan(up.lossDelta);
  });
});
