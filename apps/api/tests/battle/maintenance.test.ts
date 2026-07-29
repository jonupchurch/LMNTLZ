/**
 * A maintenance window costs a player nothing (007 T035–T036, US4, SC-001/005).
 *
 * ### `draining` is the only state worth testing carefully
 *
 * `live` accepts everything and `down` refuses everything; neither can be got
 * subtly wrong. **`draining` differs from both in exactly one place** — a new
 * battle is refused while an open one still resolves — and an implementation
 * that treated it as `down` would pass every test written about the other two
 * while killing every battle in flight on every deploy. That is the ticket US4
 * exists to prevent, so it is the case with the most assertions here.
 *
 * ### The discard is checked field by field, on purpose
 *
 * FR-016 enumerates rating, rewards **and** the attempt. It enumerates them
 * because a partial implementation that refunds two of the three is invisible:
 * the two that worked look like the whole thing worked, and the player who lost
 * the third has no way to describe what happened to them.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { battleActions, battles } from '../../src/db/schema/battles.js';
import { squads } from '../../src/db/schema/squads.js';
import { playerStreaks } from '../../src/db/schema/streaks.js';
import {
  canAct,
  canStartBattle,
  parseMaintenance,
  setMaintenanceSource,
  type MaintenanceState,
} from '../../src/battle/maintenance.js';
import { discard } from '../../src/battle/settle.js';
import { arena, act, start, type Arena, type StartedBattle } from './live.js';

let a: Arena;
let restore: (() => void) | undefined;

const window_ = (state: MaintenanceState) => {
  restore?.();
  restore = setMaintenanceSource(() => state);
};

beforeAll(async () => {
  a = await arena('maint');
}, 120_000);

afterEach(() => {
  restore?.();
  restore = undefined;
});

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

describe('the flag itself', () => {
  it('has exactly three states', () => {
    expect(parseMaintenance('live')).toBe('live');
    expect(parseMaintenance('draining')).toBe('draining');
    expect(parseMaintenance('down')).toBe('down');
  });

  it('reads anything unrecognised as `live`, failing OPEN', () => {
    /**
     * **The direction is deliberate.** Failing closed means a typo in a config
     * value, or an edge read returning `undefined` during a provider incident,
     * takes the whole game offline. Failing open leaves it in the state it was
     * already in — and an operator closing a window watches it take effect,
     * while nobody watches a flag that was never set.
     */
    for (const raw of [undefined, null, '', 'LIVE', 'maintenance', 'true', 'off']) {
      expect(parseMaintenance(raw), `"${String(raw)}"`).toBe('live');
    }
  });

  it('splits the two questions, because they differ in exactly one state', () => {
    expect([canStartBattle('live'), canAct('live')]).toEqual([true, true]);
    // The row the whole feature exists for.
    expect([canStartBattle('draining'), canAct('draining')]).toEqual([false, true]);
    expect([canStartBattle('down'), canAct('down')]).toEqual([false, false]);
  });
});

describe('live', () => {
  it('accepts a new battle', async () => {
    window_('live');
    const res = await startRaw();
    expect(res.status).toBe(201);

    const body = (await res.json()) as StartedBattle;
    a.createdBattles.push(body.battleId);
  });
});

describe('draining', () => {
  let open: StartedBattle;

  beforeAll(async () => {
    window_('live');
    open = await start(a);
  }, 120_000);

  it('refuses a NEW battle with 503', async () => {
    window_('draining');
    const res = await startRaw();

    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('maintenance');
  });

  it('still resolves an action on a battle already open', async () => {
    /**
     * **The assertion the whole third state exists for.** An implementation
     * that treated `draining` as `down` passes every test about `live` and
     * `down` and drops every battle in flight on every deploy.
     */
    window_('draining');
    const result = await act(a, open.battleId, open.sequence, open.packet.state);

    expect(result.status, result.text).toBe(200);
  });

  it('leaves nothing behind when it refuses', async () => {
    /**
     * A refusal that had already snapshotted two squads and minted a seed would
     * leave a battle row nobody can play — invisible until it turns up in an
     * aggregate as a fight that never happened.
     */
    window_('draining');
    const before = await db()
      .select({ n: count() })
      .from(battles)
      .where(eq(battles.attackerId, a.attacker.accountId));

    expect((await startRaw()).status).toBe(503);

    const after = await db()
      .select({ n: count() })
      .from(battles)
      .where(eq(battles.attackerId, a.attacker.accountId));

    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe('down', () => {
  let open: StartedBattle;

  beforeAll(async () => {
    window_('live');
    open = await start(a);
  }, 120_000);

  it('refuses a new battle', async () => {
    window_('down');
    expect((await startRaw()).status).toBe(503);
  });

  it('refuses an action too, and the battle survives to be finished later', async () => {
    window_('down');
    const res = await app.request(`/v1/battles/${open.battleId}/act`, {
      method: 'POST',
      headers: a.attacker.headers(),
      body: JSON.stringify({
        sequence: open.sequence,
        actorInstanceId: open.packet.state.turnOfInstance,
        powerId: 'p',
        targetInstanceId: 'd-front-0',
      }),
    });

    expect(res.status).toBe(503);

    // Refused, not lost: the row is untouched and no action was appended.
    const [row] = await db().select().from(battles).where(eq(battles.id, open.battleId)).limit(1);
    expect(row).toBeDefined();
    expect(row!.concludedAt).toBeNull();

    const [actions] = await db()
      .select({ n: count() })
      .from(battleActions)
      .where(eq(battleActions.battleId, open.battleId));
    expect(actions!.n).toBe(open.sequence);
  });

  it('lets the same battle finish once the window closes', async () => {
    window_('live');
    const result = await act(a, open.battleId, open.sequence, open.packet.state);
    expect(result.status, result.text).toBe(200);
  });
});

describe('a discard is a complete no-op', () => {
  it('leaves no battle record, no streak movement, and no counted attempt', async () => {
    window_('live');
    const started = await start(a);
    await act(a, started.battleId, started.sequence, started.packet.state);

    const before = {
      attack: await attackStreak(),
      hold: await holdStreak(started.zone),
      abandoned: await abandoned(),
    };

    const result = await discard(started.battleId, 'maintenance', a.attacker.accountId);
    expect(result.discarded).toBe(true);

    // No battle record — SC-005, and the reason it is a deletion rather than a
    // status: a row left behind is counted by every aggregate feature 008 runs.
    const [rows] = await db()
      .select({ n: count() })
      .from(battles)
      .where(eq(battles.id, started.battleId));
    expect(rows!.n).toBe(0);

    // And its action log went with it, by cascade.
    const [actions] = await db()
      .select({ n: count() })
      .from(battleActions)
      .where(eq(battleActions.battleId, started.battleId));
    expect(actions!.n).toBe(0);

    expect(await attackStreak()).toBe(before.attack);
    expect(await holdStreak(started.zone)).toBe(before.hold);

    /**
     * **A maintenance discard is not counted against the player.** It is the
     * operator's doing; marking the account for it would put a black mark on
     * somebody for something they did not do.
     */
    expect(await abandoned()).toBe(before.abandoned);
    expect(result.counted).toBe(false);
  });

  it('counts an EXPIRY against the account, without recording a battle', async () => {
    /**
     * **Two different claims, and only one of them is about a battle.** The
     * counter says somebody walked away — a real operational signal and a
     * plausible client-bug detector. Recording *that* is not the same as
     * recording a battle, and only the second would pollute the aggregates.
     */
    window_('live');
    const started = await start(a);
    const before = await abandoned();

    const result = await discard(started.battleId, 'expired', a.attacker.accountId);

    expect(result).toEqual({ discarded: true, counted: true });
    expect(await abandoned()).toBe(before + 1);

    const [rows] = await db()
      .select({ n: count() })
      .from(battles)
      .where(eq(battles.id, started.battleId));
    expect(rows!.n).toBe(0);
  });

  it('refuses to discard a battle that already settled', async () => {
    /**
     * **The guard that stops a real result being erased.** Deleting a concluded
     * battle would remove the record while leaving the rewards it produced with
     * nothing behind them — and Constitution XVI makes that unrecoverable.
     */
    window_('live');
    const started = await start(a);

    await db()
      .update(battles)
      .set({ concludedAt: new Date(), winner: 'attacker', reason: 'elimination' })
      .where(eq(battles.id, started.battleId));

    const result = await discard(started.battleId, 'expired', a.attacker.accountId);
    expect(result).toEqual({ discarded: false, counted: false });

    const [rows] = await db()
      .select({ n: count() })
      .from(battles)
      .where(eq(battles.id, started.battleId));
    expect(rows!.n).toBe(1);
  });
});

async function attackStreak(): Promise<number> {
  const [row] = await db()
    .select({ n: playerStreaks.attackStreak })
    .from(playerStreaks)
    .where(eq(playerStreaks.accountId, a.attacker.accountId))
    .limit(1);
  return row?.n ?? 0;
}

async function holdStreak(zone: string): Promise<number> {
  const [row] = await db()
    .select({ n: squads.holdStreak })
    .from(squads)
    .where(
      and(
        eq(squads.accountId, a.defender.accountId),
        eq(squads.kind, 'defense'),
        eq(squads.zone, zone as never),
      ),
    )
    .limit(1);
  return row!.n;
}

async function abandoned(): Promise<number> {
  const [row] = await db()
    .select({ n: accounts.abandonedBattles })
    .from(accounts)
    .where(eq(accounts.id, a.attacker.accountId))
    .limit(1);
  return row!.n;
}
