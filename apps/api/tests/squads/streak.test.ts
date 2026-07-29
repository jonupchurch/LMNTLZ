/**
 * The hold streak, end to end (T023, T028).
 *
 * `canonical.test.ts` drives the pure function with pairs. **This one proves the
 * endpoint actually uses it**, which is the half that a correct `canonicalForm`
 * does not guarantee — a route that reset unconditionally would pass every test
 * in that file.
 *
 * The streak is public and it is worth something, so both failure directions
 * cost the player something and neither gets reported:
 *
 * - **Reset too eagerly** and opening the editor to read a squad costs 40 days.
 *   The player does not file a bug, they stop looking.
 * - **Reset too rarely** and a squad advertises a streak it did not earn.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { squads } from '../../src/db/schema/squads.js';
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

const auth = () => ({ 'content-type': 'application/json', authorization: `Bearer ${session}` });

interface SeatSpec {
  row: 'front' | 'middle' | 'back';
  index: number;
  heroId: string;
  config: { targeting: [string, string]; ranking: number[]; allyRule: string | null };
}

const cfg = (over: Partial<SeatSpec['config']> = {}): SeatSpec['config'] => ({
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
  ...over,
});

const baseSeats = (): SeatSpec[] => [
  { row: 'front', index: 0, heroId: ROSTER[0]!, config: cfg() },
  { row: 'front', index: 1, heroId: ROSTER[1]!, config: cfg() },
  { row: 'middle', index: 0, heroId: ROSTER[2]!, config: cfg() },
  { row: 'middle', index: 1, heroId: ROSTER[3]!, config: cfg() },
  { row: 'middle', index: 2, heroId: ROSTER[4]!, config: cfg() },
  { row: 'back', index: 0, heroId: ROSTER[5]!, config: cfg() },
];

const save = (seats: SeatSpec[]) =>
  app.request('/v1/squads/defense/visible', {
    method: 'PUT',
    headers: auth(),
    body: JSON.stringify({ seats }),
  });

/** The streak is earned by holding, which no test can do. Set it directly. */
async function setStreak(value: number): Promise<void> {
  await db()
    .update(squads)
    .set({ holdStreak: value })
    .where(and(eq(squads.accountId, accountId), eq(squads.zone, 'visible')));
}

async function streakNow(): Promise<number> {
  const [row] = await db()
    .select({ holdStreak: squads.holdStreak })
    .from(squads)
    .where(and(eq(squads.accountId, accountId), eq(squads.zone, 'visible')))
    .limit(1);
  return row!.holdStreak;
}

beforeAll(async () => {
  restore = overrideProvider('google', provider);
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:streak-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  accountId = body.account.id;
  session = body.session.token;

  expect((await save(baseSeats())).status).toBe(200);
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

describe('what keeps a streak', () => {
  it('an identical save is a no-op and costs nothing', async () => {
    await setStreak(40);

    const res = await save(baseSeats());
    expect(res.status).toBe(200);

    const body = (await res.json()) as { holdStreak: number; streakReset: boolean };
    expect(body.streakReset).toBe(false);
    expect(body.holdStreak).toBe(40);
    expect(await streakNow()).toBe(40);
  });

  it('a reorder back to the starting arrangement costs nothing', async () => {
    // The editor may submit seats in any order. Canonicalisation is what makes
    // "I opened it, moved someone, moved them back, saved" free.
    await setStreak(40);

    const shuffled = [...baseSeats()].reverse();
    const body = (await (await save(shuffled)).json()) as { streakReset: boolean; holdStreak: number };

    expect(body.streakReset).toBe(false);
    expect(body.holdStreak).toBe(40);
  });
});

describe('what resets a streak', () => {
  it('resets when a champion is swapped in', async () => {
    await setStreak(40);
    const seats = baseSeats();
    seats[2]!.heroId = ROSTER[20]!;

    const body = (await (await save(seats)).json()) as { streakReset: boolean; holdStreak: number };
    expect(body.streakReset).toBe(true);
    expect(body.holdStreak).toBe(0);

    await save(baseSeats()); // restore for the tests below
  });

  it('resets when the targeting FALLBACK changes, not only the primary', async () => {
    // **The line that catches a lazy implementation.** The fallback is the rule
    // that actually fires 49-80% of the time — a hash that includes only the
    // primary passes every other row of this table and misses the change that
    // alters the defense most.
    await setStreak(40);

    const seats = baseSeats();
    seats[0]!.config = cfg({ targeting: ['lowest-current-hp', 'furthest'] });

    const body = (await (await save(seats)).json()) as { streakReset: boolean; holdStreak: number };
    expect(body.streakReset).toBe(true);
    expect(body.holdStreak).toBe(0);

    await save(baseSeats());
  });

  it('resets when two champions swap rows, though the set is identical', async () => {
    // Row placement decides reach. A hash over the hero SET rather than the
    // seat map calls this a no-op, and it changes what the squad can hit.
    await setStreak(40);

    const seats = baseSeats();
    const front = seats[0]!.heroId;
    seats[0]!.heroId = seats[5]!.heroId;
    seats[5]!.heroId = front;

    const body = (await (await save(seats)).json()) as { streakReset: boolean };
    expect(body.streakReset).toBe(true);

    await save(baseSeats());
  });
});

describe('runes and gear are outside the hash (T028)', () => {
  it('takes no rune or gear input at all', () => {
    /**
     * **Structural, because the absence is the guarantee.**
     *
     * The streak measures how long a *plan* has held, and gear is not the plan.
     * Including it makes "improve a defending champion" and "keep a streak"
     * mutually exclusive — and the correct play under that rule is to never
     * upgrade a defender, which is a perverse incentive nobody designed.
     *
     * Runes are permanent and destroyed on replacement, so this is not a small
     * cost either way.
     */
    const source = readFileSync(join(import.meta.dirname, '../../src/squads/canonical.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    for (const word of ['rune', 'gear', 'stage', 'power ', 'level']) {
      expect(source.toLowerCase(), `canonicalForm reads "${word}"`).not.toContain(word);
    }
  });

  it('keeps the streak across a save that changes nothing in the plan', async () => {
    // The behavioural half: feature 010 will place runes without touching seats
    // or config, and that save must be free.
    await setStreak(40);
    const body = (await (await save(baseSeats())).json()) as { streakReset: boolean; holdStreak: number };
    expect(body.streakReset).toBe(false);
    expect(body.holdStreak).toBe(40);
  });
});
