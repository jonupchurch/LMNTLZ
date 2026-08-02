/**
 * 🔴 **Stage 4 finally stores the thing it charges 200 shards for (021).**
 *
 * `utility_effect` existed as a nullable column from feature 010 and was written
 * `null` on both paths — the forge path hardcoded it, and the rebuild path had no
 * parameter for it at all. Every completed rune in storage names no effect, which
 * is honest, because no player has ever received one.
 *
 * Every test here goes through the **real write path**. A hand-inserted row would
 * test a database nobody has: this repo has already been caught three times in one
 * fixture by exactly that, and the rejections were the schema working.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { RUNE_EFFECTS, effectsInPool, poolOf } from '@lmntlz/sim/rules';
import { closeDb, db } from '../../src/db/client.js';
import { runes, FULL_RUNE_COST, STAGE_COSTS } from '../../src/db/schema/runes.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { placeStage, rebuildRune, RuneError, slotAccepts } from '../../src/progression/runes.js';
import { ownedRunes } from '../../src/progression/read.js';
import { append, balance } from '../../src/progression/ledger.js';
import { dropAccount, makeAccount } from './helpers.js';

/** Bramwen. `might` 45, so the cap is reachable and the stat stages are constrained. */
const HERO = 'h01';
let accountId: string;

beforeAll(async () => {
  accountId = await makeAccount('rune-utility');
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

/** The three stat stages, spent on stats that cannot breach the 75 cap. */
async function toStageThree(slot: 'primary' | 'secondary' | 'common'): Promise<void> {
  await placeStage(accountId, HERO, slot, { might: 20 });
  await placeStage(accountId, HERO, slot, { might: 10 });
  await placeStage(accountId, HERO, slot, { luck: 5 });
}

const rowFor = async (slot: string) =>
  (await db().select().from(runes).where(eq(runes.accountId, accountId))).find(
    (r) => r.slot === slot,
  );

/** An effect the given slot legitimately offers, chosen from the engine's catalog. */
const anyIn = (slot: 'primary' | 'secondary' | 'common'): string => {
  const first = effectsInPool(poolOf(HERO, slot))[0];
  if (!first) throw new Error(`no implemented effect in the ${slot} pool for ${HERO}`);
  return first.id;
};

describe('buying stage 4', () => {
  it('🔴 stores the chosen effect — the column that was always null', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');

    const chosen = anyIn('common');
    const result = await placeStage(accountId, HERO, 'common', {}, chosen);

    expect(result.stage).toBe(4);
    expect((await rowFor('common'))?.utilityEffect).toBe(chosen);
  });

  it('charges 200 exactly once', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');
    const before = await balance(accountId);

    await placeStage(accountId, HERO, 'common', {}, anyIn('common'));

    expect(before - (await balance(accountId))).toBe(STAGE_COSTS[3]);
  });

  it('🔴 refuses to complete a rune with no effect chosen', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');

    await expect(placeStage(accountId, HERO, 'common', {})).rejects.toThrow(RuneError);
    expect((await rowFor('common'))?.stage, 'the rune stays at 3').toBe(3);
  });

  it('🔴 does not debit when it refuses', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');
    const before = await balance(accountId);

    await expect(placeStage(accountId, HERO, 'common', {})).rejects.toThrow(RuneError);

    expect(await balance(accountId), 'a refused effect never costs shards').toBe(before);
  });

  it('🔴 refuses an effect from another pool, and names both', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');

    /* An effect that exists but belongs somewhere else. */
    const foreign = Object.values(RUNE_EFFECTS).find((e) => e.pool !== 'common');
    expect(foreign, 'the catalog holds a non-common effect to test with').toBeDefined();

    await expect(
      placeStage(accountId, HERO, 'common', {}, foreign!.id),
    ).rejects.toThrow(new RegExp(`${foreign!.pool}.*common|common.*${foreign!.pool}`));
  });

  it('🔴 refuses an id that is not in the catalog at all', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');

    await expect(placeStage(accountId, HERO, 'common', {}, 'no-such-effect')).rejects.toThrow(
      /No such utility effect/,
    );
  });

  it('🔴 refuses an effect named on a stat stage', async () => {
    await fund(FULL_RUNE_COST);

    await expect(
      placeStage(accountId, HERO, 'common', { might: 20 }, anyIn('common')),
    ).rejects.toThrow(/not a utility effect/);
  });

  it('🔴 offers the derived pool, so a slot cannot take another slot’s effect', async () => {
    /* The derivation and the refusal must agree — they now read the same function. */
    expect(poolOf(HERO, 'primary')).toBe(slotAccepts(HERO, 'primary'));
    expect(poolOf(HERO, 'common')).toBe('common');
    expect(slotAccepts(HERO, 'common')).toBeNull();
  });
});

describe('rebuilding', () => {
  it('🔴 carries an effect rather than landing on stage 4 with none', async () => {
    await fund(FULL_RUNE_COST * 2);
    await toStageThree('common');
    await placeStage(accountId, HERO, 'common', {}, anyIn('common'));

    const chosen = anyIn('common');
    const result = await rebuildRune(accountId, HERO, 'common', { might: 20, luck: 15 }, true, chosen);

    expect(result.stage).toBe(4);
    expect(
      (await rowFor('common'))?.utilityEffect,
      'this is the path that hardcoded null',
    ).toBe(chosen);
  });

  it('🔴 refuses a rebuild with no effect', async () => {
    await fund(FULL_RUNE_COST * 2);
    await toStageThree('common');
    await placeStage(accountId, HERO, 'common', {}, anyIn('common'));

    await expect(
      rebuildRune(accountId, HERO, 'common', { might: 20, luck: 15 }, true),
    ).rejects.toThrow(RuneError);
  });
});

describe('reading it back', () => {
  it('reports the effect once the rune is complete', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');
    const chosen = anyIn('common');
    await placeStage(accountId, HERO, 'common', {}, chosen);

    const owned = await ownedRunes(accountId);
    const slot = owned.find((h) => h.heroId === HERO)?.slots.find((s) => s.slot === 'common');

    expect(slot?.stage).toBe(4);
    expect(slot?.utility).toBe(chosen);
  });

  it('🔴 reports none below stage 4 — the gate is on the stage, not the column', async () => {
    await fund(FULL_RUNE_COST);
    await toStageThree('common');

    const owned = await ownedRunes(accountId);
    const slot = owned.find((h) => h.heroId === HERO)?.slots.find((s) => s.slot === 'common');

    expect(slot?.stage).toBe(3);
    expect(slot?.utility).toBeNull();
  });
});
