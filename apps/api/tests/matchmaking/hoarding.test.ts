/**
 * **Hoarding shards produces no matchmaking advantage** (009 T021 · SC-009, FR-002).
 *
 * `09-matchmaking.md` answers the sandbag question without a rule: *"a sandbag exists
 * only where score and power move by different amounts, and banked shards are not
 * power until they are placed."* A player sitting on a fortune is genuinely as weak
 * as their placed runes say, so there is nothing to police.
 *
 * That only holds if two things are true, and this file checks both.
 *
 * **Banking moves nothing.** Not the score, not the league, not the position in the
 * band that will drive who they fight. And the hoard used here is deliberately large
 * enough to change league if it were placed — a test that banked pocket change would
 * pass whether the rule existed or not.
 *
 * **Placing moves everything, on the next read.** FR-002 puts the recompute *"on
 * placement, immediately — not on request"*, so there is no window where a player has
 * the power and not the league. The pair matters: a system that ignored banked shards
 * *and* took a nightly job to notice placed ones would satisfy the first half and
 * hand out a real sandbag anyway.
 *
 * ### Where the wallet is
 *
 * Nowhere. There is no shard balance in the schema at all — 010 owns the economy —
 * so the hoard below is a local variable, and that is the honest shape of the
 * guarantee rather than a shortcut. **The system has no place to put a balance and
 * no path from one to a score**, which the last block asserts against the source of
 * every file on the scoring path.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inArray } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { COMPLETE_RUNE_SCORE, STARTER_GRANT_SCORE, leagueOf } from '../../src/matchmaking/league.js';
import { recordPlacement, setRuneSource } from '../../src/matchmaking/gearScore.js';
import { standing } from '../../src/matchmaking/standing.js';
import { candidates } from '../../src/matchmaking/candidates.js';
import { RUNE_COST_SHARDS } from './population.js';

const SUFFIX = `test-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
const created: string[] = [];
let hoarder: string;
let spender: string;
const undos: Array<() => void> = [];

/** Ten complete runes. Chosen because it crosses a league boundary — see below. */
const HOARD_SHARDS = 10 * RUNE_COST_SHARDS;

/** Stat points behind one complete rune: `20 + 10 + 5 + 15`. */
const POINTS_PER_RUNE = 50;

const makeAccount = async (label: string): Promise<string> => {
  const [row] = await db()
    .insert(accounts)
    .values({ username: `${label} ${SUFFIX}`, usernameKey: `${label.toLowerCase()}-${SUFFIX}` })
    .returning();
  created.push(row!.id);
  return row!.id;
};

beforeAll(async () => {
  hoarder = await makeAccount('Hoarder');
  spender = await makeAccount('Spender');
}, 120_000);

afterEach(() => {
  while (undos.length) undos.pop()!();
});

afterAll(async () => {
  if (created.length) await db().delete(accounts).where(inArray(accounts.id, created)); // cascades
  await closeDb();
});

const install = (placedRunes: number): void => {
  undos.push(setRuneSource({ placedStatPoints: async () => placedRunes * POINTS_PER_RUNE }));
};

/**
 * What matchmaking says about *this* player, with the population-dependent parts dropped.
 *
 * The list is every eligible defender in the database, so other suites creating accounts
 * in parallel would move it — a comparison including it would be a flake, and a flake
 * gets retried rather than read. The claim under test is about the player's own standing
 * anyway.
 *
 * **`widened` goes for the same reason, one level up, and it was missed the first time.**
 * It is a fact about how many opponents exist right now, not about this player's gear:
 * Phase 7 made it true when a band holds fewer than `MIN_POOL` defenders, and this loop
 * runs seventeen times while other suites create and delete accounts around it. It
 * flipped mid-loop and failed the comparison on correct code.
 *
 * Worth recording that **the spread-and-delete design is what surfaced it.** Naming the
 * fields to compare would have quietly gone on ignoring `widened` forever; comparing
 * everything by default meant a new field arrived in the assertion the day it was added,
 * and had to be reasoned about rather than overlooked.
 */
const ownFields = async (accountId: string): Promise<Record<string, unknown>> => {
  // Spread-and-delete rather than naming the fields, so a field added to the
  // response next year is compared without anybody remembering to add it here.
  const mine: Record<string, unknown> = { ...(await candidates(accountId)) };
  delete mine['candidates'];
  delete mine['widened'];
  return mine;
};

describe('the hoard is large enough to matter', () => {
  it('would cross a league boundary if it were placed', () => {
    /**
     * **The non-vacuity check, first, because everything below depends on it.** Ten
     * complete runes is 6,500 shards and 1,250 of gear score. On top of the 1,500
     * starter grant that is 2,750 — which is **Silver**, not Bronze. So when the next
     * test says the answer did not move, the answer had somewhere to move to.
     */
    expect(HOARD_SHARDS).toBe(6_500);

    const banked = 10 * COMPLETE_RUNE_SCORE;
    expect(banked).toBe(1_250);
    expect(leagueOf(STARTER_GRANT_SCORE)).toBe('bronze');
    expect(leagueOf(STARTER_GRANT_SCORE + banked)).toBe('silver');
  });
});

describe('banking produces no matchmaking movement (SC-009)', () => {
  it('answers identically after seventeen days of income nobody spent', async () => {
    install(12); // the starter grant, and nothing since
    await recordPlacement(hoarder); // state set here, never inherited from another test

    const before = await ownFields(hoarder);
    expect(before.league).toBe('bronze');
    expect(before.gearScore).toBe(STARTER_GRANT_SCORE);

    /**
     * `06-progression.md` pays a typical player 388 shards a day, so 6,500 takes
     * about seventeen. The loop is here rather than a single jump because the wallet
     * growing is exactly the thing that must not be visible — and it is visible
     * nowhere, which is why the loop can only add up in this test's own variable.
     */
    let wallet = 0;
    for (let day = 1; day <= 17; day++) {
      wallet += 388;

      const now = await ownFields(hoarder);
      expect(
        now,
        `matchmaking moved on day ${day}, with ${wallet} shards banked and nothing placed`,
      ).toEqual(before);
    }

    expect(wallet).toBeGreaterThan(HOARD_SHARDS);
  });

  it('gives two players with the same placed runes the same standing, however they got there', async () => {
    /**
     * The behavioural form of *placed, never spent*. One player banked and then
     * placed; the other placed as they earned. Nothing in the system can tell them
     * apart, and that indistinguishability **is** the anti-sandbag rule — there is no
     * separate check to write.
     */
    install(22);
    await recordPlacement(hoarder);
    await recordPlacement(spender);

    const a = await standing(hoarder);
    const b = await standing(spender);

    expect(a.gearScore).toBe(b.gearScore);
    expect(a.league).toBe(b.league);
    expect(a.positionInLeague).toBe(b.positionInLeague);
  });
});

describe('placing moves everything, on the next read (FR-002)', () => {
  it('promotes on the very next request, with no job in between', async () => {
    /**
     * **The half that makes the other half safe.** If the recompute were deferred to
     * a nightly pass, a player could place ten runes and spend the evening matched as
     * a Bronze account — a real sandbag, produced by the schedule rather than by the
     * player. So: one write, and the next read already answers Silver.
     */
    install(12);
    await recordPlacement(hoarder);
    const bronze = await ownFields(hoarder);
    expect(bronze.league).toBe('bronze');
    expect(bronze.gearScore).toBe(STARTER_GRANT_SCORE);

    undos.pop()!();
    install(22); // the twelve granted, plus the ten that were banked
    await recordPlacement(hoarder);

    const silver = await ownFields(hoarder);
    expect(silver.league).toBe('silver');
    expect(silver.gearScore).toBe(STARTER_GRANT_SCORE + 10 * COMPLETE_RUNE_SCORE);
    expect(silver.positionInLeague).not.toBe(bronze.positionInLeague);
  });

  it('moves the position in band on a placement too small to change league', async () => {
    /**
     * The finer-grained version, because a league is a coarse instrument. Two runes is
     * 250 of score, which is a quarter of the Bronze band and therefore a real change
     * in who this player is offered once bleed lands — but the same league name. A
     * recompute that only ran on a boundary crossing would pass the test above and
     * fail this one.
     */
    install(12);
    await recordPlacement(hoarder);
    const before = await standing(hoarder);

    undos.pop()!();
    install(14);
    await recordPlacement(hoarder);
    const after = await standing(hoarder);

    expect(after.league).toBe(before.league);
    expect(after.gearScore).toBe(before.gearScore + 2 * COMPLETE_RUNE_SCORE);
    expect(after.positionInLeague).toBeGreaterThan(before.positionInLeague);
  });
});

describe('there is no path from a balance to a score, structurally', () => {
  /** Every file that participates in deciding a player's league. */
  const SCORING_PATH = ['league.ts', 'gearScore.ts', 'standing.ts', 'candidates.ts'];

  const stripped = async (file: string): Promise<string> => {
    const source = await readFile(
      new URL(`../../src/matchmaking/${file}`, import.meta.url),
      'utf8',
    );
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block and doc comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, sparing `://`
  };

  it('mentions no shard, wallet or balance anywhere on the scoring path', async () => {
    /**
     * **Comments stripped first, and the strip proved.** Three of these four files
     * *discuss* shards at length — `gearScore.ts` names `shardsSpent`,
     * `lifetimeInvestment` and `runeHistory` explicitly in order to explain why none
     * of them exists. A search that its own explanation satisfies can never fail.
     *
     * `gearScore.test.ts` runs this over one file; the whole path is the broader
     * claim, and it is the one that catches the *next* file somebody adds.
     */
    for (const file of SCORING_PATH) {
      const code = await stripped(file);

      expect(code.length, `the comment strip ate ${file}`).toBeGreaterThan(300);
      expect(code, `${file} lost its exports to the strip`).toContain('export');

      for (const forbidden of ['shard', 'Shard', 'wallet', 'Wallet', 'balance', 'Balance']) {
        expect(code, `${forbidden} reaches the scoring path in ${file}`).not.toContain(forbidden);
      }
    }
  });

  it('leaves the one legitimate shard constant outside the scoring path', async () => {
    /**
     * **`config.ts` is the exception, and it is a real one rather than a hole.**
     * `STARTER_SHARD_TARGET` is 3,250 — one of the starter league's four exits, a
     * *threshold* that is published to the client and never a score. So the ban above
     * cannot simply cover the whole directory; it has to distinguish a file that
     * scores players from a file that serves constants.
     *
     * The distinction has to be checked rather than trusted, so: the constant exists
     * in `config.ts`, and no file that decides a league imports it. If it ever
     * arrives on the scoring path, this fails and names the file.
     *
     * **And this assertion is not redundant with the word ban above**, which was the
     * obvious objection to writing it. Importing `STARTER_SHARD_TARGET` into
     * `standing.ts` was applied as a mutant, and the ban did not catch it: the
     * forbidden strings are `shard` and `Shard`, and a SCREAMING_CASE constant
     * contains neither. Only this test failed.
     */
    const config = await stripped('config.ts');
    expect(config, 'the starter shard target moved out of config.ts').toContain(
      'STARTER_SHARD_TARGET',
    );

    for (const file of SCORING_PATH) {
      const code = await stripped(file);
      expect(code, `${file} imports the starter shard target`).not.toContain(
        'STARTER_SHARD_TARGET',
      );
    }
  });

  it('has no column to hoard into, and that is the strongest form of it', async () => {
    /**
     * A balance cannot reach the score because the database has nowhere to keep one.
     * Asserted against the schema directory rather than `information_schema`, because
     * the claim is about what 009 built: **010 will add a balance, and when it does
     * this test should fail and be rewritten as an import check** rather than quietly
     * keep passing on a stale assumption.
     */
    const source = await readFile(
      new URL('../../src/db/schema/ratings.ts', import.meta.url),
      'utf8',
    );
    const ratings = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(ratings, 'the comment strip ate ratings.ts').toContain('playerRatings');
    expect(ratings).toContain('gear_score');

    for (const forbidden of ['shard', 'Shard', 'balance', 'Balance', 'currency']) {
      expect(ratings, `player_ratings gained a ${forbidden} column`).not.toContain(forbidden);
    }
  });
});
