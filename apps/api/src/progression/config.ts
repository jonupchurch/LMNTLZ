/**
 * **Every rate, cost, cap, tier boundary and K band in the economy** (010 T005).
 *
 * No economy literal appears anywhere else in `apps/api/src`. That is not tidiness
 * — under the no-nerf rule, tuning has to be possible without a client release
 * (SC-010), and `09-matchmaking.md` already learned the sharper version of this
 * lesson: a competitive constant compiled into a client build **cannot be
 * corrected without a store submission**, and for the week a Steam update goes
 * untaken the web and desktop builds disagree about the rules.
 *
 * So these are served, never shipped — `GET /v1/me/shards` carries what a client
 * needs to render the taper, exactly as `matchmaking/config.ts` serves the league
 * bands. Constitution XII.
 *
 * ### Which of these are decisions and which are starting points
 *
 * `06-progression.md` is explicit about the difference and it matters for how
 * freely each may move:
 *
 * | | Status |
 * |---|---|
 * | Rates, the daily curve, rune costs, the cap | **Set** — 2026-07-27 and -28, with the reasoning recorded |
 * | K bands | **A starting point, not a decision** — convergence speed is what a simulated population settles |
 *
 * The *shapes* are settled in both rows. A tuner may move a K band on evidence; a
 * tuner may not make the rating accumulate.
 */

import { FULL_RUNE_COST, STAGE_BOOSTS, STAGE_COSTS } from '../db/schema/runes.js';
import { PROVISIONAL_BATTLES, SETTLING_BATTLES, STARTING_RATING } from '../db/schema/ratings.js';

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/**
 * An attack victory through a **chosen door**, before the daily curve.
 * `06-progression.md`, *The rates*.
 */
export const ATTACK_VICTORY = 20;

/**
 * A successful defense of the **Visible** zone. **Half what an attack victory
 * pays, and the ratio is load-bearing.**
 *
 * At parity, passive income would be 47% of a typical player's shards — nearly
 * half of everything, earned by being logged off, which is the exact failure the
 * design warns about. At half it is 30%: a real supplement that cannot rival
 * attacking.
 */
export const DEFENSE_HOLD = 10;

/**
 * **Hidden doubles either side.** An ambush victory pays `2 × ATTACK_VICTORY`; a
 * Hidden hold pays `2 × DEFENSE_HOLD`.
 *
 * This is a base property of the game rather than a purchasable bonus, which is
 * what makes 011's boost compose into a 4× without anything special-casing it:
 * chosen ×1, chosen boosted ×2, ambush ×2, **ambush boosted ×4 — it emerges**.
 */
export const HIDDEN_MULTIPLIER = 2;

/** A loss pays nothing — and **takes nothing away**. The sting lives in the ladder. */
export const LOSS_PAYOUT = 0;

/**
 * The daily curve, tiered on the day's **victory count** (2026-07-27).
 *
 * Read as: the first 5 victories pay 1.5×, victories 6–20 pay the base rate, and
 * everything past 20 pays 0.5×. **Play is never blocked and nothing is ever
 * capped at zero** — the last tier pays half, not nothing.
 *
 * `through: null` is the open-ended final tier. A sentinel like `Infinity`
 * survives neither JSON nor a config endpoint, and this object is served.
 */
export const DAILY_TIERS = [
  { through: 5, multiplier: 1.5 },
  { through: 20, multiplier: 1.0 },
  { through: null, multiplier: 0.5 },
] as const;

/**
 * **Holds are never tiered**, at any victory count.
 *
 * A hold is driven by how often *other people* attack you, which the defender
 * does not control. There is nothing there to pace, and tiering it would let a
 * player's own attacking quietly devalue their defense.
 */
export const HOLDS_ARE_TIERED = false;

// ---------------------------------------------------------------------------
// The boost pass (011 T046-T048)
// ---------------------------------------------------------------------------

/**
 * **What a held boost pass multiplies income by.**
 *
 * `06-progression.md`: *2× shards from attacking* and *2× shards from
 * defending*. It is a plain term in the same product as every other multiplier,
 * which is what makes the documented composition **emerge** rather than be
 * special-cased — chosen ×1, chosen boosted ×2, ambush ×2, ambush boosted ×4.
 */
export const BOOST_MULTIPLIER = 2;

/**
 * **How many of each day's events the pass doubles: 10, and not 5 or 20.**
 *
 * `06-progression.md`'s storefront table: *first 10 victories that day* and
 * *first 10 holds that day*.
 *
 * It is deliberately **not** aligned to the 5-victory bonus tier, and the
 * misalignment is the design rather than an oversight. Aligning them would make
 * the pass exactly "extend the return bonus", so its value would collapse for
 * anybody who plays past five wins and the two mechanisms would be impossible to
 * tune apart. At 10 the pass covers roughly a session, spans the 1.5× tier and
 * the 1.0× tier, and stays worth something to both a short player and a long one.
 *
 * **A reader who "fixes" the misalignment fails a test** — `boost.test.ts` pins
 * the number and says this out loud.
 */
export const BOOSTED_EVENTS_PER_DAY = 10;

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

/** `150 · 150 · 150 · 200`. Re-exported so no caller reaches into the schema. */
export { STAGE_COSTS, STAGE_BOOSTS, FULL_RUNE_COST };

// ---------------------------------------------------------------------------
// The cap
// ---------------------------------------------------------------------------

/** Ten full runes. The cap is **expressed** in runes, never authored as 6,500. */
export const CAP_IN_RUNES = 10;

/**
 * **6,500 unspent shards — ten full runes** (2026-07-28).
 *
 * Derived rather than typed, because *a constant should explain itself*: 6,500 is
 * unmemorable, "ten full runes" is a quantity a player reasons about unprompted,
 * and deriving it means the cap moves by itself if a rune's price ever does.
 *
 * **This is insurance, not an exploit fix.** Hoarding is not a sandbag — a hoarder
 * is never stronger than their leaguemates — so the cap prevents nothing, and the
 * only thing that matters is that **it never fires in normal play**. It is 16.8
 * days of typical income and holds three heroes fully kitted at once with room
 * to spare.
 */
export const BALANCE_CAP = CAP_IN_RUNES * FULL_RUNE_COST;

// ---------------------------------------------------------------------------
// The daily boundary
// ---------------------------------------------------------------------------

/**
 * **The day resets at UTC midnight.**
 *
 * ⚠️ **This is an assumption, not a canon decision.** `06-progression.md` sets the
 * curve and never says when the day turns over, and neither does 010's research.
 * UTC is chosen because it is the only boundary that needs no per-account
 * timezone: every alternative — local midnight, a fixed regional hour — requires
 * storing one and then deciding what happens when a player travels, and a rolling
 * 24-hour window cannot be explained to a player at all.
 *
 * It is served as an absolute instant (`nextBoundaryAt`), so if this is ever
 * changed to something per-player, the API shape does not have to change with it.
 */
export function dayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** The next reset after `at` — served so the taper is legible **before** it bites. */
export function nextBoundaryAt(at: Date): Date {
  const start = dayStart(at);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

/**
 * Standard Elo on a 400-point logistic: a 400-point lead is a 10:1 expectation.
 * `E_a = 1 / (1 + 10^((R_d − R_a) / 400))`.
 */
export const ELO_SCALE = 400;

/** Everyone starts here. Defined on the table, since it is that column's default. */
export { STARTING_RATING };

/**
 * The three K bands (FR-021). **A starting point, not a decision** —
 * `06-progression.md` says so in those words.
 *
 * | Phase | Rated battles | K |
 * |---|---|---|
 * | Provisional | first 30 | 40 |
 * | Settling | 31 – 200 | 20 |
 * | Established | 200 + | 10 |
 */
export const K_PROVISIONAL = 40;
export const K_SETTLING = 20;
export const K_ESTABLISHED = 10;

export { PROVISIONAL_BATTLES, SETTLING_BATTLES };

/**
 * **A Hidden victory pays double rating; a loss costs the same in either zone.**
 *
 * The asymmetry is deliberate and it makes rating **non-zero-sum** — at even
 * ratings and K=10 a Visible battle is `+5.0 / −5.0` (net 0) while a Hidden one is
 * `+10.0 / −5.0` (net +5.0). That is written down here, and asserted in
 * `tests/progression/rating.test.ts`, because it is *a discovered surprise only if
 * nobody wrote it down*.
 *
 * It exists to counterweight the shard economy, which says the opposite: shards
 * say fortify Visible, rating says fortify Hidden. Without it, Hidden is
 * dominated.
 */
export const HIDDEN_RATING_MULTIPLIER = 2;

/**
 * Everything a client may need to render the economy, in one served object.
 *
 * **Serving the whole thing rather than a curated subset** is the same call
 * `matchmaking/config.ts` made: the client already renders the taper, the cap and
 * the rune costs, and a subset would be re-litigated every time a screen wanted
 * one more number.
 */
export interface ProgressionConfig {
  readonly attackVictory: number;
  readonly defenseHold: number;
  readonly hiddenMultiplier: number;
  readonly dailyTiers: readonly { readonly through: number | null; readonly multiplier: number }[];
  readonly holdsAreTiered: boolean;
  readonly stageCosts: readonly number[];
  readonly stageBoosts: readonly number[];
  readonly fullRuneCost: number;
  readonly capInRunes: number;
  readonly balanceCap: number;
}

export function progressionConfig(): ProgressionConfig {
  return {
    attackVictory: ATTACK_VICTORY,
    defenseHold: DEFENSE_HOLD,
    hiddenMultiplier: HIDDEN_MULTIPLIER,
    dailyTiers: DAILY_TIERS,
    holdsAreTiered: HOLDS_ARE_TIERED,
    stageCosts: STAGE_COSTS,
    stageBoosts: STAGE_BOOSTS,
    fullRuneCost: FULL_RUNE_COST,
    capInRunes: CAP_IN_RUNES,
    balanceCap: BALANCE_CAP,
  };
}
