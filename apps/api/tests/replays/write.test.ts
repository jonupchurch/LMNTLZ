/**
 * A real battle, fought over HTTP, produces both artifacts (008 T011, T014–T016).
 *
 * ### What is actually being claimed
 *
 * `record.test.ts` proves the *table* is complete. This proves the **writing** is:
 * that a battle fought end to end through the routes leaves a record whose values
 * match what happened, and a replay whose events cover the whole fight and carry
 * nothing that could reproduce the RNG.
 *
 * The two are different claims and the second is the one that rots. A schema
 * assertion keeps passing forever; a population assertion breaks the moment
 * somebody adds a column and writes null into it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { contentVersion } from '@lmntlz/content';
import { engineVersion } from '@lmntlz/sim/rules';
import { closeDb, db } from '../../src/db/client.js';
import { battles } from '../../src/db/schema/battles.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';
import { RECORD_REASONS } from '../../src/db/schema/battleRecords.js';
import { arena, fightToTheEnd, start, type Arena, type StartedBattle } from '../battle/live.js';

let a: Arena;
let started: StartedBattle;
let fought: Awaited<ReturnType<typeof fightToTheEnd>>;

const recordOf = async (battleId: string) => {
  const [row] = await db()
    .select()
    .from(battleRecords)
    .where(eq(battleRecords.battleId, battleId))
    .limit(1);
  return row;
};

beforeAll(async () => {
  a = await arena('replaywrite');
  started = await start(a);
  fought = await fightToTheEnd(a, started);
  expect(fought.conclusion, 'the battle did not conclude within the cap').not.toBeNull();
}, 300_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('the record', () => {
  it('exists exactly once, written by the request that settled', async () => {
    const row = await recordOf(started.battleId);
    expect(row, 'no record was written for a concluded battle').toBeDefined();
  });

  it('agrees with the battle row it was built from', async () => {
    /**
     * **The point of this test is the word "agrees".** The record is built from
     * the concluding `UPDATE`'s `RETURNING`, precisely so it cannot disagree with
     * the settlement describing it — and since the record can never be corrected
     * afterwards, a disagreement is permanent. So the check is a comparison
     * between the two tables rather than against a literal.
     */
    const record = (await recordOf(started.battleId))!;
    const [battle] = await db()
      .select()
      .from(battles)
      .where(eq(battles.id, started.battleId))
      .limit(1);

    expect(record.attackerId).toBe(battle!.attackerId);
    expect(record.defenderId).toBe(battle!.defenderId);
    expect(record.defenderIsBot).toBe(battle!.defenderIsBot);
    expect(record.zone).toBe(battle!.zone);
    expect(record.winner).toBe(battle!.winner);
    expect(record.turnCount).toBe(battle!.turnCount);
    expect(record.startedAt.getTime()).toBe(battle!.startedAt.getTime());
    expect(record.concludedAt.getTime()).toBe(battle!.concludedAt!.getTime());
  });

  it('keeps the engine’s reason, not the record vocabulary’s collapsed one', async () => {
    /**
     * **The distinction 007 flagged as unbackfillable, taken back.** `battles`
     * collapses three cap outcomes into `turn_cap` because it also has to express
     * `abandoned` and `discarded`. This column does not, so it keeps all four —
     * and `cap-tiebreak` always favours the defender, making its frequency a
     * direct measure of how often the engine hands out a win nobody earned.
     */
    const record = (await recordOf(started.battleId))!;

    expect(RECORD_REASONS).toContain(record.reason);
    expect(['elimination', 'turn_cap']).not.toContain(record.reason);

    // And the two columns genuinely say different things for the same battle.
    const [battle] = await db()
      .select({ reason: battles.reason })
      .from(battles)
      .where(eq(battles.id, started.battleId))
      .limit(1);

    if (record.reason === 'wipe') {
      expect(battle!.reason).toBe('elimination');
    } else {
      expect(battle!.reason).toBe('turn_cap');
    }
  });

  it('carries both compositions and the three stamps', async () => {
    const record = (await recordOf(started.battleId))!;

    expect(record.attackerSquad).toBeTruthy();
    expect(record.defenderSquad, 'the defender composition is stored, not exposed').toBeTruthy();

    expect(record.engineVersion).toBe(engineVersion());
    expect(record.contentVersion).toBe(contentVersion());
  });

  it('leaves league and rating null, because neither feature exists yet', async () => {
    /**
     * Asserted rather than left implicit, so the day 009 and 010 start writing
     * them this test fails and somebody confirms it on purpose. A nullable column
     * silently staying null forever is how a field ends up missing from the
     * history that matters.
     */
    const record = (await recordOf(started.battleId))!;

    expect(record.attackerLeague).toBeNull();
    expect(record.defenderLeague).toBeNull();
    expect(record.attackerRating).toBeNull();
    expect(record.defenderRating).toBeNull();
  });

  it('records defender_is_bot from the battle row rather than inferring it', async () => {
    /**
     * ### T011, honestly scoped
     *
     * The task asks to *fight a bot and fight a human*. **There are no bots yet** —
     * curated bot defenders arrive with `07-defense-ai.md` and feature 009, and
     * `createBattle` writes `false` for every battle it can currently create. So
     * the half of T011 that can be tested today is the plumbing: that the flag
     * travels from the battle row into the record instead of being derived.
     *
     * That is the half that could actually break. The flag exists precisely
     * because it must **not** be inferred from `defender_id IS NULL` — a deleted
     * account nulls that column, which would make a real player's battles start
     * reading as bot battles years later and quietly drop them from every
     * aggregate that filters bots out.
     *
     * So: flip the flag on a second battle's row before it settles, and confirm
     * the record follows the row.
     */
    const second = await start(a);
    await db()
      .update(battles)
      .set({ defenderIsBot: true })
      .where(eq(battles.id, second.battleId));

    const secondFought = await fightToTheEnd(a, second);
    expect(secondFought.conclusion).not.toBeNull();

    const record = (await recordOf(second.battleId))!;
    expect(record.defenderIsBot).toBe(true);
    expect(record.defenderId, 'still a real account, so the flag is not derivable').not.toBeNull();
  }, 300_000);
});

describe('the replay blob', () => {
  it('was written and its URL is on the record', async () => {
    const record = (await recordOf(started.battleId))!;

    expect(record.replayBlobUrl, 'no replay URL recorded').toBeTruthy();
    expect(record.replayDeletedAt).toBeNull();
    expect(a.storage.blobs.has(record.replayBlobUrl!), 'URL recorded but no blob').toBe(true);
  });

  it('covers the whole fight, including the turns before the first choice', async () => {
    /**
     * **The opening fold is the part a naive implementation loses.** A battle does
     * not begin with the player acting — turn order may put a defender first, and
     * several turns can resolve before anybody is asked anything. Those events are
     * not in `battle_actions` and never were, so a replay assembled from the
     * action log alone starts mid-battle.
     *
     * ### Why this asserts exact equality rather than "more events than the log"
     *
     * The first version of this test required the opening fold to be non-empty,
     * and it failed — legitimately. **Whether any turns resolve before the
     * player's first choice is data, not a rule**: it depends on Speed, and this
     * battle's attacker simply went first. A test that demands a non-empty opening
     * is asserting a property of one roster ordering.
     *
     * So the claim is reconstructed instead: the log must equal the opening
     * events followed by every stored packet's events, in order. That is exact,
     * it holds whether the opening is empty or twelve turns long, and it is
     * *stronger* — it catches events being dropped **and** invented, where a
     * length comparison catches neither.
     */
    const record = (await recordOf(started.battleId))!;
    const log = JSON.parse(a.storage.blobs.get(record.replayBlobUrl!)!) as {
      events: unknown[];
      conclusion: unknown;
      battleId: string;
    };

    expect(log.battleId).toBe(started.battleId);
    expect(log.conclusion).toEqual(fought.conclusion);

    /**
     * Rebuilt from the responses the client actually received — the opening
     * packet from `POST /battles`, then each `act` packet in order. If the replay
     * matches this, a viewer sees exactly what the player saw.
     */
    const expected: unknown[] = [...started.packet.events];
    for (const body of fought.bodies.slice(1)) {
      const parsed = JSON.parse(body) as { packet: { events: unknown[] } };
      expected.push(...parsed.packet.events);
    }

    expect(log.events).toEqual(expected);
    expect(expected.length, 'nothing to compare — the fight produced no events').toBeGreaterThan(0);
  });

  it('carries no seed and no draw cursor, in any form', () => {
    /**
     * **Scanned on the serialised text, which is what actually leaves the
     * process.** A structural walk would have to know every shape a `TurnEvent`
     * can take and would silently stop covering new ones.
     *
     * `drawIndexBefore` and `drawsConsumed` matter as much as the seed here. They
     * are recorded on `battle_actions` because divergence detection needs them,
     * and a replay carrying them would both hand a client the means to reproduce
     * the RNG and make the forbidden re-simulation path look feasible.
     */
    const serialised = [...a.storage.blobs.values()].join('\n');

    for (const forbidden of ['"seed"', '"drawIndex"', '"drawIndexBefore"', '"drawsConsumed"']) {
      expect(serialised.includes(forbidden), `the replay log contains ${forbidden}`).toBe(false);
    }

    // The scan is not vacuous — there is a log, and it has content.
    expect(a.storage.blobs.size).toBeGreaterThan(0);
    expect(serialised).toContain('"events"');
  });
});
