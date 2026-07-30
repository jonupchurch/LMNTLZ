/**
 * The starter-exit warning — **the part the design says has been lost three times**
 * (009 T026, T033 · FR-023).
 *
 * > *"A shared constant STRING is not enough — three screen regenerations have proved a
 * > string can be dropped."*
 *
 * So this file does not test copy. **It tests that the copy cannot be omitted**, which
 * is a claim about types rather than about behaviour, and it is checked the only way a
 * type claim can be: with `@ts-expect-error`, which fails the build when the code it
 * marks turns out to compile. `pnpm typecheck` is therefore part of this test, and a
 * green Vitest run alone does not prove the assertions below.
 *
 * ### No database, deliberately
 *
 * `starterLeagueOpen()` asks a global question, so a starter bot created here would
 * silently break `starter.test.ts`'s *"before any bot is authored"* block while both
 * files ran in parallel. That block is what keeps a live deploy safe between Phase 5
 * and Phase 7, so it gets to own the only bot in the suite. Everything here is a type,
 * a constant, or arithmetic — which is what T026 asked for anyway: *"assert on the
 * confirm's constructed payload, not on rendered copy."*
 */

import { describe, expect, it } from 'vitest';
import {
  GUILD_DOORS,
  REQUIRED_ACKNOWLEDGEMENTS,
  STARTER_EXIT_WARNING,
  type GuildDoorConfirm,
  type StarterExitWarning,
} from '../../src/matchmaking/starterLeague.js';
import {
  STARTER_DAYS,
  STARTER_INCOME_MULTIPLIER,
  STARTER_SHARD_TARGET,
} from '../../src/matchmaking/config.js';
import { SHARDS_PER_DAY, type PlayLevel } from './population.js';

describe('the confirm type forbids an unwarned confirm (T026, T033)', () => {
  it('will not compile without the warning field', () => {
    /**
     * **This is the assertion, and it lives in the type checker rather than here.** Each
     * `@ts-expect-error` below fails `tsc` if the line it marks *stops* being an error —
     * which is exactly what would happen if `starterWarning` became optional. A runtime
     * test cannot express that: at runtime a dropped field is simply `undefined`, and
     * `undefined` is what a warning nobody showed looks like.
     */

    // @ts-expect-error — `starterWarning` is required: a confirm cannot omit it.
    const unwarned: GuildDoorConfirm = { door: 'application', guildId: 'g-1' };

    // @ts-expect-error — nor can the invitation door.
    const unwarnedInvite: GuildDoorConfirm = { door: 'invitation', guildId: 'g-1' };

    // @ts-expect-error — nor founding, which is the door easiest to forget.
    const unwarnedFounding: GuildDoorConfirm = { door: 'founding', guildId: null };

    // Referenced so the declarations are not dead code; the compiler already ruled.
    expect([unwarned, unwarnedInvite, unwarnedFounding]).toHaveLength(3);
  });

  it('accepts `null` as a written decision, but not as an omission', () => {
    /**
     * A player already out of the starter league has nothing to lose, so `null` is a
     * legitimate value — and it is **required to be written**. That is the whole
     * distinction: a field that must be supplied can be `null`; a field that may be
     * absent gets forgotten. The regenerated screens forgot.
     */
    const graduated: GuildDoorConfirm = {
      door: 'invitation',
      guildId: 'g-1',
      starterWarning: null,
    };

    const starter: GuildDoorConfirm = {
      door: 'invitation',
      guildId: 'g-1',
      starterWarning: STARTER_EXIT_WARNING,
    };

    expect(graduated.starterWarning).toBeNull();
    expect(starter.starterWarning).toBe(STARTER_EXIT_WARNING);
  });

  it('will not accept a warning that warns about nothing', () => {
    /**
     * The three fields are literal `true`, not `boolean`. With `boolean` a caller could
     * satisfy the compiler while telling the player their income is safe — a warning
     * that is present and wrong, which is worse than one that is absent because it
     * survives review.
     */

    const lying: StarterExitWarning = {
      endsBotOpponents: true,
      // @ts-expect-error — `false` is not assignable to `true`.
      endsIncomeMultiplier: false,
      permanent: true,
    };

    expect(lying).toBeTruthy();
  });
});

describe('both losses are named, because they are different losses', () => {
  it('carries beginner status and the beginner bonus separately', () => {
    /**
     * *"A player told only 'you'll leave the starter league' has not been told their
     * income drops."* Beginner **status** is the authored pool; the beginner **bonus** is
     * the ×1.5. Set equality on the keys, so a fourth loss added later cannot be
     * silently absent from a payload that still passes.
     */
    expect(Object.keys(STARTER_EXIT_WARNING).sort()).toEqual([
      'endsBotOpponents',
      'endsIncomeMultiplier',
      'permanent',
    ]);

    expect(STARTER_EXIT_WARNING.endsBotOpponents).toBe(true);
    expect(STARTER_EXIT_WARNING.endsIncomeMultiplier).toBe(true);
    expect(STARTER_EXIT_WARNING.permanent).toBe(true);
  });

  it('asks the exit route to acknowledge exactly those two, by name', () => {
    // Two acknowledgements for two losses, and they are wire names rather than a count
    // — a count is satisfied by sending one of them twice.
    expect(REQUIRED_ACKNOWLEDGEMENTS).toEqual(['bot-opponents-end', 'income-multiplier-ends']);
    expect(new Set(REQUIRED_ACKNOWLEDGEMENTS).size).toBe(
      Object.keys(STARTER_EXIT_WARNING).length - 1,
    );
  });

  it('covers every door a player could cross on, in either direction', () => {
    /**
     * **Three doors for two exits, and the extra one is the point.** The *exit* fires on
     * accepting an invitation or founding a guild. The *warning* must also appear on
     * **applying**, because a player who applies and is admitted a day later would
     * otherwise be graduated by somebody else's click.
     */
    expect([...GUILD_DOORS].sort()).toEqual(['application', 'founding', 'invitation']);
    expect(GUILD_DOORS).toContain('application');
  });
});

describe('the 1.5x is not oversold', () => {
  /**
   * > **Do not oversell the ×1.5 in the copy.** *"It replaces dormant hold income —
   * > nothing attacks a starter player's defense, and holds are ~26% of a typical day.
   * > Only ~11% is help."*
   *
   * The multiplier and the help are two different numbers, and a warning that quotes the
   * first as though it were the second misprices every figure downstream. So the
   * published table is pinned here: if anybody restates this as a 50% head start, the
   * arithmetic disagrees with them in a test.
   */
  const PUBLISHED: ReadonlyArray<{ level: PlayLevel; normal: number; starter: number }> = [
    { level: 'light', normal: 223, starter: 248 },
    { level: 'typical', normal: 388, starter: 432 },
    { level: 'heavy', normal: 603, starter: 675 },
  ];

  it('nets about 11% across every play level, not 50%', () => {
    for (const row of PUBLISHED) {
      expect(row.normal, `${row.level} drifted from the harness`).toBe(SHARDS_PER_DAY[row.level]);

      const net = row.starter / row.normal;
      expect(net, `${row.level}: ${row.normal} → ${row.starter} is ${net.toFixed(3)}x`).toBeLessThan(
        1.13,
      );
      expect(net).toBeGreaterThan(1.1);
    }
  });

  it('is 1.35 of the 1.5 replacing income that was removed', () => {
    /**
     * Where the 11% comes from, so the claim is derived rather than quoted. A starter
     * player's defense is dormant, so holds — 100 of a typical 388 — are gone. The
     * multiplier applies to what is left.
     */
    const typical = 388;
    const holds = 100;
    const attackIncome = typical - holds;

    expect(holds / typical).toBeCloseTo(0.26, 2);
    expect(attackIncome * STARTER_INCOME_MULTIPLIER).toBe(432);
    expect((attackIncome * STARTER_INCOME_MULTIPLIER) / typical).toBeCloseTo(1.113, 3);

    // The multiplier is 1.5. The help is 11 points. Both true, and not the same number.
    expect(STARTER_INCOME_MULTIPLIER).toBe(1.5);
  });

  it('sizes the shard exit so a heavy player leaves before the week ends', () => {
    /**
     * The two exits fire for different players, which is why both are needed:
     * *"time protects the slow player; the shard cap stops the fast one over-farming an
     * authored pool."* Computed from the boosted rates, since that is what a starter
     * actually earns.
     */
    const daysToTarget = (level: PlayLevel) =>
      STARTER_SHARD_TARGET / (SHARDS_PER_DAY[level] * STARTER_INCOME_MULTIPLIER * (1 - 100 / 388));

    // Heavy leaves on shards, comfortably inside the week.
    expect(daysToTarget('heavy')).toBeLessThan(STARTER_DAYS);
    // Light never gets there, so time is what protects them.
    expect(daysToTarget('light')).toBeGreaterThan(STARTER_DAYS);
    // Typical exits on time, "barely" — which is the doc's own word for 7.5 days.
    expect(daysToTarget('typical')).toBeGreaterThan(STARTER_DAYS);
    expect(daysToTarget('typical')).toBeLessThan(STARTER_DAYS + 1);
  });

  it('reproduces the published days-to-3,250 table exactly', () => {
    /**
     * `09-matchmaking.md` *Two exits, and why both are needed* publishes 13.1 / 7.5 / 4.8
     * days, derived independently of this code. All three come out inside a tenth of a
     * day — which is agreement rather than coincidence, and it is the check that the
     * ×1.5, the 26% hold share and the 3,250 target are the design's own numbers rather
     * than three that happen to look plausible together.
     */
    const PUBLISHED_DAYS: ReadonlyArray<[PlayLevel, number]> = [
      ['light', 13.1],
      ['typical', 7.5],
      ['heavy', 4.8],
    ];

    for (const [level, published] of PUBLISHED_DAYS) {
      const modelled =
        STARTER_SHARD_TARGET / (SHARDS_PER_DAY[level] * STARTER_INCOME_MULTIPLIER * (1 - 100 / 388));

      expect(
        Math.abs(modelled - published),
        `${level}: modelled ${modelled.toFixed(2)} days vs published ${published}`,
      ).toBeLessThan(0.1);
    }
  });
});
