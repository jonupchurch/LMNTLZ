/**
 * The `act` status table, end to end (007 T023–T025).
 *
 * ### `200` twice, and the two responses must be indistinguishable
 *
 * The contract says a repeated `sequence` returns the same packet, and that a
 * client cannot tell a resolution from a replay. That is not politeness — it is
 * what makes retrying safe *without the client knowing it retried*, and a client
 * that could tell would branch on it. `idempotency.test.ts` proves the property
 * against the log; this proves the route actually has it, which is a different
 * claim and the one a player depends on.
 *
 * ### An illegal action must leave no trace
 *
 * `422` is the easy half. The half worth testing is that **the log did not
 * grow** — an append-only log has no way to take a row back, and an illegal
 * action that got written would be replayed on every subsequent request forever.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { legalTargets } from '@lmntlz/sim/rules';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { battleActions } from '../../src/db/schema/battles.js';
import { usablePowers } from '../../src/battle/choicePoint.js';
import {
  arena,
  clearOpenBattle,
  start,
  type Arena,
  type BattleShape,
  type StartedBattle,
} from './live.js';

let a: Arena;
let started: StartedBattle;

const post = (battleId: string, body: unknown, as: 'attacker' | 'defender' = 'attacker') =>
  app.request(`/v1/battles/${battleId}/act`, {
    method: 'POST',
    headers: a[as].headers(),
    body: JSON.stringify(body),
  });

/** The move a correct client would send for whoever is up. */
function firstLegalMove(state: BattleShape, sequence: number) {
  const up = state.turnOfInstance!;
  const power = usablePowers(state as never, up)[0]!;
  const targeting = legalTargets(state as never, up, power.id);

  return {
    sequence,
    actorInstanceId: up,
    powerId: power.id,
    targetInstanceId: targeting.compelled ?? targeting.candidates[0]!,
  };
}

const rowsAt = async (battleId: string, sequence: number): Promise<number> => {
  const [row] = await db()
    .select({ n: count() })
    .from(battleActions)
    .where(and(eq(battleActions.battleId, battleId), eq(battleActions.sequence, sequence)));
  return row!.n;
};

beforeAll(async () => {
  a = await arena('routes');
  started = await start(a);
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

describe('POST /v1/battles', () => {
  it('opens at sequence 0 with the turns before the first choice already folded', () => {
    expect(started.sequence).toBe(0);
    expect(started.packet.state.turnOfInstance).not.toBeNull();
    expect(['visible', 'hidden']).toContain(started.zone);
  });
});

describe('the act status table', () => {
  it('200 — resolves, and 200 again returns a byte-identical packet', async () => {
    const move = firstLegalMove(started.packet.state, 0);

    const first = await post(started.battleId, move);
    const firstText = await first.text();
    expect(first.status, firstText).toBe(200);

    const again = await post(started.battleId, move);
    const againText = await again.text();

    expect(again.status).toBe(200);
    expect(againText).toBe(firstText);
    expect(await rowsAt(started.battleId, 0)).toBe(1);
  });

  it('200 — a DIFFERENT body at a written sequence still returns the stored packet', async () => {
    /**
     * **The line that catches a half-implementation.** Once `(battleId, 0)`
     * exists the request body is irrelevant; an implementation that recomputed
     * on conflict passes the test above and fails this one, because it would
     * resolve the new intent instead of returning what was already stored.
     */
    const stored = await (await post(started.battleId, firstLegalMove(started.packet.state, 0))).text();

    const different = await post(started.battleId, {
      sequence: 0,
      actorInstanceId: 'a-back-0',
      powerId: 'nonsense',
      targetInstanceId: 'd-front-0',
    });

    expect(different.status).toBe(200);
    expect(await different.text()).toBe(stored);
    expect(await rowsAt(started.battleId, 0)).toBe(1);
  });

  it('409 — a skipped sequence is refused and carries the one to resume from', async () => {
    const res = await post(started.battleId, { ...firstLegalMove(started.packet.state, 0), sequence: 9 });
    const body = (await res.json()) as { error: { code: string }; currentSequence: number };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('sequence_gap');
    expect(body.currentSequence).toBe(1);
    expect(await rowsAt(started.battleId, 9)).toBe(0);
  });

  it('404 — somebody else’s battle is not found rather than forbidden', async () => {
    /**
     * **Deliberately indistinguishable from a battle that does not exist.** A
     * `403` would let anybody enumerate ids and learn who is fighting whom,
     * which is a scouting signal in a game built on not knowing.
     */
    const res = await post(started.battleId, firstLegalMove(started.packet.state, 1), 'defender');
    expect(res.status).toBe(404);
  });

  it('404 — an unknown battle id', async () => {
    const res = await post('00000000-0000-4000-8000-000000000000', { sequence: 0, actorInstanceId: 'a-front-0', powerId: 'x', targetInstanceId: null });
    expect(res.status).toBe(404);
  });

  it('400 — a body that is not an action at all', async () => {
    const res = await post(started.battleId, { sequence: 'one' });
    expect(res.status).toBe(400);
  });
});

describe('an illegal intent is refused and appends nothing', () => {
  /**
   * Each case asserts the status, the machine-readable reason **and** that
   * `(battleId, sequence)` is still empty afterwards. The last one is the real
   * assertion: an append-only log cannot un-write a row.
   */
  const cases: readonly { readonly name: string; readonly code: string; readonly build: (s: BattleShape, seq: number) => unknown }[] = [
    {
      name: 'a hero whose turn it is not',
      code: 'not_your_turn',
      build: (s, seq) => ({ ...(firstLegalMove(s, seq) as object), actorInstanceId: otherAttacker(s) }),
    },
    {
      name: 'a defending hero the engine owns',
      code: 'not_your_turn',
      build: (s, seq) => ({ ...(firstLegalMove(s, seq) as object), actorInstanceId: 'd-front-0' }),
    },
    {
      name: 'a power the hero cannot use',
      code: 'power_unavailable',
      build: (s, seq) => ({ ...(firstLegalMove(s, seq) as object), powerId: 'p_not_a_real_power' }),
    },
    {
      name: 'a target out of reach',
      code: 'illegal_target',
      build: (s, seq) => ({ ...(firstLegalMove(s, seq) as object), targetInstanceId: illegalTarget(s) }),
    },
    {
      name: 'no target at all',
      code: 'illegal_target',
      build: (s, seq) => ({ ...(firstLegalMove(s, seq) as object), targetInstanceId: null }),
    },
  ];

  /** An attacker that is standing but is not the one up. */
  function otherAttacker(state: BattleShape): string {
    const other = state.heroes.find(
      (h) => h.instanceId.startsWith('a-') && h.instanceId !== state.turnOfInstance && h.hp > 0,
    );
    return other!.instanceId;
  }

  /** A defender that is *not* among the legal targets for the move being sent. */
  function illegalTarget(state: BattleShape): string {
    const up = state.turnOfInstance!;
    const power = usablePowers(state as never, up)[0]!;
    const legal = new Set(legalTargets(state as never, up, power.id).candidates);

    const out = state.heroes.find((h) => h.instanceId.startsWith('d-') && !legal.has(h.instanceId));
    // Every battle opens with the far defender rows outside a reach-1 attacker's
    // range; if that ever stops being true this test needs a different board.
    return out!.instanceId;
  }

  for (const { name, code, build } of cases) {
    it(`refuses ${name}`, async () => {
      const before = await app.request(`/v1/battles/${started.battleId}`, {
        headers: a.attacker.headers(),
      });
      const { sequence, state } = (await before.json()) as { sequence: number; state: BattleShape };

      const res = await post(started.battleId, build(state, sequence));
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(body.error.code).toBe(code);
      expect(await rowsAt(started.battleId, sequence), 'the refusal wrote a row').toBe(0);
    });
  }
});

describe('GET /v1/battles/:battleId', () => {
  it('re-derives the same board the last act returned', async () => {
    const before = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    const first = (await before.json()) as { sequence: number; state: BattleShape };

    const move = firstLegalMove(first.state, first.sequence);
    const acted = await post(started.battleId, move);
    const packet = ((await acted.json()) as { packet: { state: BattleShape } }).packet;

    const after = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    const resync = (await after.json()) as { sequence: number; state: BattleShape };

    /**
     * **Deep equality, not string equality.** The `act` response comes back out
     * of the `jsonb` column, and Postgres does not preserve key order — so the
     * two carry the same board with the keys rearranged. A string comparison
     * here fails on a difference that does not exist.
     */
    expect(resync.state).toEqual(packet.state);
    expect(resync.sequence).toBe(first.sequence + 1);
  });

  it('404s for a battle that is not the caller’s', async () => {
    const res = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.defender.headers(),
    });
    expect(res.status).toBe(404);
  });

  /**
   * **The resume path used to report nothing at all.** `POST /battles` announced
   * the ambush and this route omitted the field, so the client hardcoded `false`
   * and one reload permanently erased the only notice a player got that they
   * were fighting a Hidden squad. Reported from live play, 2026-08-01.
   *
   * Asserted as *agreement with the creating response* rather than against a
   * literal, because the zone is a random roll: pinning `false` here would pass
   * on every run where the ambush did not fire, which is most of them, and the
   * one run that mattered would be the flake.
   */
  it('reports the ambush the creating response reported', async () => {
    const res = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    const view = (await res.json()) as { zone: string; ambushed: boolean };

    expect(view.ambushed, 'GET disagreed with POST about the ambush').toBe(started.ambushed);
    expect(typeof view.ambushed, 'the field was absent, which is how this broke').toBe('boolean');
    /* And it is the zone's own fact, not an independent one that could drift. */
    expect(view.ambushed).toBe(view.zone === 'hidden');
  });
});

describe('creating a battle validates the request (with nothing open)', () => {
  /**
   * ### Why these two clear the open battle first
   *
   * **`409 battle_already_open` outranks a bad request body, and that ordering
   * is right.** A client that has a battle open and also sent a wrong slot has
   * exactly one useful thing to be told: where the battle is. `422 no attack
   * squad in slot 2` is true and gets them nowhere.
   *
   * So these are tests about *request validation*, and they have to run with
   * nothing open or they are really testing the state check again — which
   * `ending.test.ts` covers properly.
   */
  it('refuses a squad slot that does not exist', async () => {
    await clearOpenBattle(a);

    const res = await app.request('/v1/battles', {
      method: 'POST',
      headers: a.attacker.headers(),
      body: JSON.stringify({ opponentId: a.defender.accountId, attackSquadSlot: 2 }),
    });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('no_attack_squad');
  });

  it('refuses attacking yourself', async () => {
    await clearOpenBattle(a);

    const res = await app.request('/v1/battles', {
      method: 'POST',
      headers: a.attacker.headers(),
      body: JSON.stringify({ opponentId: a.attacker.accountId, attackSquadSlot: 0 }),
    });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('opponent_is_self');
  });
});
