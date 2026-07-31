/**
 * **The scout view still hides allocations, now that something else reveals
 * them** (018 T008 · Constitution XVII).
 *
 * ### TL;DR
 *
 * You can see how much somebody has invested in a champion. You cannot see
 * *what they invested in*. This file exists because feature 018 added the first
 * route in the game that does show that — to the owner — and the two must never
 * become one function.
 *
 * ### Why this is a separate file from `scout.test.ts`
 *
 * `scout.test.ts` asserts the disclosure boundary as it stood when the scout
 * view was the **only** place runes appeared. `GET /v1/me/runes` changed the
 * situation, not the rule: there are now two serialisers over the same rows,
 * with opposite audiences.
 *
 * The tempting refactor is one function with an `includeAllocations` flag.
 * `progression/read.ts` explains at length why it does not exist, and this is
 * the check that would catch it being introduced later. **A boolean that
 * defaults wrong exactly once publishes every player's build**, and it fails
 * silently — the response still validates, the screen still renders, and the
 * symptom is opponents pre-empting your counters for a month before anyone
 * works out why.
 *
 * ### It asserts over the whole serialised response, not field by field
 *
 * The same method `scout.test.ts` uses, and for the same reason: a
 * `toBeUndefined()` per remembered field only tests the leaks somebody already
 * thought of. Here the defender's allocations are made **deliberately
 * distinctive** — an unusual stat split at an unusual magnitude — so any path
 * that carried them into the response, including one nobody has written yet,
 * shows up as a substring.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { runes } from '../../src/db/schema/runes.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';
import { append } from '../../src/progression/ledger.js';
import { placeStage } from '../../src/progression/runes.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes().map((h) => h.id);
const VISIBLE_IDS = ROSTER.slice(0, 6);
const created: string[] = [];
let restore: (() => void) | undefined;

let targetId = '';
let ownerSession = '';
let scoutSession = '';

/**
 * The stat the defender actually put points into, and the magnitude.
 *
 * `resolve` is chosen on purpose: it appears in no other part of the scout
 * response, so the string is unambiguous evidence if it turns up. `20` is the
 * stage-1 boost, so this is a legitimate allocation rather than a synthetic one
 * the write path would refuse.
 */
const SECRET_STAT = 'resolve';

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

async function signIn(sub: string) {
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:${sub}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  return body;
}

const seats = (ids: readonly string[]) => [
  { row: 'front', index: 0, heroId: ids[0] },
  { row: 'front', index: 1, heroId: ids[1] },
  { row: 'middle', index: 0, heroId: ids[2] },
  { row: 'middle', index: 1, heroId: ids[3] },
  { row: 'middle', index: 2, heroId: ids[4] },
  { row: 'back', index: 0, heroId: ids[5] },
];

beforeAll(async () => {
  restore = overrideProvider('google', provider);

  const target = await signIn(`boundary-target-${RUN}`);
  targetId = target.account.id;
  ownerSession = target.session.token;

  await app.request(`/v1/squads/defense/visible`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ownerSession}`,
    },
    body: JSON.stringify({ seats: seats(VISIBLE_IDS) }),
  });

  /* A real rune on a champion the scout will definitely see. */
  await append(targetId, 1000, 'grant');
  await placeStage(targetId, VISIBLE_IDS[0]!, 'primary', { [SECRET_STAT]: 20 });

  const scout = await signIn(`boundary-scout-${RUN}`);
  scoutSession = scout.session.token;
}, 60_000);

afterAll(async () => {
  restore?.();
  await db().delete(runes).where(eq(runes.accountId, targetId));
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

describe('the owner can see their own allocations', () => {
  it('is the whole reason GET /v1/me/runes exists', async () => {
    const res = await app.request('/v1/me/runes', {
      headers: { authorization: `Bearer ${ownerSession}` },
    });

    const body = (await res.json()) as {
      heroes: { heroId: string; slots: { slot: string; allocations: Record<string, number> }[] }[];
    };
    const hero = body.heroes.find((h) => h.heroId === VISIBLE_IDS[0])!;
    const primary = hero.slots.find((s) => s.slot === 'primary')!;

    /**
     * **This assertion is the control.** Without it the absence checks below
     * could pass because nothing was ever placed, and the file would be a
     * guaranteed green that proves nothing at all.
     */
    expect(primary.allocations[SECRET_STAT]).toBe(20);
  });
});

describe('a scout still cannot', () => {
  const scout = () =>
    app.request(`/v1/players/${targetId}/scout`, {
      headers: { authorization: `Bearer ${scoutSession}` },
    });

  it('sees the stage count, because commitment is public', async () => {
    const body = (await (await scout()).json()) as {
      visible: { seats: { hero: { id: string }; runes: { element: string; stages: number }[] }[] };
    };

    const seat = body.visible.seats.find((s) => s.hero.id === VISIBLE_IDS[0])!;
    const primary = seat.runes[0]!;

    /**
     * Commitment, never power. At an identical spend the best allocation scores
     * about 3.35× the worst, so a pip says a player *committed* — not that they
     * committed well. That gap is what makes this disclosure safe and bluffing a
     * real strategy.
     */
    expect(primary.stages).toBe(1);
  });

  it('gets element and stages and nothing else on any rune', async () => {
    const body = (await (await scout()).json()) as {
      visible: { seats: { runes: Record<string, unknown>[] }[] };
    };

    for (const seat of body.visible.seats) {
      for (const rune of seat.runes) {
        expect(Object.keys(rune).sort()).toEqual(['element', 'stages']);
      }
    }
  });

  it('never sees the stat, anywhere in the response text', async () => {
    const text = await (await scout()).text();

    /**
     * Whole-body, not field-by-field. The leak that actually happens is a field
     * somebody adds later in a place nobody was watching — a debug key, a
     * `_raw`, an object that came along with a join — and only a substring
     * search catches the ones that do not exist yet.
     */
    expect(text, `the defender's build leaked: "${SECRET_STAT}" is in the scout response`).not.toContain(
      SECRET_STAT,
    );
    expect(text).not.toContain('allocations');
    expect(text).not.toContain('utility');
  });

  it('cannot read the owner route for somebody else — there is no such route', async () => {
    /**
     * `GET /v1/me/runes` takes no player id, which is the strongest form of this
     * guarantee: there is no parameter to tamper with. A scout calling it gets
     * **their own** runes, all bare.
     */
    const res = await app.request('/v1/me/runes', {
      headers: { authorization: `Bearer ${scoutSession}` },
    });

    const body = (await res.json()) as {
      heroes: { slots: { stage: number; allocations: Record<string, number> }[] }[];
    };

    const anyPlaced = body.heroes.some((h) => h.slots.some((s) => s.stage > 0));
    expect(anyPlaced, 'the scout received somebody else’s runes from their own route').toBe(false);
  });
});
