/**
 * A defender editing mid-battle cannot reach a fight in progress (007 T016,
 * FR-001, SC-009).
 *
 * ### Why this is not only a fairness rule
 *
 * The obvious reading is anti-cheat: a defender who could swap in a counter
 * after seeing the attack would win every fight. That is real, but the deeper
 * reason is **determinism**. PvP here is asynchronous, so the defender is
 * usually asleep — and a battle that consulted the live squad would resolve
 * differently depending on when each request happened to arrive. The same log
 * would replay into a different battle tomorrow, and Constitution XVI's promise
 * that a stored replay is what happened would be worth nothing.
 *
 * ### The edit here is a real one, through the real endpoint
 *
 * Six different champions and a different targeting configuration, saved through
 * `PUT /v1/squads/defense/:zone` exactly as the defender's own client would. An
 * edit written directly into the table would test this file's idea of an edit;
 * this tests feature 006's.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { squads, squadSeats } from '../../src/db/schema/squads.js';
import { currentState } from '../../src/battle/act.js';
import {
  arena,
  act,
  defenseConfig,
  formation,
  ROSTER,
  start,
  type Arena,
  type StartedBattle,
} from './live.js';

let a: Arena;
let started: StartedBattle;
/** The six defending champions the battle was created against. */
let original: readonly string[];
let replacements: readonly string[];

beforeAll(async () => {
  a = await arena('snapshot');
  started = await start(a);

  original = started.packet.state.heroes
    .filter((h) => h.instanceId.startsWith('d-'))
    .map((h) => h.heroId);

  /**
   * **Six champions the battle has never seen**, chosen from the far end of the
   * roster so that not one of them could be mistaken for a survivor of the
   * original squad. A partial overlap would make a leak ambiguous.
   */
  replacements = ROSTER.slice(18, 24);

  const seats = formation(replacements, true).map((seat) => ({
    ...seat,
    config: defenseConfig({ targeting: ['highest-might', 'furthest'] }),
  }));

  const res = await app.request(`/v1/squads/defense/${started.zone}`, {
    method: 'PUT',
    headers: a.defender.headers(),
    body: JSON.stringify({ seats }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('the edit really happened', () => {
  it('replaced the live squad the battle was created from', async () => {
    /**
     * **Without this the whole file passes for the wrong reason.** A save that
     * silently failed would leave the original squad in place, and every
     * assertion below would hold while proving nothing at all.
     */
    const rows = await db()
      .select({ heroId: squadSeats.heroId })
      .from(squadSeats)
      .innerJoin(squads, eq(squads.id, squadSeats.squadId))
      .where(and(eq(squads.accountId, a.defender.accountId), eq(squads.zone, started.zone as never)));

    const live = new Set(rows.map((r) => r.heroId));
    expect([...live].sort()).toEqual([...replacements].sort());
  });
});

describe('the battle in progress', () => {
  it('still holds the original six champions', async () => {
    const result = await currentState(started.battleId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const defenders = result.battle.state.heroes
      .filter((h) => h.side === 'defender')
      .map((h) => h.heroId);

    expect(defenders).toEqual([...original]);
    for (const heroId of replacements) {
      expect(defenders, `${heroId} reached a battle already in progress`).not.toContain(heroId);
    }
  });

  it('keeps the configuration it was created with, not the edited one', async () => {
    const result = await currentState(started.battleId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /**
     * **The configuration is half the snapshot and the half that gets
     * forgotten.** Copying the six heroes and re-reading their targeting rules
     * from the live table would pass every check about *who* is defending while
     * letting the defender re-aim them mid-fight.
     */
    for (const config of Object.values(result.battle.configs)) {
      expect(config.targeting).toEqual(['lowest-current-hp', 'nearest']);
    }
  });

  it('carries on being playable, against the frozen squad', async () => {
    const acted = await act(a, started.battleId, started.sequence, started.packet.state);
    expect(acted.status, acted.text).toBe(200);

    const heroes = acted.body.packet.state.heroes
      .filter((h) => h.instanceId.startsWith('d-'))
      .map((h) => h.heroId);

    expect(heroes).toEqual([...original]);
  });
});
