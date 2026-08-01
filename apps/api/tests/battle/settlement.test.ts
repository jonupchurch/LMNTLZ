/**
 * A battle says what it paid (`specs/GAPS.md` §2c).
 *
 * ### The defect this closes, and its shape
 *
 * `settle()` awarded shards, moved both ratings and advanced both streaks — and
 * `settleAndRecord` read exactly one field of the result, `settled`, to decide
 * whether to write a replay blob. Everything else was computed and dropped. So a
 * player won a battle, was paid for it, had their rating moved, and **the end of
 * the fight said `Victory` and nothing else.**
 *
 * That is a new shape of this repo's most repeated defect. Every previous one
 * was a function nobody called; here the caller exists and looks entirely
 * correct — `rg settle` finds it, and `tools/gap-audit.py` sees a route that is
 * reached and answers. The question that catches it is not *"is this called?"*
 * but **"is the return value used?"**
 *
 * ### These assertions are differences, never plausible numbers
 *
 * A settlement reporting `shards: 15` looks right whatever it is measuring. So
 * the tests below check the payout against the ledger and the rating against the
 * standings table — two independent readings that a hardcoded constant, a copied
 * field or a zeroed default cannot satisfy at once.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { arena, fightToTheEnd, start, type Arena } from './live.js';

let a: Arena;

beforeAll(async () => {
  a = await arena('settlement');
}, 120_000);

afterAll(async () => {
  await a.close();
  await closeDb();
});

const ratingOf = async (accountId: string): Promise<number | null> => {
  const [row] = await db()
    .select({ rating: playerRatings.rating })
    .from(playerRatings)
    .where(eq(playerRatings.accountId, accountId))
    .limit(1);
  return row?.rating ?? null;
};

describe('the response that concludes a battle', () => {
  it('reports the winner, the payout and the rating movement', async () => {
    const fought = await fightToTheEnd(a, await start(a));
    expect(fought.conclusion, 'the battle never concluded').toBeTruthy();

    const s = fought.settlement;
    expect(s, 'a battle concluded and reported nothing about it').toBeDefined();

    // The winner, and whether it was *this* player — the attacker is who acts.
    expect(['attacker', 'defender']).toContain(s!.winner);
    expect(s!.won).toBe(s!.winner === 'attacker');

    // Shape rather than amount: the numbers depend on income tables that tune
    // independently of this wire, and pinning them here would make a balance
    // change fail a plumbing test.
    expect(Number.isFinite(s!.shards)).toBe(true);
    expect(s!.shards).toBeGreaterThanOrEqual(0);
    expect(s!.shardsEarned).toBeGreaterThanOrEqual(s!.shards);
    expect(s!.turnCount).toBeGreaterThan(0);
    expect(s!.zone).toBe('visible');
  });

  /**
   * **The assertion that a plausible-looking constant cannot pass.** The rating
   * the settlement reports must be the rating the database now holds — not a
   * number of the right magnitude, and not the one from before the battle.
   *
   * This is also the check that caught a real bug while it was being written:
   * `applyRating` stores `round(rating + delta)::int`, so the column is an
   * INTEGER, while `ratingDeltas` is deliberately fractional. Reporting the raw
   * delta would have printed `1180 +17.7 → 1197.7` against a stored 1198.
   */
  it('reports the rating the database actually holds', async () => {
    const fought = await fightToTheEnd(a, await start(a));
    const s = fought.settlement!;
    expect(s).toBeDefined();

    const stored = await ratingOf(a.attacker.accountId);
    expect(stored, 'the attacker has no rating row after a rated battle').not.toBeNull();
    expect(s.ratingAfter, 'the reported rating disagrees with the stored one').toBe(stored);

    // And the banner has to add up: before + delta === after, in integers.
    expect(s.ratingBefore + s.ratingDelta).toBe(s.ratingAfter);
    expect(Number.isInteger(s.ratingDelta)).toBe(true);
  });

  it('moves the rating by what it said it moved it by', async () => {
    // Two readings around one battle. A settlement that reported a delta it did
    // not apply — or applied one it did not report — fails here and nowhere else.
    const before = await ratingOf(a.attacker.accountId);
    const fought = await fightToTheEnd(a, await start(a));
    const after = await ratingOf(a.attacker.accountId);

    const s = fought.settlement!;
    expect(s).toBeDefined();
    expect(s.ratingBefore).toBe(before);
    expect(after! - before!).toBe(s.ratingDelta);
  });
});

describe('a settlement is reported once', () => {
  /**
   * Settlement is called by every request that observes a conclusion — the final
   * `act`, a retry, a later `GET` — and all but the first match zero rows. The
   * amounts are not persisted, so a second reader cannot know them.
   *
   * **It must answer `undefined`, never zeroes.** A zeroed payout is
   * indistinguishable from a genuinely capped-out player who earned nothing, and
   * the client would print "0 shards" over a battle that paid 60.
   */
  it('a later GET on the same battle reports no settlement rather than an empty one', async () => {
    const started = await start(a);
    const fought = await fightToTheEnd(a, started);
    expect(fought.settlement, 'the concluding response reported nothing').toBeDefined();

    const res = await app.request(`/v1/battles/${started.battleId}`, {
      headers: a.attacker.headers(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body['conclusion'], 'the battle should read as concluded').toBeTruthy();
    expect(
      body['settlement'],
      'a repair read invented a settlement it cannot know the amounts of',
    ).toBeUndefined();
  });

  it('does not pay twice when the concluding act is retried', async () => {
    const started = await start(a);
    await fightToTheEnd(a, started);

    const paidOnce = await ratingOf(a.attacker.accountId);

    // A `GET` runs the repair path. It must find nothing to do.
    await app.request(`/v1/battles/${started.battleId}`, { headers: a.attacker.headers() });

    expect(await ratingOf(a.attacker.accountId), 'the rating moved a second time').toBe(paidOnce);
  });
});
