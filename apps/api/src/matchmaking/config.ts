/**
 * Every matchmaking constant, served rather than compiled into the client
 * (009 T019 · FR-017, Constitution XII).
 *
 * `squads/ambush.ts` already argued this for the ambush numbers and the argument
 * generalises: **a competitive constant that ships inside a client build cannot be
 * corrected without a store submission**, and for the week a Steam update goes
 * untaken the web and desktop builds disagree about the rules. That is the worst
 * state a competitive number can be in.
 *
 * It applies with particular force to the league thresholds. `09-matchmaking.md`
 * records that a fourth rune slot *"raises every gear score and therefore every
 * league threshold — which is a re-derivation, not a toggle."* A client holding its
 * own copy of the bands would place players in the wrong league the day that
 * happens, and would keep doing it for as long as the old build is installed.
 *
 * ### Ambush chance is percent here, and that had to be decided
 *
 * `contracts/matchmaking-api.md` shows `"ambushChance": 0.34`, a fraction.
 * **The shipped code serves percent** — `squads/ambush.ts` returns `34`, and
 * `/v1/roster` has been answering `{ chance: 14, perWin: 2, cap: 90, capAt: 45 }`
 * since 006, which the client already renders.
 *
 * Percent wins, and the contract is what bends. Two representations of one number
 * across two endpoints is a defect waiting for somebody to ask whether `0.34` means
 * 34% or a third of a percent — and the cap being `90` rather than `0.9` in the
 * same object would make the mistake easy to write and hard to see. **This is not a
 * new convention; it is the one already in production.**
 */

import type { BotBand } from '../db/schema/accounts.js';
import { ambushConfig, type AmbushConfig } from '../squads/ambush.js';
import { LEAGUE_BANDS, COMPLETE_RUNE_SCORE, FULL_KIT_SCORE, STARTER_GRANT_SCORE } from './league.js';
import { SCORE_PER_STAT_POINT } from './gearScore.js';

/**
 * How far into a league the bleed reaches, as a fraction of the band.
 *
 * The outer tenth at each end ramps; the middle 80% is pure league. Bleeding at
 * **both** ends is what makes the curve continuous — `09-matchmaking.md` records
 * that the upward ramp alone *"left a sawtooth at every boundary."*
 */
export const BLEED_RAMP = 0.1;

/** The share drawn from next door at the very edge of a band. */
export const BLEED_EDGE_MIX = 0.5;

/**
 * **The promise the whole league system exists to keep**: nobody is ever offered an
 * opponent above this multiple of their own gear.
 *
 * It is not a chosen number — it is Bronze's own width. `2500 / 1500 = 1.667`, and
 * Bronze is the tightest ratio in the game because it is the narrowest band sitting
 * on the lowest floor. Every other league is kinder: Silver 1.60, Gold 1.55,
 * Platinum 1.40, Diamond 1.16. So a player at the Bronze floor facing the Bronze
 * ceiling is the worst case that exists.
 */
export const GEAR_BOUND = 1.67;

/**
 * The bound on a **widened** match, which is a different promise.
 *
 * `contracts/matchmaking-api.md` is explicit that *"the 1.67× gear guarantee does
 * not hold on a widened match"* — reaching outside the band can reach 2.67× for a
 * player at a league floor. Widening is therefore **disclosed to the player**, per
 * request, and never persisted. Bots are padded in first precisely so this stays
 * rare, and the widen rate is the metric that says whether the padding worked.
 */
export const WIDENED_GEAR_BOUND = 2.67;

/**
 * The fewest distinct defenders a pool may hold before matchmaking widens outside the
 * band.
 *
 * **Not specified anywhere, so it is derived from the smallest published number that
 * bears on it rather than chosen.** `06-progression.md`'s attack income pays **1.5× on
 * the first five victories** of a day, so five distinct defenders is the point below
 * which a player cannot finish the tier the economy front-loads without attacking
 * somebody twice. That is the first place a thin pool becomes visible as something other
 * than an aesthetic problem.
 *
 * **It is deliberately small, because widening breaks a promise the design published.**
 * `contracts/matchmaking-api.md` states plainly that *"the 1.67× gear guarantee does not
 * hold on a widened match"* — reaching a band out can serve 2.67× gear. A generous floor
 * would widen often and quietly convert a guarantee into a usual case, so the trigger is
 * the smallest defensible one and bots are the answer above it.
 */
export const MIN_POOL = 5;

/**
 * A defender must have been active inside this window to be offered.
 *
 * **Applied in the query, never by a nightly job.** A job leaves a returning player
 * invisible until it next runs. And leaving the pool is its own enforcement — nobody
 * can attack a defense nobody is offered — so there is deliberately no second rule
 * zeroing an idle account's hold income. A second mechanism is a second thing to
 * keep in step.
 */
export const INACTIVITY_DAYS = 30;

/**
 * Every bot band that receives *generated* padding — which is every band except
 * Diamond.
 *
 * **Typed as an exclusion rather than as its own list**, so it cannot drift from
 * `BOT_BANDS`: adding a seventh band to the schema makes this a compile error until
 * somebody decides whether it pads.
 */
export type PaddedBand = Exclude<BotBand, 'diamond'>;

/**
 * Bot allocation across the bands, as shares of the whole pool.
 *
 * Diamond is absent on purpose: `spec.md` US4 requires its bots be **hand-seeded
 * only** — *"bots that were written, never bots that were needed"* — so it takes no
 * share of a distribution and gets no automatic padding.
 *
 * **`Record<PaddedBand, …>` rather than `Record<string, …>`, and the type is the
 * guard.** As `Record<string, number>` this object would accept `diamond: 0.1` — the
 * one entry the design forbids — and would accept a typo'd band name that then
 * silently allocated nothing. Now Diamond is a compile error and a missing band is
 * too. Shares are checked to sum to 1 in `bots.test.ts`; a type cannot do that half.
 */
export const BOT_DISTRIBUTION: Readonly<Record<PaddedBand, number>> = {
  starter: 0.3,
  bronze: 0.2,
  silver: 0.2,
  gold: 0.2,
  platinum: 0.1,
};

/** The starter league's three measurable exits. The fourth is joining a guild. */
export const STARTER_DAYS = 7;
export const STARTER_SHARD_TARGET = 3250;
export const STARTER_INCOME_MULTIPLIER = 1.5;

export interface MatchmakingConfig {
  readonly leagues: ReadonlyArray<{ league: string; floor: number; ceiling: number }>;
  readonly gearScore: {
    readonly perStatPoint: number;
    readonly completeRune: number;
    readonly starterGrant: number;
    readonly fullKit: number;
  };
  readonly bleed: { readonly ramp: number; readonly edgeMix: number };
  readonly bound: { readonly normal: number; readonly widened: number };
  readonly minPool: number;
  readonly inactivityDays: number;
  readonly ambush: AmbushConfig;
  readonly starter: {
    readonly days: number;
    readonly shardTarget: number;
    readonly incomeMultiplier: number;
  };
}

/**
 * Everything the client may know, in one object.
 *
 * **One function, so adding a constant means adding it here and nowhere else** —
 * the shape `ambushConfig()` established. A constant that exists but is not
 * returned is a constant the client will eventually hard-code.
 */
export const matchmakingConfig = (): MatchmakingConfig => ({
  leagues: LEAGUE_BANDS.map((b) => ({ league: b.league, floor: b.floor, ceiling: b.ceiling })),
  gearScore: {
    perStatPoint: SCORE_PER_STAT_POINT,
    completeRune: COMPLETE_RUNE_SCORE,
    starterGrant: STARTER_GRANT_SCORE,
    fullKit: FULL_KIT_SCORE,
  },
  bleed: { ramp: BLEED_RAMP, edgeMix: BLEED_EDGE_MIX },
  bound: { normal: GEAR_BOUND, widened: WIDENED_GEAR_BOUND },
  minPool: MIN_POOL,
  inactivityDays: INACTIVITY_DAYS,
  ambush: ambushConfig(),
  starter: {
    days: STARTER_DAYS,
    shardTarget: STARTER_SHARD_TARGET,
    incomeMultiplier: STARTER_INCOME_MULTIPLIER,
  },
});
