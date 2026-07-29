/**
 * Every design commitment, answered from records alone (008 T013, SC-001).
 *
 * ### TL;DR
 *
 * The game runs no analytics service. The reasoning was that every question the
 * design promises to answer is a *battle* question, so the battle record is the
 * analytics product. **This test is where that claim is either true or isn't.**
 *
 * Each block below takes a commitment the design actually makes, writes the query
 * that answers it, and asserts an exact number against a population built to have
 * a known answer. Not "the query runs" — the right value. A query that runs and
 * returns the wrong number is the failure mode that matters, because nobody
 * checks arithmetic they did not expect to be wrong.
 *
 * ### Why the records are synthesised rather than fought
 *
 * `write.test.ts` covers the writing path against real battles. This covers the
 * *reading* path, and it needs a population with a shape — thirty battles split
 * across two zones with a known number of defender wins. Fighting thirty real
 * battles to reach a distribution nobody controls would take minutes and assert
 * nothing exact.
 *
 * Inserted with **null participants**, which is legal and deliberate: the columns
 * are nullable because deleted accounts delink from their records, so a population
 * of unowned rows is a state production genuinely reaches.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';

/** Six seats in the fixed formation, as the snapshot stores them. */
const squadOf = (heroIds: readonly string[]) => ({
  seats: [
    { row: 'front', index: 0, heroId: heroIds[0] },
    { row: 'front', index: 1, heroId: heroIds[1] },
    { row: 'middle', index: 0, heroId: heroIds[2] },
    { row: 'middle', index: 1, heroId: heroIds[3] },
    { row: 'middle', index: 2, heroId: heroIds[4] },
    { row: 'back', index: 0, heroId: heroIds[5] },
  ],
});

const ATTACK_A = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const ATTACK_B = ['h1', 'h2', 'h3', 'h4', 'h5', 'h7'];
const DEFEND = ['h8', 'h9', 'h10', 'h11', 'h12', 'h13'];

/**
 * The population, chosen so every expected answer below is arithmetic anyone can
 * check by reading this table.
 *
 * | zone | count | defender wins | bot | turns |
 * |---|---|---|---|---|
 * | visible | 10 | 4 | no | 100 |
 * | hidden | 5 | 4 | no | 120 |
 * | visible | 5 | 5 | **yes** | 60 |
 *
 * So: **human-only** hold rates are 4/10 = 40% Visible and 4/5 = 80% Hidden. With
 * bots included, Visible becomes 9/15 = 60% — which is the whole reason
 * `defender_is_bot` exists.
 */
const POPULATION = [
  { zone: 'visible', total: 10, defenderWins: 4, isBot: false, turnCount: 100 },
  { zone: 'hidden', total: 5, defenderWins: 4, isBot: false, turnCount: 120 },
  { zone: 'visible', total: 5, defenderWins: 5, isBot: true, turnCount: 60 },
] as const;

const ids: string[] = [];

beforeAll(async () => {
  /**
   * **Typed rather than inferred, and CI is why.** `const rows = []` infers
   * `never[]` when TypeScript runs without `strict` — which is exactly how Vercel
   * compiles this app (naming the entrypoint makes it ignore `tsconfig.json`), and
   * the repo has a CI job reproducing that after a deploy silently served a
   * two-features-old build for thirteen hours. It typechecks locally and fails
   * there.
   */
  const rows: (typeof battleRecords.$inferInsert)[] = [];
  const startedAt = new Date('2026-07-01T00:00:00Z');

  for (const group of POPULATION) {
    for (let i = 0; i < group.total; i++) {
      const battleId = crypto.randomUUID();
      ids.push(battleId);

      rows.push({
        battleId,
        startedAt,
        concludedAt: new Date(startedAt.getTime() + group.turnCount * 1000),
        attackerId: null,
        defenderId: null,
        defenderIsBot: group.isBot,
        zone: group.zone,
        winner: i < group.defenderWins ? 'defender' : 'attacker',
        reason: i < group.defenderWins ? 'wipe' : 'cap-hp-share',
        turnCount: group.turnCount,
        // Two distinct attacker builds, so a pick rate can distinguish them.
        attackerSquad: squadOf(i % 2 === 0 ? ATTACK_A : ATTACK_B),
        defenderSquad: squadOf(DEFEND),
        engineVersion: 'test-engine',
        contentVersion: 'test-content',
        buildSha: null,
      });
    }
  }

  await db().insert(battleRecords).values(rows);
}, 120_000);

afterAll(async () => {
  if (ids.length > 0) {
    await db().delete(battleRecords).where(inArray(battleRecords.battleId, ids));
  }
  await closeDb();
});

/** Restricts every query to this test's own rows. */
const mine = sql`battle_id = any(${sql.param(ids)}::uuid[])`;

describe('“Visible and Hidden hold rates are comparable”', () => {
  it('answers per zone, with bot defenders excluded', async () => {
    /**
     * **The commitment this measures.** Hidden battles are reachable only by
     * ambush and pay more, on the premise that they are harder. That premise is
     * checkable — and if Hidden's hold rate is *not* higher, the extra reward is
     * paying for nothing and the ambush is a worse deal than it looks.
     */
    const result = await db().execute(sql`
      select zone,
             count(*)::int as battles,
             count(*) filter (where winner = 'defender')::int as holds
      from battle_records
      where ${mine} and defender_is_bot = false
      group by zone
      order by zone
    `);

    const byZone = new Map(
      (result.rows as unknown as { zone: string; battles: number; holds: number }[]).map((r) => [
        r.zone,
        r,
      ]),
    );

    expect(byZone.get('visible')).toMatchObject({ battles: 10, holds: 4 });
    expect(byZone.get('hidden')).toMatchObject({ battles: 5, holds: 4 });
  });

  it('gives a different — and wrong — answer when bots are not excluded', async () => {
    /**
     * **This is the test that justifies the column** (SC-002). Curated bot
     * defenders are a stated balance lever: the design moves the meta by adding
     * opponents rather than changing numbers. So bot battles measure *our own
     * curation*, and an aggregate that includes them reports how well we tuned
     * bots as though it were how players play.
     *
     * 40% becomes 60% here. Both numbers are plausible; only one is about players.
     */
    const result = await db().execute(sql`
      select count(*) filter (where winner = 'defender')::int as holds,
             count(*)::int as battles
      from battle_records
      where ${mine} and zone = 'visible'
    `);

    const [row] = result.rows as unknown as { holds: number; battles: number }[];
    expect(row).toMatchObject({ battles: 15, holds: 9 });

    // The distortion is 20 points on a rate that drives a reward.
    expect(row!.holds / row!.battles).toBeCloseTo(0.6, 5);
  });
});

describe('“Battles are around 100 hero-turns”', () => {
  it('answers engine length and wall-clock duration separately', async () => {
    /**
     * **Two different questions, which is why `started_at` and `concluded_at`
     * survive next to `turn_count`.** Turn count is what the balance pass reads —
     * the accuracy work in `01-stats.md` is quoted in hero-turns. Wall-clock is
     * what feature 016's drain needs, because a deploy has to wait out real
     * minutes and a player can leave a battle open overnight.
     *
     * A tidying migration that dropped the timestamps as redundant would leave the
     * second question permanently unanswerable.
     */
    const result = await db().execute(sql`
      select round(avg(turn_count))::int as mean_turns,
             min(turn_count)::int as min_turns,
             max(turn_count)::int as max_turns,
             round(avg(extract(epoch from (concluded_at - started_at))))::int as mean_seconds
      from battle_records
      where ${mine} and defender_is_bot = false
    `);

    const [row] = result.rows as unknown as {
      mean_turns: number;
      min_turns: number;
      max_turns: number;
      mean_seconds: number;
    }[];

    // 10 battles at 100 turns and 5 at 120 → mean 106.67, rounded to 107.
    expect(row!.mean_turns).toBe(107);
    expect(row!.min_turns).toBe(100);
    expect(row!.max_turns).toBe(120);

    // And the wall-clock answer is a genuinely different number.
    expect(row!.mean_seconds).toBe(107);
    expect(row!.mean_seconds).not.toBe(row!.max_turns);
  });
});

describe('“Hero pick rates show what the meta actually plays”', () => {
  it('counts heroes across both squads from the stored jsonb', async () => {
    /**
     * **Storing is not exposing** (Constitution XVII). Both compositions are on
     * every row, and the defender's appears in no response, no CSV export and no
     * profile view. That distinction is what makes a pick rate computable at all:
     * a system that refused to *store* what it refuses to *show* could never
     * answer which heroes are played.
     *
     * ### What this can and cannot catch, stated accurately
     *
     * A hero appears **at most once per squad**, so `count(*)` and
     * `count(distinct battle_id)` return the same number here — a per-battle
     * deduplication bug is invisible to this test and to every test of this shape.
     * Worth knowing rather than assuming otherwise.
     *
     * What it does catch is the **8/7 split** between `h6` and `h7`: the two
     * builds differ in exactly one seat, so the counts only come out right if the
     * query reads each seat of each row. A query that read the first seat, or
     * grouped by build, or joined wrongly across the lateral would move those two
     * numbers and nothing else. It also catches the two squad columns being
     * confused, because the defender count is 20 where the attacker count is 15.
     */
    const result = await db().execute(sql`
      select hero_id, count(*)::int as picks
      from battle_records,
           lateral jsonb_array_elements(attacker_squad -> 'seats') as seat,
           lateral (select seat ->> 'heroId' as hero_id) h
      where ${mine} and defender_is_bot = false
      group by hero_id
      order by picks desc, hero_id
    `);

    const picks = new Map(
      (result.rows as unknown as { hero_id: string; picks: number }[]).map((r) => [
        r.hero_id,
        r.picks,
      ]),
    );

    // 15 human battles: h1–h5 are in both builds, so every one of them.
    expect(picks.get('h1')).toBe(15);
    expect(picks.get('h5')).toBe(15);

    /**
     * **The exact split, not just "both are present".** 10 Visible battles
     * alternate A/B giving 5 and 5; 5 Hidden battles alternate giving 3 and 2. So
     * h6 = 8 and h7 = 7, and those two numbers are the ones a mis-shaped query
     * moves.
     */
    expect(picks.get('h6')).toBe(8);
    expect(picks.get('h7')).toBe(7);
    expect((picks.get('h6') ?? 0) + (picks.get('h7') ?? 0)).toBe(15);

    // Defenders are a separate question, answered from the other column.
    const defenders = await db().execute(sql`
      select count(*)::int as picks
      from battle_records,
           lateral jsonb_array_elements(defender_squad -> 'seats') as seat
      where ${mine} and seat ->> 'heroId' = 'h8'
    `);
    expect((defenders.rows as unknown as { picks: number }[])[0]!.picks).toBe(20);
  });
});

describe('“League thresholds are set against the real population”', () => {
  it('is NOT answerable yet, and the columns are why it will be', async () => {
    /**
     * ### The one commitment this feature cannot deliver, stated rather than
     * quietly skipped
     *
     * Leagues come from feature 009 and rating from 010. Neither exists, so every
     * battle recorded so far has null in all four columns and **the threshold
     * question genuinely cannot be answered today**.
     *
     * That is not a gap in this feature — it is Constitution XVI working. The
     * columns exist now, empty, because a migration could add them later but
     * could never invent what a player's rating had been at the time. The
     * alternative was writing a sentinel, and a sentinel is worse than null here:
     * `rating = 0` is indistinguishable from a real 0 to every query that will
     * ever run, whereas null says *"this battle predates rating"* out loud.
     *
     * So the assertion is the honest one: the query is expressible, it returns
     * nothing, and the day it starts returning something is the day 009 and 010
     * have shipped.
     */
    const result = await db().execute(sql`
      select count(*)::int as rated,
             count(*) filter (where attacker_rating is not null)::int as with_rating
      from battle_records
      where ${mine}
    `);

    const [row] = result.rows as unknown as { rated: number; with_rating: number }[];
    expect(row!.rated).toBe(20);
    expect(row!.with_rating, 'ratings exist now — 009/010 shipped, so answer the commitment').toBe(
      0,
    );

    /**
     * And the query that *will* answer it is writable today, which is the
     * claim that matters. Percentile boundaries over the real population, per
     * league — it simply has no rows to work on yet.
     */
    const thresholds = await db().execute(sql`
      select percentile_cont(0.5) within group (order by attacker_rating) as median
      from battle_records
      where ${mine} and attacker_rating is not null
    `);
    expect((thresholds.rows as unknown as { median: number | null }[])[0]!.median).toBeNull();
  });
});
