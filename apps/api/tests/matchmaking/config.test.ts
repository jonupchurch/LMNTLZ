/**
 * The constants are derived, complete, and served (009 T019 · FR-017, SC-008).
 *
 * Two different claims are tested here and only one of them is about values.
 *
 * **`GEAR_BOUND` is not a chosen number.** It is Bronze's own width, and the test
 * derives it from the band table rather than repeating `1.67`. A constant asserted
 * against itself proves nothing; asserted against the thing it summarises, it fails
 * the day somebody moves a threshold without re-deriving the promise.
 *
 * **Nothing is missing from the served object.** A constant that exists in the
 * module but is absent from `matchmakingConfig()` is a constant the client will
 * eventually hard-code, which is exactly what FR-017 exists to prevent.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { AMBUSH_CAP, AMBUSH_CAP_AT, AMBUSH_PER_WIN, ambushChance } from '../../src/squads/ambush.js';
import { LEAGUE_BANDS, STARTER_GRANT_SCORE, FULL_KIT_SCORE } from '../../src/matchmaking/league.js';
import {
  BLEED_EDGE_MIX,
  BLEED_RAMP,
  GEAR_BOUND,
  INACTIVITY_DAYS,
  WIDENED_GEAR_BOUND,
  BOT_DISTRIBUTION,
  matchmakingConfig,
} from '../../src/matchmaking/config.js';

describe('the gear bound is Bronze width, not a chosen number', () => {
  it('equals the tightest ratio any band produces', () => {
    const ratios = LEAGUE_BANDS.map((b) => b.ceiling / b.floor);
    const worst = Math.max(...ratios);

    // Bronze: 2500/1500 = 1.6667. Rounded up to two places, that is the published
    // 1.67 — and it is the worst case that exists, because Bronze is the narrowest
    // band on the lowest floor.
    expect(worst).toBeCloseTo(2500 / 1500, 10);
    expect(GEAR_BOUND).toBeGreaterThanOrEqual(worst);
    expect(GEAR_BOUND - worst, 'the bound should be Bronze width, barely rounded up').toBeLessThan(
      0.01,
    );
  });

  it('is the worst case, so every other league is kinder', () => {
    /**
     * Recorded as numbers rather than as a claim, because the *shape* matters: the
     * guarantee gets stronger as players climb, which is why nobody argues about it
     * in Diamond and everybody would in Bronze.
     */
    const byLeague = Object.fromEntries(
      LEAGUE_BANDS.map((b) => [b.league, Number((b.ceiling / b.floor).toFixed(2))]),
    );

    expect(byLeague).toEqual({
      bronze: 1.67,
      silver: 1.6,
      gold: 1.55,
      platinum: 1.4,
      diamond: 1.16,
    });
  });

  it('admits that widening breaks the promise, and by how much', () => {
    // `contracts/matchmaking-api.md`: widening reaches outside the band and can hit
    // 2.67× for a player at a league floor. The number exists so the disclosure can
    // be honest rather than vague.
    expect(WIDENED_GEAR_BOUND).toBeGreaterThan(GEAR_BOUND);
    expect(WIDENED_GEAR_BOUND).toBe(2.67);
  });
});

describe('matchmakingConfig serves everything', () => {
  const config = matchmakingConfig();

  it('carries all five bands, in order', () => {
    expect(config.leagues.map((l) => l.league)).toEqual([
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
    ]);
  });

  it('carries the gear anchors, so a client never derives a threshold', () => {
    expect(config.gearScore).toEqual({
      perStatPoint: 2.5,
      completeRune: 125,
      starterGrant: STARTER_GRANT_SCORE,
      fullKit: FULL_KIT_SCORE,
    });
  });

  it('reuses 006 ambush constants rather than restating them', () => {
    /**
     * **T017 was already implemented by feature 006** and this is the assertion
     * that keeps it that way. A second ambush formula in `matchmaking/` would be
     * two sources of truth for the single lever deciding how often anybody's
     * Hidden squad is ever seen — and the two would drift silently, because both
     * would look right in isolation.
     */
    expect(config.ambush).toEqual({ perWin: AMBUSH_PER_WIN, cap: AMBUSH_CAP, capAt: AMBUSH_CAP_AT });
    expect(config.ambush.capAt).toBe(45);
  });

  it('expresses ambush chance in percent, matching what /v1/roster already serves', () => {
    /**
     * `contracts/matchmaking-api.md` shows `0.34`; the shipped code returns `34`.
     * **Percent wins because it is already in production** and the client renders
     * it. Two representations across two endpoints is a defect waiting for somebody
     * to ask whether `0.34` is 34% or a third of one — made worse by `cap: 90`
     * sitting in the same object.
     */
    expect(ambushChance(17)).toBe(34);
    expect(config.ambush.cap).toBe(90);
  });

  it('carries the bleed shape and the inactivity window', () => {
    expect(config.bleed).toEqual({ ramp: BLEED_RAMP, edgeMix: BLEED_EDGE_MIX });
    expect(config.bleed.ramp).toBe(0.1); // pure league between 10% and 90%
    expect(config.bleed.edgeMix).toBe(0.5); // half from next door at the very edge
    expect(config.inactivityDays).toBe(INACTIVITY_DAYS);
    expect(config.inactivityDays).toBe(30);
  });

  it('carries all three measurable starter exits', () => {
    // The fourth — joining or founding a guild — is an event, not a threshold, so
    // it has no constant to serve.
    expect(config.starter).toEqual({ days: 7, shardTarget: 3250, incomeMultiplier: 1.5 });
  });
});

describe('bot allocation', () => {
  it('sums to the whole pool and leaves Diamond out', () => {
    /**
     * Diamond takes no share because `spec.md` US4 requires its bots be
     * **hand-seeded only** — *"bots that were written, never bots that were
     * needed"*. A Diamond entry here would eventually get padded automatically,
     * which is the exact thing that requirement forbids.
     */
    const total = Object.values(BOT_DISTRIBUTION).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);

    expect(Object.keys(BOT_DISTRIBUTION)).not.toContain('diamond');
    expect(BOT_DISTRIBUTION['starter']).toBe(0.3);
  });
});

describe('the client holds none of these numbers (SC-008)', () => {
  it('does not hard-code a league threshold anywhere in apps/client/src', async () => {
    /**
     * The mechanical half of FR-017, and written the way this project has learned
     * to write it: **strip comments first, then search, then prove the strip did
     * not eat the file.** A scan for a forbidden literal otherwise matches the
     * comment explaining the ban and can never fail.
     *
     * Scoped to the four thresholds that would silently misplace a player. `1500`
     * is deliberately excluded — it is also the starter grant and appears in
     * unrelated arithmetic — and `2.5` is far too common a literal to ban.
     */
    const { readdir } = await import('node:fs/promises');
    const root = new URL('../../../client/src/', import.meta.url);

    const files: URL[] = [];
    const walk = async (dir: URL): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) await walk(child);
        else if (/\.tsx?$/.test(entry.name)) files.push(child);
      }
    };
    await walk(root);

    expect(files.length, 'found no client sources — the path is wrong').toBeGreaterThan(10);

    let survivingCode = 0;
    let sawAnExport = false;

    for (const file of files) {
      const stripped = (await readFile(file, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      survivingCode += stripped.length;
      if (stripped.includes('export')) sawAnExport = true;

      for (const threshold of ['2500', '4000', '6200', '8700', '10125', '10_125']) {
        expect(stripped, `${file.pathname} hard-codes the threshold ${threshold}`).not.toContain(
          threshold,
        );
      }
    }

    /**
     * **Both halves of the lesson, and the second one is the one I keep skipping.**
     * Counting files proves the walk found something; it does not prove the *strip*
     * left anything to search. A regex that returned `''` for every file would sail
     * through every assertion above — the loop would run and find nothing, exactly
     * as it does when the code is clean.
     */
    expect(survivingCode, 'the comment strip ate the client').toBeGreaterThan(20_000);
    expect(sawAnExport, 'no file survived the strip with code in it').toBe(true);
  });
});
