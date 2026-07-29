/**
 * A synthetic population, for the questions reasoning cannot settle (009 T004).
 *
 * `09-matchmaking.md` is explicit that **league shares, bleed behaviour and bot
 * sufficiency are population questions**. Three of 009's promises are only
 * meaningful across a crowd:
 *
 * - **A standing-still player never changes league** (US2/T020) — which needs a
 *   whole population to gear up *around* one account that does not.
 * - **The opponent mix is continuous at every league edge** (US3) — a curve, not
 *   five spot checks.
 * - **Bots are sufficient where a league is thin** (US4) — thinness is a share.
 *
 * ### It is a model, and the numbers in it are the design's own
 *
 * Nothing here is invented. `06-progression.md` *What that pace produces* gives
 * income by play level, a pass is **+100% on exactly that figure**, and a rune
 * completed through four stages costs **650** and is worth **125** of gear score.
 * From the 12-rune starter grant to a full kit of 81 is `69 × 650 = 44,850`
 * shards, which at the typical rate is 115.6 days — **3.8 months, matching the
 * document's own table.** That agreement is the check that this model is the one
 * the design describes, and `population.test.ts` asserts it rather than trusting
 * this comment.
 *
 * > **The daily curve is already inside these rates and must not be applied
 * > again.** 223 / 388 / 603 are the *tiered* figures; the same document records
 * > the untiered ones as 165 / 330 / 545. Re-applying the 1.5× on the first five
 * > victories would inflate every income by about 15% and pull the whole
 * > population a league higher.
 *
 * ### Its own generator, deliberately not the resolver's
 *
 * `packages/sim/resolver` owns the game's RNG, and it is the wrong tool here on
 * purpose: its `Seed` is leak-guarded so it cannot be printed or reconstructed,
 * `restoreSeed` is documented *"for persistence only"*, and neither is exported
 * from the package root. Bending that machinery to seed a fixture would weaken the
 * one thing it exists to protect.
 *
 * So this file carries five lines of its own. **It is not a second game
 * generator**: it is reachable only from `tests/matchmaking/`, it never touches a
 * battle, and it produces player *tenure* rather than any outcome. It is seeded
 * and therefore reproducible — a population that differed run to run would make
 * every share assertion flaky and every flake get retried instead of read.
 */

import { STARTER_GRANT_SCORE, FULL_KIT_SCORE, COMPLETE_RUNE_SCORE, leagueOf, type League } from '../../src/matchmaking/league.js';

/** Cumulative shards for a rune taken through all four stages. */
export const RUNE_COST_SHARDS = 650;

/** A pass is +100% on what play already pays, and adds nothing to a player who does not play. */
export const PASS_MULTIPLIER = 2;

export type PlayLevel = 'light' | 'typical' | 'heavy';

/** `06-progression.md` *What that pace produces* — **tiered** rates. See the header. */
export const SHARDS_PER_DAY: Readonly<Record<PlayLevel, number>> = {
  light: 223, // 10 attacks, 5 holds
  typical: 388, // 20 attacks, 10 holds
  heavy: 603, // 30 attacks, 20 holds
};

export interface SimAccount {
  readonly id: string;
  readonly playLevel: PlayLevel;
  readonly hasPass: boolean;
  /** Days since the account was created. Drives everything else. */
  tenureDays: number;
  gearScore: number;
  rating: number;
}

export interface PopulationOptions {
  readonly size?: number;
  readonly seed?: number;
  readonly meanTenureDays?: number;
  readonly passShare?: number;
  readonly playMix?: Readonly<Record<PlayLevel, number>>;
}

/**
 * **The free variable, and the only number here not taken from a document.**
 *
 * `spec.md` *Assumptions* records the expected outcome — *"Diamond at ~31% is
 * expected and correct"* — but not the tenure distribution that produced it. Every
 * other input above is the design's own, so mean tenure is what was solved for:
 * at 77 days, and with the mix below, the share of accounts that have had time to
 * reach the 8,700 Diamond floor comes out at about 31%.
 *
 * **Treat it as a calibration, not an observation.** No player has ever played this
 * game; the day real tenure is known this becomes measured and the assertion in
 * `population.test.ts` becomes a real check rather than a self-consistency one.
 */
export const DEFAULT_MEAN_TENURE_DAYS = 77;

/** `06-progression.md` prices a pass at 2× income and `spec.md` assumes 20% take it. */
export const DEFAULT_PASS_SHARE = 0.2;

/**
 * Not recorded anywhere, so stated here rather than buried: the split across play
 * levels. Weighted toward typical, which is the level every figure in
 * `06-progression.md` is quoted against.
 */
export const DEFAULT_PLAY_MIX: Readonly<Record<PlayLevel, number>> = {
  light: 0.3,
  typical: 0.5,
  heavy: 0.2,
};

/** mulberry32 — a fixture generator. See the header for why it is not the resolver's. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Gear score after `tenureDays` at a given play level.
 *
 * **Floors to whole runes**, because a part-built rune grants nothing until its
 * stage completes — a linear score would put players in leagues their power does
 * not reach. Caps at a full kit, which is the ceiling everybody shares and the
 * reason Diamond is crowded rather than exclusive.
 */
export function gearScoreFor(tenureDays: number, playLevel: PlayLevel, hasPass: boolean): number {
  const perDay = SHARDS_PER_DAY[playLevel] * (hasPass ? PASS_MULTIPLIER : 1);
  const earned = Math.max(0, tenureDays) * perDay;
  const runes = Math.floor(earned / RUNE_COST_SHARDS);

  return Math.min(FULL_KIT_SCORE, STARTER_GRANT_SCORE + runes * COMPLETE_RUNE_SCORE);
}

/** Days of play needed to reach a gear score, for the cohort described. */
export function daysToReach(score: number, playLevel: PlayLevel, hasPass: boolean): number {
  const runes = Math.ceil((score - STARTER_GRANT_SCORE) / COMPLETE_RUNE_SCORE);
  const perDay = SHARDS_PER_DAY[playLevel] * (hasPass ? PASS_MULTIPLIER : 1);

  return (runes * RUNE_COST_SHARDS) / perDay;
}

/**
 * Build a population.
 *
 * **Tenure is exponential**, by inverse transform. It is the right shape for a
 * live-service game rather than a convenient one: most accounts are recent, a thin
 * tail has been there since launch, and there is no cohort boundary — a normal
 * distribution would invent a typical age that no player base has.
 */
export function population(options: PopulationOptions = {}): SimAccount[] {
  const {
    size = 20_000,
    seed = 0x9e37_79b9,
    meanTenureDays = DEFAULT_MEAN_TENURE_DAYS,
    passShare = DEFAULT_PASS_SHARE,
    playMix = DEFAULT_PLAY_MIX,
  } = options;

  const random = generator(seed);
  const levels = Object.keys(playMix) as PlayLevel[];
  const accounts: SimAccount[] = [];

  for (let i = 0; i < size; i++) {
    // `1 - u` rather than `u`, so a draw of exactly 0 cannot produce log(0).
    const tenureDays = -meanTenureDays * Math.log(1 - random());

    let roll = random();
    let playLevel: PlayLevel = levels[levels.length - 1]!;
    for (const level of levels) {
      roll -= playMix[level];
      if (roll <= 0) {
        playLevel = level;
        break;
      }
    }

    const hasPass = random() < passShare;

    accounts.push({
      id: `sim-${i}`,
      playLevel,
      hasPass,
      tenureDays,
      gearScore: gearScoreFor(tenureDays, playLevel, hasPass),
      rating: 1000,
    });
  }

  return accounts;
}

/**
 * Move the whole population forward, **except any account named in `frozen`**.
 *
 * That exception is the entire point of T020. US2 promises a player's league
 * changes *only when they place runes*, and the only way to test it is to gear
 * everybody else up around somebody standing still. A frozen account keeps its
 * tenure as well as its score, so nothing recomputes it back.
 */
export function advance(
  accounts: SimAccount[],
  days: number,
  frozen: ReadonlySet<string> = new Set(),
): void {
  for (const account of accounts) {
    if (frozen.has(account.id)) continue;
    account.tenureDays += days;
    account.gearScore = gearScoreFor(account.tenureDays, account.playLevel, account.hasPass);
  }
}

/** Share of the population in each league, summing to 1. */
export function leagueShares(accounts: readonly SimAccount[]): Record<League, number> {
  const counts: Record<League, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
    diamond: 0,
  };

  for (const account of accounts) counts[leagueOf(account.gearScore)]++;

  const shares = { ...counts };
  for (const league of Object.keys(shares) as League[]) shares[league] /= accounts.length || 1;

  return shares;
}
