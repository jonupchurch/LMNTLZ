/**
 * Rune slots, stages and the 75 cap (010 T010, T013–T016).
 *
 * Bramwen (`h01`) is the fixture because her stat line makes the cap concrete:
 * `might` is 45, so stage 1 (+20) takes her to 65, stage 2 (+10) lands her on
 * **exactly 75** — one of the 57 exact fills the design calls the most satisfying
 * thing a rune does — and stage 3 (+5) must then be refused on that stat and
 * allowed on another.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getHero, STAT_CAP } from '@lmntlz/content';
import { closeDb, db } from '../../src/db/client.js';
import { runes, FULL_RUNE_COST, STAGE_BOOSTS, STAGE_COSTS } from '../../src/db/schema/runes.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import {
  capViolation,
  costOfStage,
  placeStage,
  placedStatPoints,
  pointsThroughStage,
  slotAccepts,
} from '../../src/progression/runes.js';
import { append, balance } from '../../src/progression/ledger.js';
import { dropAccount, makeAccount } from './helpers.js';

const HERO = 'h01';
let accountId: string;

beforeAll(async () => {
  accountId = await makeAccount('runes');
});

afterEach(async () => {
  await db().delete(runes).where(eq(runes.accountId, accountId));
  await db().delete(shardLedger).where(eq(shardLedger.accountId, accountId));
});

afterAll(async () => {
  await dropAccount(accountId);
  await closeDb();
});

const fund = (amount: number): Promise<void> => append(accountId, amount, 'grant');

describe('the published stage table', () => {
  it('costs 150 / 150 / 150 / 200 for 650', () => {
    expect([...STAGE_COSTS]).toEqual([150, 150, 150, 200]);
    expect(FULL_RUNE_COST).toBe(650);
  });

  it('grants +20 / +10 / +5 and then no points at all', () => {
    expect([...STAGE_BOOSTS]).toEqual([20, 10, 5, 0]);
  });

  it('accumulates to 35 points by stage 3 and adds nothing at stage 4', () => {
    expect(pointsThroughStage(1)).toBe(20);
    expect(pointsThroughStage(2)).toBe(30);
    expect(pointsThroughStage(3)).toBe(35);
    expect(pointsThroughStage(4), 'stage 4 buys utility, not points').toBe(35);
  });

  it('charges 200 for the utility stage — the most expensive and the least points', () => {
    // This is what makes the gate justify itself economically rather than by a
    // rule: a bad buy early, a good buy once the 75 cap has absorbed the boosts.
    expect(costOfStage(4)).toBe(200);
    expect(costOfStage(4)).toBeGreaterThan(costOfStage(3));
    expect(STAGE_BOOSTS[3]).toBe(0);
  });
});

describe('three slots, two of them typed to the hero', () => {
  it('types the primary and secondary slots and leaves common open', () => {
    const hero = getHero(HERO);
    expect(slotAccepts(HERO, 'primary')).toBe(hero.primary);
    expect(slotAccepts(HERO, 'secondary')).toBe(hero.secondary);
    expect(slotAccepts(HERO, 'common'), 'common takes anything').toBeNull();
  });

  it('derives the type from the hero rather than storing it on the rune', async () => {
    // The two authored fields are the single source (Constitution XV). A copy on
    // the rune row would go stale the moment a hero is re-authored.
    await fund(150);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const [row] = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(Object.keys(row!)).not.toContain('damageType');
  });
});

describe('the 75 cap is the only constraint on allocation', () => {
  it('allows all three boosts to stack on one stat', async () => {
    // 35 points on one stat is the whole point — and Constitution XVIII says
    // harm is a gate and taste is a note. A bad allocation is the player's.
    await fund(450);
    await placeStage(accountId, HERO, 'common', { toughness: 20 });
    await placeStage(accountId, HERO, 'common', { toughness: 10 });
    await placeStage(accountId, HERO, 'common', { toughness: 5 });

    const [row] = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(row!.allocations).toEqual({ toughness: 35 });
    expect(row!.stage).toBe(3);
  });

  it('lands an exact fill on 75 without complaint', async () => {
    // Bramwen's might is 45. +20 then +10 is exactly 75.
    await fund(300);
    await placeStage(accountId, HERO, 'primary', { might: 20 });
    await placeStage(accountId, HERO, 'primary', { might: 10 });

    const hero = getHero(HERO);
    expect(hero.stats.might + 30).toBe(STAT_CAP);
  });

  it('refuses a boost that would exceed the cap, and names the stat', async () => {
    await fund(450);
    await placeStage(accountId, HERO, 'primary', { might: 20 });
    await placeStage(accountId, HERO, 'primary', { might: 10 });

    await expect(placeStage(accountId, HERO, 'primary', { might: 5 })).rejects.toThrow(
      /might would reach 80/i,
    );
  });

  it('allows the same stage on a different stat', async () => {
    await fund(450);
    await placeStage(accountId, HERO, 'primary', { might: 20 });
    await placeStage(accountId, HERO, 'primary', { might: 10 });
    await placeStage(accountId, HERO, 'primary', { luck: 5 });

    const [row] = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(row!.allocations).toEqual({ might: 30, luck: 5 });
  });

  it('reports a violation without touching the database', () => {
    expect(capViolation(HERO, { might: 20 })).toBeNull();
    expect(capViolation(HERO, { might: 31 })).toEqual({ stat: 'might', would: 76 });
  });
});

describe('planning is free and committing is charged', () => {
  it('charges exactly the stage cost, once, as a negative ledger row', async () => {
    await fund(150);
    await placeStage(accountId, HERO, 'primary', { might: 20 });

    const rows = await db()
      .select()
      .from(shardLedger)
      .where(eq(shardLedger.accountId, accountId));

    const spend = rows.filter((r) => r.reason === 'rune-stage');
    expect(spend).toHaveLength(1);
    expect(spend[0]!.delta).toBe(-150);
    expect(await balance(accountId)).toBe(0);
  });

  it('refuses when the balance will not cover the stage', async () => {
    await fund(149);
    await expect(placeStage(accountId, HERO, 'primary', { might: 20 })).rejects.toMatchObject({
      code: 'insufficient-shards',
    });
  });

  it('writes nothing when it refuses', async () => {
    await fund(149);
    await expect(placeStage(accountId, HERO, 'primary', { might: 20 })).rejects.toThrow();

    const rows = await db().select().from(runes).where(eq(runes.accountId, accountId));
    expect(rows, 'a refused placement left a rune behind').toHaveLength(0);
    expect(await balance(accountId), 'a refused placement charged the player').toBe(149);
  });

  it('refuses an allocation that does not spend exactly what the stage grants', async () => {
    await fund(150);
    // Under-spending silently forfeits points the player paid 150 shards for.
    await expect(placeStage(accountId, HERO, 'primary', { might: 5 })).rejects.toMatchObject({
      code: 'slot-mismatch',
    });
    await expect(placeStage(accountId, HERO, 'primary', { might: 25 })).rejects.toMatchObject({
      code: 'slot-mismatch',
    });
  });

  it('refuses a fifth stage and points at the rebuild', async () => {
    await fund(FULL_RUNE_COST);
    await placeStage(accountId, HERO, 'common', { luck: 20 });
    await placeStage(accountId, HERO, 'common', { luck: 10 });
    await placeStage(accountId, HERO, 'common', { luck: 5 });
    await placeStage(accountId, HERO, 'common', {});

    await fund(1_000);
    await expect(placeStage(accountId, HERO, 'common', {})).rejects.toThrow(/rebuild/i);
  });
});

describe('placed, never spent', () => {
  it('counts points from runes currently placed', async () => {
    await fund(300);
    await placeStage(accountId, HERO, 'primary', { might: 20 });
    await placeStage(accountId, HERO, 'secondary', { luck: 20 });

    expect(await placedStatPoints(accountId)).toBe(40);
  });

  it('does not count the utility stage as points', async () => {
    await fund(FULL_RUNE_COST);
    await placeStage(accountId, HERO, 'common', { luck: 20 });
    await placeStage(accountId, HERO, 'common', { luck: 10 });
    await placeStage(accountId, HERO, 'common', { luck: 5 });
    await placeStage(accountId, HERO, 'common', {});

    // 650 shards spent; 35 points placed. Stage 4 bought utility.
    expect(await placedStatPoints(accountId)).toBe(35);
  });
});
