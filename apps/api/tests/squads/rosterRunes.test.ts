/**
 * `GET /v1/roster` carries each champion's rune stages (019 US2).
 *
 * ### Why the roster serves this at all
 *
 * Every player owns all 27 champions and they are identical across accounts —
 * so a roster screen has almost nothing to say about *this* player. Runes are
 * the exception, and the squad screen draws three pips per card off this field.
 * Without it the pips would be decoration.
 *
 * ### What this file is really guarding against
 *
 * **A placeholder that sits inside the legal range.** `scoutSerializer` shipped
 * `stages: 0` for every opponent from 006 until 2026-07-30, and `scout.test.ts`
 * passed the whole time because it asserted `0 <= stage <= 4` — which a constant
 * zero satisfies perfectly. A range check cannot tell a real value from a
 * plausible one.
 *
 * So the shape here is: read the field with nothing placed, place real runes
 * **through the same function the route uses**, and read it again. The
 * assertions are about the *difference*, which no constant can produce.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes, getHero } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { runes } from '../../src/db/schema/runes.js';
import { RUNE_SLOTS } from '../../src/db/schema/runes.js';
import { placeStage } from '../../src/progression/runes.js';
import { append } from '../../src/progression/ledger.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes();

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
    body: JSON.stringify({ idToken: `sub:sq-runes-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  accountId = body.account.id;
  session = body.session.token;
});

afterAll(async () => {
  restore?.();
  await db().delete(runes).where(eq(runes.accountId, accountId));
  await db().delete(accounts).where(eq(accounts.id, accountId));
  await closeDb();
});

interface WireRunes {
  readonly runes: readonly { readonly heroId: string; readonly stages: readonly number[] }[];
}

const rosterRunes = async (): Promise<WireRunes['runes']> => {
  const res = await app.request('/v1/roster', {
    headers: { authorization: `Bearer ${session}` },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as WireRunes).runes;
};

describe('the roster carries rune stages for every champion', () => {
  it('lists all 27 with three slots each, before anything is placed', async () => {
    const served = await rosterRunes();

    /* All 27, not "the ones with rows". An empty slot is a state — a client
       that had to treat an absent champion as zero would be re-deriving the
       thing this field exists to state. */
    expect(served).toHaveLength(ROSTER.length);
    expect(served.map((r) => r.heroId).sort()).toEqual(ROSTER.map((h) => h.id).sort());

    for (const entry of served) {
      expect(entry.stages, entry.heroId).toHaveLength(RUNE_SLOTS.length);
      expect(entry.stages, `${entry.heroId} has no runes yet`).toEqual([0, 0, 0]);
    }
  });

  /**
   * **The assertion a constant cannot pass.**
   *
   * Three distinct stages on three different champions, placed through
   * `placeStage` — the function `POST /heroes/:heroId/runes/:slot` calls — so
   * this is testing the database the game actually writes rather than one a
   * hand-built row invents.
   */
  it('reports what was actually placed, slot by slot', async () => {
    /* Enough for six stages at 150–200 each, with room to spare. */
    await append(accountId, 5000, 'grant');

    const [first, second, third] = ROSTER;
    const stat = 'might';

    /* Primary slot, one stage. */
    await placeStage(accountId, first!.id, 'primary', { [stat]: 20 });

    /* Secondary slot, two stages — so the pip has a height to draw, not just
       a lit/unlit state. */
    await placeStage(accountId, second!.id, 'secondary', { [stat]: 20 });
    await placeStage(accountId, second!.id, 'secondary', { [stat]: 10 });

    /* Common slot on a third champion, so slot *order* is under test: an
       implementation that sorted the slots differently would put this stage in
       the wrong pip. */
    await placeStage(accountId, third!.id, 'common', { [stat]: 20 });

    const served = await rosterRunes();
    const by = new Map(served.map((r) => [r.heroId, r.stages]));

    expect(by.get(first!.id), 'primary slot is index 0').toEqual([1, 0, 0]);
    expect(by.get(second!.id), 'secondary slot is index 1, at stage 2').toEqual([0, 2, 0]);
    expect(by.get(third!.id), 'common slot is index 2').toEqual([0, 0, 1]);

    /**
     * **And everybody else is still zero.** Without this, a route that reported
     * the same three stages for all 27 would pass every assertion above.
     */
    const touched = new Set([first!.id, second!.id, third!.id]);
    for (const entry of served) {
      if (touched.has(entry.heroId)) continue;
      expect(entry.stages, `${entry.heroId} was never touched`).toEqual([0, 0, 0]);
    }
  });

  /**
   * **Stage only.** The Forge owns allocations, utility effects and shard
   * spend; this field answers *is there a rune in this slot* and nothing more.
   * A roster that started carrying allocations would be a second copy of the
   * Forge's model, one route away from disagreeing with it.
   */
  it('carries no allocations, utility or spend', async () => {
    const res = await app.request('/v1/roster', {
      headers: { authorization: `Bearer ${session}` },
    });
    const body = (await res.json()) as { runes: readonly Record<string, unknown>[] };

    for (const entry of body.runes) {
      expect(Object.keys(entry).sort()).toEqual(['heroId', 'stages']);
    }

    /* And the hero list beside it is unchanged — the champions are content, and
       nothing here may start decorating them per-account. */
    const hero = getHero(ROSTER[0]!.id);
    expect(hero.strengths).toEqual([hero.primary, hero.secondary]);
  });
});
