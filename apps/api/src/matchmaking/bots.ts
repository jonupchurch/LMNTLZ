/**
 * How many bots there are, where they sit, and what they are rated
 * (009 T044 · T048 · FR-015, FR-016, FR-017).
 *
 * Pure arithmetic over the shares already published in `config.ts`. No database, no
 * content — seeding reads this to decide what to create, and the tests read it to
 * check the published table.
 *
 * ### Two of the three numbers here are derived; the shares are the only authored ones
 *
 * `09-matchmaking.md` settles the **distribution** (30% starter · 20/20/20/10 ·
 * Diamond hand-seeded only) and then leaves the absolute total under a heading
 * literally called *Open*: *"the absolute count is a launch-tuning number that wants
 * a real population."*
 *
 * So the total is **not** decided here either. It is derived from the one bot count
 * that *is* a design decision — the **20 authored starter bots** of T045, which are a
 * ramp whose shape teaches rather than a pool whose size fills. Divide 20 by the
 * starter share and the rest of the table follows:
 *
 * ```
 * total  = 20 / 0.30 = 66.7
 * bronze = silver = gold = 13   ·   platinum = 7   ·   diamond = 0
 * ```
 *
 * Which reproduces T047's published 13 · 13 · 13 · 7 exactly, and reproduces it as a
 * *consequence* rather than as a second copy of it. If the ramp ever grows to 30
 * starter bots the whole table re-derives and nothing else has to be edited.
 */

import { STARTING_RATING } from '../db/schema/ratings.js';
import { BOT_DISTRIBUTION, type PaddedBand } from './config.js';

/**
 * The authored anchor, and the only bot count in the project that is a decision.
 *
 * Twenty because the ramp has three teaching stages (T045: 1–5 glaring, 6–12
 * partial, 13–20 the graduation standard) and each needs enough distinct opponents
 * that a player meets the *stage* rather than memorising one squad.
 *
 * **It is knowingly too few, and that is recorded rather than hidden.** The design
 * doc's own floor is *"a starter player fights roughly 140 battles in their week"*,
 * so twenty bots is seven encounters each. The plumbing is proven at this depth; the
 * depth is not. See the note in `specs/009-matchmaking/tasks.md`.
 */
export const STARTER_BOT_COUNT = 20;

/**
 * The Elo gap from `STARTING_RATING` to each end of a band's bot spread.
 *
 * **Solved from a stated target, not chosen.** `09-matchmaking.md` requires that a
 * new player *"should be able to lose to a strong bot and beat a weak one inside the
 * same league"* — a spread calibrates the band where a midpoint calibrates one point.
 * That is a requirement about *win rates*, so the gap follows from the Elo curve
 * rather than from taste.
 *
 * Target the ends at a **15% / 85%** expected score for an unrated 1,000 player:
 *
 * ```
 * E = 1 / (1 + 10^(d/400))      →      d = 400 · log10(1/E − 1)
 * d = 400 · log10(1/0.15 − 1) = 400 × 0.7533 = 301  →  300
 * ```
 *
 * **Why 15% and not 1% or 40%.** At 40% the ends are indistinguishable and there is
 * no ramp to climb. At 1% the strongest bot is not "strong", it is a wall, and a wall
 * teaches nothing. At 15% the weakest bot is a reliable win that teaches the
 * controls, the strongest is beatable about one time in seven — **and because winning
 * moves the player up, the ramp gets easier as they climb it.** A player who has
 * converged to 1,200 is at 38% against the top bot rather than 15%. The number is
 * chosen to be *steep at the start of the week and shallow by the end of it*, which
 * is what a difficulty ramp is.
 */
export const RATING_SPREAD = 300;

/** The bands that receive generated padding. Diamond is deliberately not one. */
export type BotBandWithPadding = PaddedBand;

export interface BotPopulation {
  readonly total: number;
  readonly counts: Readonly<Record<PaddedBand, number>>;
}

/**
 * The bot table, derived.
 *
 * **`Math.round` per band, not a running remainder.** A remainder distribution would
 * force the counts to sum to the total exactly, and the total is the *derived* number
 * here — forcing agreement with it would silently move a band's count to absorb
 * rounding, which is the one thing a published table must not do. Each band's count
 * is its own share of the total, independently, and the sum is reported rather than
 * imposed. It comes to 66 against a 66.7 total; the two-thirds of a bot is the honest
 * residue of a share-based design and is not allocated anywhere.
 */
export function botPopulation(starterCount: number = STARTER_BOT_COUNT): BotPopulation {
  if (!Number.isInteger(starterCount) || starterCount < 1) {
    throw new Error(`starterCount must be a positive integer, got ${starterCount}`);
  }

  const total = starterCount / BOT_DISTRIBUTION.starter;

  const counts = Object.fromEntries(
    (Object.keys(BOT_DISTRIBUTION) as PaddedBand[]).map((band) => [
      band,
      // The starter count is the input, so it is never re-derived from its own share
      // — that round-trip could disagree with itself at some fractional shares.
      band === 'starter' ? starterCount : Math.round(total * BOT_DISTRIBUTION[band]),
    ]),
  ) as Record<PaddedBand, number>;

  return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
}

/**
 * One bot's fixed rating, spread evenly across its band (T048).
 *
 * `index` is 0-based and ascending in strength, so index 0 is the weakest bot in the
 * band and `count - 1` the strongest. A band holding a single bot gets
 * `STARTING_RATING` — with nothing to spread between, the midpoint is the only
 * defensible answer, and it is the degenerate case rather than the design.
 *
 * **Bots do not share the players' K-factor because their rating never moves at all.**
 * `A fixed rating makes them calibration anchors`: the live population sorts itself
 * against fixed points, and a point that drifts is not one. Nothing in settlement
 * writes to a bot's standing row.
 */
export function botRating(index: number, count: number): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`count must be a positive integer, got ${count}`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`index ${index} is outside a band of ${count}`);
  }

  if (count === 1) return STARTING_RATING;

  const fraction = index / (count - 1); // 0 … 1 inclusive
  return Math.round(STARTING_RATING - RATING_SPREAD + fraction * 2 * RATING_SPREAD);
}

/**
 * The expected score for a player of `rating` against a bot of `botRating`.
 *
 * Here rather than in a test so the claim in `RATING_SPREAD`'s note is checkable
 * against the same arithmetic the note derives from, instead of against a second
 * transcription of the Elo formula.
 */
export function expectedScore(rating: number, against: number): number {
  return 1 / (1 + 10 ** ((against - rating) / 400));
}
