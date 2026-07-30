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

/** An account with a complete Visible defense — the minimum to be a candidate. */
async function defender(label: string, options: { seats?: number; rating?: number } = {}) {
  const [account] = await db()
    .insert(accounts)
    .values({ username: `${label}${SUFFIX}`.slice(0, 16), usernameKey: `${label}-${SUFFIX}` })
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

  it('is byte-identical across calls, so nothing is being consumed', async () => {
    const first = await candidates(attacker);
    const second = await candidates(attacker);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
