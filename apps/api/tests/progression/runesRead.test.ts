/**
 * `GET /v1/me/runes` — **the read that feature 010 never shipped** (018 T005).
 *
 * ### TL;DR
 *
 * Players could spend shards on runes and then had no way to see what they had
 * bought. This is the route that shows them, and these are the checks that it
 * shows the right things — including the ones that are easy to get wrong in the
 * quiet direction, like reporting an empty slot as missing rather than as empty.
 *
 * ### Why a whole test file for a `GET`
 *
 * Because the interesting claims are all about **absence**, and absence is what
 * a happy-path test cannot see. A route that returned only the heroes with runes
 * on them would pass "the rune I placed comes back" perfectly, and the Forge
 * would then show a player 3 of their 27 champions with no error anywhere.
 *
 * Every assertion below is about a case with no data in it: the bare hero, the
 * empty slot, the utility that must stay `null`, the spend that must be `0`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ROSTER_SIZE, getHero } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { runes, RUNE_SLOTS, STAGE_COSTS } from '../../src/db/schema/runes.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { append } from '../../src/progression/ledger.js';
import { ownedRunes } from '../../src/progression/read.js';
/* `spentThroughStage` moved to `runes.ts` with the refund — `read.ts` imports
   from there already, so reaching the other way would have closed a cycle. */
import { placeStage, spentThroughStage } from '../../src/progression/runes.js';
import { signIn, type Signed } from '../profiles/session.js';
import { dropAccount } from './helpers.js';

const HERO = 'h01';
let signed: Signed;
let accountId: string;

beforeAll(async () => {
  signed = await signIn('runesRead');
  accountId = signed.accountId;
}, 60_000);

afterEach(async () => {
  await db().delete(runes).where(eq(runes.accountId, accountId));
  await db().delete(shardLedger).where(eq(shardLedger.accountId, accountId));
});

afterAll(async () => {
  await dropAccount(accountId);
  await closeDb();
});

const fund = (amount: number): Promise<void> => append(accountId, amount, 'grant');

describe('every hero comes back, including the bare ones', () => {
  it('returns all 27 with nothing placed at all', async () => {
    const heroes = await ownedRunes(accountId);

    expect(heroes).toHaveLength(ROSTER_SIZE);
    /**
     * **`stage: 0` means empty.** Not a missing hero, not a missing slot, not a
     * `null`. The Forge's *BARE* filter is a client-side view of this list, so a
     * route that omitted bare heroes would make that filter return nothing at
     * all and the *ALL 27* filter show three.
     */
    for (const hero of heroes) {
      expect(hero.slots).toHaveLength(RUNE_SLOTS.length);
      for (const slot of hero.slots) {
        expect(slot.stage, `${hero.heroId}.${slot.slot}`).toBe(0);
        expect(slot.allocations).toEqual({});
        expect(slot.utility).toBeNull();
        expect(slot.spent).toBe(0);
      }
    }
  });

  it('still returns all 27 once one of them has a rune', async () => {
    await fund(STAGE_COSTS[0]!);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const heroes = await ownedRunes(accountId);
    expect(heroes, 'the roster shrank to the heroes with runes on them').toHaveLength(ROSTER_SIZE);
  });
});

describe('what a placed rune reports', () => {
  it('carries the allocations — the single reason this route exists', async () => {
    await fund(STAGE_COSTS[0]!);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const hero = (await ownedRunes(accountId)).find((h) => h.heroId === HERO)!;
    const primary = hero.slots.find((s) => s.slot === 'primary')!;

    expect(primary.stage).toBe(1);
    expect(
      primary.allocations,
      'without allocations the Forge cannot show a player what they built',
    ).toEqual({ might: 20 });
  });

  it('derives the element from the hero, and leaves `common` open', async () => {
    const hero = (await ownedRunes(accountId)).find((h) => h.heroId === HERO)!;
    const authored = getHero(HERO);

    expect(hero.slots.find((s) => s.slot === 'primary')!.element).toBe(authored.primary);
    expect(hero.slots.find((s) => s.slot === 'secondary')!.element).toBe(authored.secondary);
    /* `common` accepts anything, so it names no element rather than naming a
       wrong one. */
    expect(hero.slots.find((s) => s.slot === 'common')!.element).toBeNull();
  });

  it('reports the spend from the stage table, not from the ledger', async () => {
    await fund(STAGE_COSTS[0]! + STAGE_COSTS[1]!);
    await placeStage(accountId, HERO, 'primary', { might: 20 });
    await placeStage(accountId, HERO, 'primary', { might: 10 });

    const hero = (await ownedRunes(accountId)).find((h) => h.heroId === HERO)!;
    const primary = hero.slots.find((s) => s.slot === 'primary')!;

    expect(primary.stage).toBe(2);
    /**
     * From `STAGE_COSTS`, which is the array the charge itself was computed
     * from — so the two cannot disagree. The ledger records *reasons*, not
     * slots, so attributing a debit to one of 81 slots would mean parsing a
     * string.
     */
    expect(primary.spent).toBe(STAGE_COSTS[0]! + STAGE_COSTS[1]!);
    expect(spentThroughStage(2)).toBe(primary.spent);
  });

  it('leaves the other two slots empty while one is filled', async () => {
    await fund(STAGE_COSTS[0]!);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const hero = (await ownedRunes(accountId)).find((h) => h.heroId === HERO)!;
    for (const slot of hero.slots.filter((s) => s.slot !== 'primary')) {
      expect(slot.stage, slot.slot).toBe(0);
      expect(slot.spent, slot.slot).toBe(0);
    }
  });
});

describe('the utility slot is gated on the stage, not only on the column', () => {
  it('is null below stage 4 even if the column somehow holds one', async () => {
    await fund(STAGE_COSTS[0]!);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    /**
     * Written directly, which is the point: this is the state a future bug in
     * the write path would leave behind. The serialiser must not pass it
     * through — a rule that only holds because nothing currently violates it is
     * not being enforced anywhere.
     */
    await db()
      .update(runes)
      .set({ utilityEffect: 'smuggled' })
      .where(eq(runes.accountId, accountId));

    const hero = (await ownedRunes(accountId)).find((h) => h.heroId === HERO)!;
    expect(
      hero.slots.find((s) => s.slot === 'primary')!.utility,
      'a utility effect below stage 4 reached the client',
    ).toBeNull();
  });
});

describe('the route itself', () => {
  it('refuses without a session', async () => {
    const res = await app.request('/v1/me/runes');
    expect(res.status).toBe(401);
  });

  it('answers 200 with the whole roster', async () => {
    const res = await app.request('/v1/me/runes', { headers: signed.headers() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { heroes: { heroId: string }[] };
    expect(body.heroes).toHaveLength(ROSTER_SIZE);
  });

  it('has no 404 — an unknown hero is not reachable, because none is named', async () => {
    /**
     * There is no `:heroId` in this route on purpose. A player always has 27
     * heroes, so the only thing a per-hero variant could add is a 404 that can
     * never legitimately fire.
     */
    const res = await app.request('/v1/me/runes', { headers: signed.headers() });
    const body = (await res.json()) as { heroes: { heroId: string }[] };

    expect(new Set(body.heroes.map((h) => h.heroId)).size).toBe(ROSTER_SIZE);
  });
});
