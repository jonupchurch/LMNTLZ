/**
 * The gear axis, and the seam standing in for feature 010 (009 T005–T007).
 *
 * Three things are worth asserting here and only one of them is arithmetic.
 *
 * **Null is not zero.** Every row is unscored today, because 010 owns rune
 * placement. `gearScore()` must answer with the starter grant and
 * `recordPlacement()` must write **nothing** when there is nothing to ask — a row
 * carrying 1,500 as a stored value could never afterwards be told apart from a
 * genuinely-scored Bronze player.
 *
 * **Placed, never spent** (T007). This is a *structural* claim rather than a
 * behavioural one: the guarantee is that no shard balance can reach the
 * calculation, and the way to check that is to read the source for the absence of
 * one. See the comment on that test — the naive version of it passes for the wrong
 * reason.
 *
 * **`2.5 ×` and nothing else.** One conversion, rounded, so a band table can be
 * written in whole numbers.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { STARTER_GRANT_SCORE } from '../../src/matchmaking/league.js';
import {
  SCORE_PER_STAT_POINT,
  gearScore,
  recordPlacement,
  scoreFromStatPoints,
  setRuneSource,
  type RuneSource,
} from '../../src/matchmaking/gearScore.js';

const SUFFIX = `test-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
let accountId: string;
const undos: Array<() => void> = [];

beforeAll(async () => {
  const [row] = await db()
    .insert(accounts)
    .values({ username: `Gear ${SUFFIX}`, usernameKey: `gear-${SUFFIX}` })
    .returning();
  accountId = row!.id;
});

afterEach(() => {
  // A leaked source would silently change the next file's answers.
  while (undos.length) undos.pop()!();
});

afterAll(async () => {
  await db().delete(accounts).where(eq(accounts.id, accountId)); // cascades to player_ratings
  await closeDb();
});

const install = (source: RuneSource): void => {
  undos.push(setRuneSource(source));
};

describe('scoreFromStatPoints', () => {
  it('is 2.5 × points, and 2.5 is the only conversion', () => {
    expect(SCORE_PER_STAT_POINT).toBe(2.5);
    expect(scoreFromStatPoints(20)).toBe(50); // stage 1
    expect(scoreFromStatPoints(30)).toBe(75); // stage 2
    expect(scoreFromStatPoints(50)).toBe(125); // stage 4, effect included
  });

  it('scores stage 3 at 88, not the 90 the mechanics table prints', () => {
    /**
     * **A discrepancy in canon, found by this test, and the formula wins.**
     *
     * `09-matchmaking.md` *The gear score* publishes a per-stage table whose stage-3
     * row reads **90**. The stated formula is `2.5 × effective stat points` and
     * stage 3 grants `20 + 10 + 5 = 35`, which is **87.5 → 88**. Three of the four
     * rows agree with the formula exactly; only this one does not, and 90 ÷ 2.5 is
     * 36 points rather than 35.
     *
     * The formula is authoritative over its own illustration, and everything
     * load-bearing is built on stage 4: the starter grant is `12 × 125 = 1,500` and
     * a full kit is `81 × 125 = 10,125`, both of which the table gets right and both
     * of which are league boundaries. Stage 3 is a state players pass through, so
     * the practical effect is 2.5 points of score on a partly-built rune.
     *
     * **Recorded here so nobody "corrects" the code to match the document.** Flagged
     * to be fixed in `09-matchmaking.md` rather than fixed silently — a mechanics
     * doc is canon and this is a data error in it, not a wording preference.
     */
    expect(scoreFromStatPoints(35)).toBe(88);
    expect(2.5 * 35).toBe(87.5);

    /**
     * And the rounding happens **once, on the total** — the formula sums effective
     * points across every placed rune and multiplies once. Per-rune rounding would
     * accumulate: forty stage-3 runes would drift 20 points, which is a sixth of a
     * rune of phantom power.
     */
    expect(scoreFromStatPoints(35 * 40)).toBe(3500);
    expect(scoreFromStatPoints(35) * 40).toBe(3520);
  });

  it('rounds, so every band boundary is a whole number', () => {
    // 2.5 × an odd count lands on .5; the league table has no fractional scores.
    expect(scoreFromStatPoints(1)).toBe(3);
    expect(scoreFromStatPoints(3)).toBe(8);
    expect(Number.isInteger(scoreFromStatPoints(7))).toBe(true);
  });

  it('agrees that the starter grant is twelve complete runes', () => {
    expect(12 * scoreFromStatPoints(50)).toBe(STARTER_GRANT_SCORE);
  });
});

describe('before 010 exists', () => {
  it('reads as the starter grant for an account with no standing row at all', async () => {
    expect(await gearScore(accountId)).toBe(STARTER_GRANT_SCORE);
  });

  it('writes nothing on placement, rather than storing the placeholder', async () => {
    /**
     * **The assertion this file exists for.** Returning 1,500 is fine; *persisting*
     * it is not. A stored 1,500 is indistinguishable from a real Bronze score, so
     * the day 010 lands there would be no way to tell which rows had been computed
     * — and `gear_score` is nullable precisely to carry that distinction.
     */
    expect(await recordPlacement(accountId)).toBe(STARTER_GRANT_SCORE);

    const rows = await db()
      .select({ gearScore: playerRatings.gearScore })
      .from(playerRatings)
      .where(eq(playerRatings.accountId, accountId));

    expect(rows, 'no standing row should have been created').toHaveLength(0);
  });
});

describe('once a rune source answers', () => {
  it('computes, stores, and reads back the same number', async () => {
    install({ placedStatPoints: async () => 600 });

    const written = await recordPlacement(accountId);
    expect(written).toBe(1500); // 2.5 × 600

    // The read path is a query, not a recomputation — FR-002 puts the recompute on
    // placement. So this proves the write landed, not that the maths repeats.
    expect(await gearScore(accountId)).toBe(1500);
  });

  it('updates an existing row rather than failing on the primary key', async () => {
    install({ placedStatPoints: async () => 600 });
    await recordPlacement(accountId);

    undos.pop()!();
    install({ placedStatPoints: async () => 2000 });

    expect(await recordPlacement(accountId)).toBe(5000);
    expect(await gearScore(accountId)).toBe(5000);
  });

  it('can move a player down as well as up', async () => {
    /**
     * Runes are destroyed on replacement, and a player mid-rebuild genuinely holds
     * less power than they did. **The score follows power, not history** — which is
     * the same reason it is not cumulative. A monotonic-only implementation would
     * rate a player by the best kit they ever had.
     */
    install({ placedStatPoints: async () => 4000 });
    await recordPlacement(accountId);
    expect(await gearScore(accountId)).toBe(10_000);

    undos.pop()!();
    install({ placedStatPoints: async () => 600 });
    await recordPlacement(accountId);

    expect(await gearScore(accountId)).toBe(1500);
  });

  it('hands back an undo that really restores the previous source', async () => {
    install({ placedStatPoints: async () => 600 });
    const undo = setRuneSource({ placedStatPoints: async () => 4000 });

    expect(await recordPlacement(accountId)).toBe(10_000);
    undo();
    expect(await recordPlacement(accountId)).toBe(1500);
  });
});

describe('placed, never spent (T007)', () => {
  it('has no way to be told about shards', async () => {
    /**
     * **The naive version of this test passes for the wrong reason.** Searching the
     * source for `shardsSpent` matches the doc comment that *forbids* it — the file
     * names `shardsSpent`, `lifetimeInvestment` and `runeHistory` explicitly, to
     * explain why none exists. A grep-based ban that its own explanation satisfies
     * is a check that can never fail.
     *
     * So: strip comments first, then search. And then assert the strip did not eat
     * the file, because a regex that removed everything would also pass.
     */
    const source = await readFile(
      new URL('../../src/matchmaking/gearScore.ts', import.meta.url),
      'utf8',
    );

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block and doc comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, sparing `://`

    expect(code, 'the comment strip ate the file').toContain('export async function gearScore');
    expect(code).toContain('placedStatPoints');
    expect(code.length).toBeGreaterThan(400);

    for (const forbidden of ['shard', 'Shard', 'spent', 'Spent', 'lifetime', 'Lifetime']) {
      expect(code, `${forbidden} reaches the gear calculation`).not.toContain(forbidden);
    }
  });

  it('asks only about the present, so hoarding cannot be a sandbag', async () => {
    /**
     * `09-matchmaking.md`: *"a sandbag exists only where score and power move by
     * different amounts, and banked shards are not power until they are placed."*
     * Two players whose placed runes match must score the same however differently
     * they arrived — the source has no channel to say otherwise, and this is the
     * behavioural echo of the structural test above.
     */
    install({ placedStatPoints: async () => 1200 });
    const hoarder = await recordPlacement(accountId);

    undos.pop()!();
    install({ placedStatPoints: async () => 1200 });
    const spender = await recordPlacement(accountId);

    expect(hoarder).toBe(spender);
  });
});
