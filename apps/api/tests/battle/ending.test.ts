/**
 * A battle always ends (007 T040–T042, US5, SC-006).
 *
 * ### Three ways out, and only one of them is the player winning
 *
 * A fight can end by elimination, by the 300-hero-turn cap, or by nobody coming
 * back to it. The third is the one that needs machinery: **an open battle with
 * no expiry is a row that lives forever and a player who can never start
 * another**, because the one-at-a-time rule is enforced against exactly that
 * row.
 *
 * So the three concerns here are really one: whatever happens, the battle
 * reaches a terminal state and the player is free to start the next.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq, sql } from 'drizzle-orm';
import { battleEnded, HERO_TURN_CAP } from '@lmntlz/sim/rules';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battles } from '../../src/db/schema/battles.js';
import { DEFAULT_EXPIRY_HOURS, expiryHours, sweepExpired } from '../../src/battle/expiry.js';
import { arena, act, start, type Arena, type StartedBattle } from './live.js';
import { board, ROSTER as HEROES } from './fixtures.js';

let a: Arena;

beforeAll(async () => {
  a = await arena('ending');
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

const startRaw = () =>
  app.request('/v1/battles', {
    method: 'POST',
    headers: a.attacker.headers(),
    body: JSON.stringify({ opponentId: a.defender.accountId, attackSquadSlot: 0 }),
  });

/** Push a battle's whole history back in time, as if nobody touched it. */
async function ageBy(battleId: string, hours: number): Promise<void> {
  const shift = sql.raw(`interval '${hours} hours'`);
  await db()
    .update(battles)
    .set({ startedAt: sql`${battles.startedAt} - ${shift}` })
    .where(eq(battles.id, battleId));
  await db().execute(
    sql`update battle_actions set created_at = created_at - ${shift} where battle_id = ${battleId}`,
  );
}

/**
 * Age only the battle's **start**, leaving its actions where they are.
 *
 * **This is the shape `ageBy` cannot express, and the distinction is the whole
 * expiry rule.** A battle 30 hours old whose last action was a minute ago is a
 * player in a long fight; one 30 hours old with no recent action is a player who
 * walked away. Shifting both timestamps together makes the two indistinguishable
 * — so a sweep measuring from `started_at` passes every test built on that
 * helper while killing battles mid-swing.
 */
async function ageStartOnly(battleId: string, hours: number): Promise<void> {
  await db()
    .update(battles)
    .set({ startedAt: sql`${battles.startedAt} - ${sql.raw(`interval '${hours} hours'`)}` })
    .where(eq(battles.id, battleId));
}

const exists = async (battleId: string): Promise<boolean> => {
  const [row] = await db().select({ n: count() }).from(battles).where(eq(battles.id, battleId));
  return row!.n > 0;
};

const abandoned = async (): Promise<number> => {
  const [row] = await db()
    .select({ n: accounts.abandonedBattles })
    .from(accounts)
    .where(eq(accounts.id, a.attacker.accountId))
    .limit(1);
  return row!.n;
};

describe('one battle at a time (T041, T043, T044)', () => {
  let open: StartedBattle;

  beforeAll(async () => {
    open = await start(a);
  }, 120_000);

  it('refuses a second battle with 409 carrying the open one’s id', async () => {
    /**
     * **The exploit this closes is selection, not spam.** Several open battles
     * lets a player start against many opponents and abandon the ones going
     * badly — which turns the attack streak and the ambush counter into a
     * measure of which fights somebody chose to finish.
     */
    const res = await startRaw();
    const body = (await res.json()) as { error: { code: string }; openBattleId: string };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('battle_already_open');
    expect(body.openBattleId).toBe(open.battleId);
  });

  it('answers "do I have one?" without needing an id', async () => {
    const res = await app.request('/v1/battles/open', { headers: a.attacker.headers() });
    const body = (await res.json()) as { battleId: string; expiresAt: string };

    expect(res.status).toBe(200);
    expect(body.battleId).toBe(open.battleId);
    // Stated, so a client can show the deadline rather than compute it.
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('allows a new battle once the first is out of the way', async () => {
    /**
     * **Discarding is a way out as well as concluding.** Otherwise the rule
     * that stops farming would strand any player whose battle became
     * unwinnable, and stranding them is the worse failure.
     */
    await ageBy(open.battleId, expiryHours() + 1);
    const gone = await app.request(`/v1/battles/${open.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(gone.status).toBe(410);

    const res = await startRaw();
    expect(res.status, await res.clone().text()).toBe(201);

    const body = (await res.json()) as StartedBattle;
    a.createdBattles.push(body.battleId);
    expect(body.battleId).not.toBe(open.battleId);
  });

  it('reports no open battle when there is none', async () => {
    const current = (await (
      await app.request('/v1/battles/open', { headers: a.attacker.headers() })
    ).json()) as { battleId: string };

    await db().delete(battles).where(eq(battles.id, current.battleId));

    const res = await app.request('/v1/battles/open', { headers: a.attacker.headers() });
    expect(res.status).toBe(204);
  });
});

describe('expiry is a discard, not a result (T040, T045)', () => {
  it('410s on the player’s return, counts the abandonment, records no battle', async () => {
    const started = await start(a);
    await act(a, started.battleId, started.sequence, started.packet.state);

    const before = await abandoned();
    await ageBy(started.battleId, expiryHours() + 1);

    const res = await app.request(`/v1/battles/${started.battleId}/act`, {
      method: 'POST',
      headers: a.attacker.headers(),
      body: JSON.stringify({
        sequence: 1,
        actorInstanceId: 'a-front-0',
        powerId: 'p',
        targetInstanceId: 'd-front-0',
      }),
    });

    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('battle_expired');

    /**
     * **Nothing recorded except the counter**, which is the distinction FR-013
     * turns on: saying somebody walked away is not saying a battle happened,
     * and only the second would pollute every aggregate feature 008 computes.
     */
    expect(await exists(started.battleId)).toBe(false);
    expect(await abandoned()).toBe(before + 1);
  });

  it('counts the abandonment exactly once, however many times it is touched', async () => {
    const started = await start(a);
    await ageBy(started.battleId, expiryHours() + 1);

    const before = await abandoned();

    // First touch discards and counts; the rest find nothing at all.
    const first = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(first.status).toBe(410);

    for (let i = 0; i < 3; i++) {
      const again = await app.request(`/v1/battles/${started.battleId}`, {
        headers: a.attacker.headers(),
      });
      expect(again.status).toBe(404);
    }

    expect(await abandoned()).toBe(before + 1);
  });

  it('does not expire a battle inside its window', async () => {
    const started = await start(a);
    await ageBy(started.battleId, expiryHours() - 1);

    const res = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(200);

    // Clean up so the one-at-a-time rule does not block later suites.
    await db().delete(battles).where(eq(battles.id, started.battleId));
  });
});

describe('the sweep (T046, T047)', () => {
  it('is configuration, not a constant', () => {
    const saved = process.env['BATTLE_EXPIRY_HOURS'];
    try {
      process.env['BATTLE_EXPIRY_HOURS'] = '6';
      expect(expiryHours()).toBe(6);

      /**
       * **A bad value falls back rather than throwing.** A typo would otherwise
       * stop the job that keeps this table finite — silently, because nobody
       * watches a cron that is no longer running.
       */
      for (const bad of ['', 'soon', '-3', '0', 'NaN']) {
        process.env['BATTLE_EXPIRY_HOURS'] = bad;
        expect(expiryHours(), bad).toBe(DEFAULT_EXPIRY_HOURS);
      }
    } finally {
      if (saved === undefined) delete process.env['BATTLE_EXPIRY_HOURS'];
      else process.env['BATTLE_EXPIRY_HOURS'] = saved;
    }
  });

  it('discards what is due and leaves what is not', async () => {
    const stale = await start(a);
    await ageBy(stale.battleId, expiryHours() + 2);

    const before = await abandoned();
    const sweep = await sweepExpired(50);

    expect(sweep.discarded).toBeGreaterThanOrEqual(1);
    expect(await exists(stale.battleId)).toBe(false);
    expect(await abandoned()).toBe(before + 1);
  });

  it('is safe to re-run over the same battles', async () => {
    /**
     * The property that makes the batch limit safe: an interrupted run has done
     * nothing a later run needs to know about, because `discard` guards on
     * `concluded_at IS NULL` in the same statement that deletes.
     */
    const before = await abandoned();
    const again = await sweepExpired(50);

    expect(again.discarded).toBe(0);
    expect(await abandoned()).toBe(before);
  });

  it('spares a long fight that is still being played', async () => {
    /**
     * **The clock runs from the last action, not from the start**, and this is
     * the only test that can tell the difference. A battle 30 hours old whose
     * last action was seconds ago is somebody mid-fight; measuring from
     * `started_at` deletes it out from under them, and every other test here
     * passes on that version because the helper they use ages both timestamps
     * at once.
     *
     * Found by mutation — the `started_at`-only sweep survived all thirteen
     * assertions before this one existed.
     */
    const long = await start(a);
    await act(a, long.battleId, long.sequence, long.packet.state);
    await ageStartOnly(long.battleId, expiryHours() * 2);

    const before = await abandoned();
    await sweepExpired(50);

    expect(await exists(long.battleId), 'a battle in progress was swept').toBe(true);
    expect(await abandoned()).toBe(before);

    // And the player can still play it.
    const res = await app.request(`/v1/battles/${long.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(200);

    await db().delete(battles).where(eq(battles.id, long.battleId));
  });

  it('reports that more remain when it fills its batch', async () => {
    const one = await start(a);
    await ageBy(one.battleId, expiryHours() + 2);

    const sweep = await sweepExpired(1);
    expect(sweep.examined).toBe(1);
    expect(sweep.more).toBe(true);
  });
});

describe('the turn cap resolves a stalemate (T042)', () => {
  it('ends a battle at the cap by pooled HP share rather than leaving it open', () => {
    /**
     * **Driven against the rule rather than through a fought battle**, because
     * constructing a genuine 300-turn stalemate needs content that cannot
     * currently produce one — every squad the roster can field kills something
     * eventually. What matters is that the cap *is* an ending: a battle that
     * reached it and stayed open would be one the one-at-a-time rule locks a
     * player out of forever.
     */
    const base = board(HEROES.slice(0, 6), HEROES.slice(6, 12));
    const hurt = {
      ...base,
      heroTurn: HERO_TURN_CAP,
      heroes: base.heroes.map((h) =>
        h.side === 'defender' ? { ...h, hp: Math.floor(h.maxHp / 2) } : h,
      ),
    };

    const conclusion = battleEnded(hurt);

    expect(conclusion).not.toBeNull();
    expect(conclusion!.winner).toBe('attacker');
    expect(conclusion!.reason).toMatch(/^cap-/);
  });

  it('is still open one turn before the cap', () => {
    const base = board(HEROES.slice(0, 6), HEROES.slice(6, 12));
    const almost = { ...base, heroTurn: HERO_TURN_CAP - 1 };
    expect(battleEnded(almost)).toBeNull();
  });
});
