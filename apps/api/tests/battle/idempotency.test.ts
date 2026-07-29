/**
 * The same action never resolves twice (007 T008–T010, US2).
 *
 * ### These assert on the action log, not on the response
 *
 * That is the entire reason this file is worth writing. **The response looks
 * right in both the correct case and the double-advanced case** — same shape,
 * same fields, a plausible battle either way. The only place the bug is visible
 * is the number of rows under `(battle_id, sequence)`, so that is what gets
 * counted.
 *
 * ### Driven against `appendAction`, not against `POST /act`
 *
 * The route arrives with US1, and it needs a resolver that does not exist yet.
 * Waiting would put the schema constraint and its guarantee in the same commit
 * as the battle loop — which is the commit where nobody is looking at the
 * constraint. The quickstart's HTTP ladder is re-asserted end to end in T023;
 * what is checked here is the property underneath it, against a real Neon
 * database, because a fake would not have the primary key that does the work.
 *
 * The dropped connection is modelled as **a caller that never observes the
 * result**, because that is all a destroyed socket is from the database's side.
 * The socket itself is exercised at the route level.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import type { BattleState } from '@lmntlz/sim/rules';
import { closeDb, db } from '../../src/db/client.js';
import { battleActions, battles } from '../../src/db/schema/battles.js';
import {
  SequenceGapError,
  appendAction,
  nextSequence,
  storedPacket,
  type ActionIntent,
  type ActionPacket,
  type Resolution,
} from '../../src/battle/idempotency.js';

const created: string[] = [];

/**
 * A battle with no participants. **`attacker_id` and `defender_id` are nullable
 * by design** — a bot defender is not an account, and a deleted account leaves
 * its battles behind — so the log can be exercised without an account fixture.
 */
async function newBattle(): Promise<string> {
  const rows = await db()
    .insert(battles)
    .values({
      defenderIsBot: true,
      zone: 'visible',
      seed: 'test-seed-never-leaves-the-server',
      engineVersion: 'test',
      contentVersion: 'test',
      attackerSquad: { seats: [] },
      defenderSnapshot: { seats: [], configs: [] },
    })
    .returning({ id: battles.id });

  const id = rows[0]!.id;
  created.push(id);
  return id;
}

const state = (heroTurn: number): BattleState => ({
  heroes: [],
  heroTurn,
  turnOfInstance: null,
  engineVersion: 'test',
  contentVersion: 'test',
});

const packet = (heroTurn: number): ActionPacket => ({
  events: [],
  state: state(heroTurn),
  conclusion: null,
});

const intent = (sequence: number, over: Partial<ActionIntent> = {}): ActionIntent => ({
  sequence,
  actorInstanceId: 'a-bramwen',
  powerId: 'p_avalanche',
  targetInstanceId: 'd-ossic',
  ...over,
});

/**
 * A resolver stand-in that counts its calls and stamps each one differently.
 *
 * **The counter is load-bearing.** A retry that resolves again can still return
 * the right answer — the resolver is pure — so "did it resolve twice?" is not
 * answerable from the packet. The distinct stamp is what makes the second
 * question answerable: *whose* resolution ended up in the row.
 */
function resolver(first = 100, gate?: () => Promise<void>) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    resolve: async (): Promise<Resolution> => {
      const stamp = first + calls++;
      if (gate) await gate();
      return { packet: packet(stamp), drawIndexBefore: BigInt(first), drawsConsumed: 7n };
    },
  };
}

/**
 * Hold every arriving caller until `n` of them have arrived.
 *
 * **Without this the concurrency test is a coin flip**, and it lands the wrong
 * way often enough to be useless: two `Promise.all` calls against a network
 * database frequently do not overlap, the second takes the already-written fast
 * path, and the test passes while never having raced at all. It passed against a
 * deliberately broken last-writer-wins implementation for exactly that reason.
 *
 * Blocking inside the resolver puts the barrier where it belongs — after both
 * callers have checked for an existing row and agreed on the sequence, and
 * before either has inserted. That is the only interleaving that matters, and it
 * now happens every run.
 */
function barrier(n: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    if (++arrived >= n) release();
    return open;
  };
}

const rowsAt = async (battleId: string, sequence: number): Promise<number> => {
  const rows = await db()
    .select({ n: count() })
    .from(battleActions)
    .where(and(eq(battleActions.battleId, battleId), eq(battleActions.sequence, sequence)));
  return rows[0]?.n ?? 0;
};

/** Fill sequences `0 … n-1` so the ladder can start where the quickstart does. */
async function seedLog(battleId: string, upTo: number): Promise<void> {
  for (let s = 0; s < upTo; s++) {
    await appendAction(battleId, intent(s), () => ({
      packet: packet(s),
      drawIndexBefore: BigInt(s * 10),
      drawsConsumed: 10n,
    }));
  }
}

let battleId = '';

beforeEach(async () => {
  battleId = await newBattle();
});

afterAll(async () => {
  for (const id of created) {
    // battle_actions cascades from battles; the battle row is the only cleanup.
    await db().delete(battles).where(eq(battles.id, id));
  }
  await closeDb();
});

describe('the retry ladder', () => {
  it('answers a repeated sequence from the row, byte-identically, whatever the body says', async () => {
    await seedLog(battleId, 3);
    const r = resolver();

    const first = await appendAction(battleId, intent(3), r.resolve);
    expect(first.replayed).toBe(false);

    // Line 2 — the same body again.
    const again = await appendAction(battleId, intent(3), r.resolve);
    expect(again.replayed).toBe(true);
    expect(JSON.stringify(again.packet)).toBe(JSON.stringify(first.packet));

    /**
     * **Line 3 is the one that catches a half-implementation.** Once
     * `(battleId, 3)` exists the stored packet is returned and the request body
     * is irrelevant — a different actor, a different power and a different
     * target all get the original answer. An implementation that recomputes on
     * conflict passes the two lines above and fails this one.
     */
    const different = await appendAction(
      battleId,
      intent(3, { actorInstanceId: 'a-somebody-else', powerId: 'p_other', targetInstanceId: null }),
      r.resolve,
    );
    expect(JSON.stringify(different.packet)).toBe(JSON.stringify(first.packet));

    // And it never resolved again: three calls, one resolution.
    expect(r.calls).toBe(1);
    expect(await rowsAt(battleId, 3)).toBe(1);
  });

  it('refuses a skipped sequence and says which one to write', async () => {
    await seedLog(battleId, 4);

    // The quickstart's line 4: max is 3, so 5 skips 4.
    const r = resolver();

    /**
     * Captured rather than asserted inside a `.catch`. A `.catch` that never
     * fires takes its assertions with it, so the test passes by not running —
     * which is the same failure this whole file exists to make impossible.
     */
    const failure = await appendAction(battleId, intent(5), r.resolve).then(
      () => null,
      (err: unknown) => err,
    );

    expect(failure).toBeInstanceOf(SequenceGapError);
    expect((failure as SequenceGapError).currentSequence).toBe(4);

    // Nothing was resolved and nothing was written — a refusal, not a partial write.
    expect(r.calls).toBe(0);
    expect(await rowsAt(battleId, 5)).toBe(0);

    // Line 5: the sequence it named advances.
    const advanced = await appendAction(battleId, intent(4), r.resolve);
    expect(advanced.replayed).toBe(false);
    expect(await nextSequence(battleId)).toBe(5);
  });

  it('replays an old sequence as it was, not as the battle stands now', async () => {
    /**
     * A client several actions behind re-sends an action it already made.
     * Returning the *current* board with that action's events would be a
     * response describing a battle that never existed. It walks forward from
     * where it is, one stored packet at a time, and converges — and the
     * resynchronisation route exists for the client that would rather jump.
     */
    await seedLog(battleId, 6);

    const old = await appendAction(battleId, intent(2), () => {
      throw new Error('resolve must not be called for an action already written');
    });

    expect(old.replayed).toBe(true);
    expect(old.packet.state.heroTurn).toBe(2);
    expect(await nextSequence(battleId)).toBe(6);
  });
});

describe('a dropped connection', () => {
  it('advances the battle once when the caller never sees the response', async () => {
    await seedLog(battleId, 3);
    const r = resolver();

    /**
     * The socket dies here, and **the result is discarded** — from the
     * database's side that is all a destroyed socket is, a caller that never
     * reads the answer. The write commits regardless, and the client has no way
     * to tell whether it did, which is the entire problem this feature solves.
     *
     * The `await` is the test's, not the client's: it only keeps the run
     * deterministic, so a failure here is the code's and never the harness's.
     */
    await appendAction(battleId, intent(3), r.resolve);

    // The client re-reads and finds the action landed.
    expect(await nextSequence(battleId)).toBe(4);
    expect(await storedPacket(battleId, 3)).not.toBeNull();

    // ...and resubmits anyway, because a well-behaved client retries.
    const retry = await appendAction(battleId, intent(3), r.resolve);
    expect(retry.replayed).toBe(true);

    /**
     * **The assertion that matters.** Both responses look correct; only the row
     * count distinguishes a battle that advanced once from one that advanced
     * twice.
     */
    expect(await rowsAt(battleId, 3)).toBe(1);
    expect(await nextSequence(battleId)).toBe(4);
  });
});

describe('two identical submissions arriving at once', () => {
  it('appends exactly one entry and answers both from it (SC-004)', async () => {
    await seedLog(battleId, 3);

    /**
     * Both requests find no row, both compute the same expected sequence, both
     * resolve — and **each stamps its resolution differently**, so the winner is
     * identifiable. The primary key decides; nothing here votes.
     */
    const both = barrier(2);
    const a = resolver(500, both);
    const b = resolver(900, both);

    const [first, second] = await Promise.all([
      appendAction(battleId, intent(3), a.resolve),
      appendAction(battleId, intent(3), b.resolve),
    ]);

    // Both really did resolve — neither slipped past on the already-written path.
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);

    expect(await rowsAt(battleId, 3)).toBe(1);
    expect(JSON.stringify(first.packet)).toBe(JSON.stringify(second.packet));

    // Exactly one of them wrote. Both writing is the bug; neither writing is a hang.
    expect([first.replayed, second.replayed].filter((r) => !r)).toHaveLength(1);

    // The loser returned the winner's packet, not its own resolution.
    expect([500, 900]).toContain(first.packet.state.heroTurn);
    expect(await nextSequence(battleId)).toBe(4);
  });

  /**
   * **There is deliberately no test here for a third request arriving for the
   * *next* sequence while this one is in flight.** Whether it is refused as a
   * gap or accepted depends on whether the action in front committed first, and
   * **both outcomes are correct** — so any assertion strong enough to be worth
   * writing would be flaky, and any assertion stable enough to pass every run
   * turned out to pass against a deliberately broken implementation too. The
   * gap refusal itself is pinned sequentially in the ladder above, where it is
   * deterministic.
   */
});

describe('the draw window survives the round trip', () => {
  it('stores the indices as bigints and never puts them in the packet', async () => {
    /**
     * `drawIndexBefore` and `drawsConsumed` are the two fields a replay needs
     * and the client must never see. They live in their own columns rather than
     * inside `resolved_packet` precisely so that returning a packet cannot
     * return them (Constitution XII).
     */
    const r = resolver();
    const written = await appendAction(battleId, intent(0), r.resolve);

    expect(JSON.stringify(written.packet)).not.toContain('drawIndexBefore');
    expect(JSON.stringify(written.packet)).not.toContain('drawsConsumed');

    const rows = await db()
      .select()
      .from(battleActions)
      .where(and(eq(battleActions.battleId, battleId), eq(battleActions.sequence, 0)));

    expect(rows[0]?.drawIndexBefore).toBe(100n);
    expect(rows[0]?.drawsConsumed).toBe(7n);
  });
});
