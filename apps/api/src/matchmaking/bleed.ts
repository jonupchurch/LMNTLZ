/**
 * League edges bleed, at **both** ends (009 T038–T040 · FR-008, FR-009, FR-010).
 *
 * > **The nearer a player is to either end of their league, the more often they are
 * > offered a defender from the league beyond it.**
 *
 * ```
 * pos     = (score − floor) / (ceiling − floor)
 * P(up)   = 0.5 × max(0, (pos − 0.9) / 0.1)
 * P(down) = 0.5 × max(0, (0.1 − pos) / 0.1)
 * ```
 *
 * ### Both edges, because the upward ramp alone left a sawtooth
 *
 * This is the whole reason the pair exists, and it is not symmetry for its own sake.
 * Take `09-matchmaking.md`'s own model — a player beats league-mates below them ~65% of
 * the time and those above them ~40%:
 *
 * | Position | Mix | Win rate |
 * |---|---|---|
 * | Top of Bronze | 50% Silver | **52.5%** |
 * | **Bottom of Silver** | **50% Bronze** | **52.5%** |
 * | Middle of any league | none | ~50% |
 *
 * **Crossing a threshold costs nothing, because the two blends are the same blend.**
 * With only the upward ramp, 52.5% at the top of Bronze dropped to 40% the moment a
 * rune was placed — and *that step was the reason to park below a threshold*. Removing
 * the step removes the incentive rather than taxing it, which is why there is no
 * anti-parking rule anywhere in this feature.
 *
 * ### Position, never population
 *
 * `positionInLeague` measures against the league's **own score range**. So a player's
 * mix depends only on their own score, and nobody's matching changes because other
 * people geared up — the same principle that made the thresholds fixed rather than
 * percentile. A percentile-within-league bleed would have reintroduced at the edges
 * exactly what fixed thresholds removed at the boundaries.
 *
 * ### Separate from `candidates.ts` on purpose (T039)
 *
 * The ramp is a pure function of one number, so isolating it keeps the tuning surface
 * one file wide and makes the continuity proof arithmetic rather than a database
 * fixture.
 *
 * > **But only one of the two constants is a dial, and `bleed.test.ts` proves it.**
 * > `BLEED_RAMP` (0.1) is genuinely tunable — it sets how wide the transition zone is,
 * > and any value under 0.5 keeps the curve continuous. **`BLEED_EDGE_MIX` is not a
 * > choice at all.** Equating the win rate at the top of a band with the win rate at the
 * > bottom of the next gives
 * >
 * > ```
 * > (1 − m)·a + m·b = (1 − m)·b + m·a   ⟺   (a − b) = 2m(a − b)   ⟺   m = ½
 * > ```
 * >
 * > for *any* pair of win rates `a` ≠ `b`. So 0.5 is forced, and it does not depend on
 * > the 65/40 skill gradient the document happens to illustrate with. Retuning it is not
 * > a balance decision, it is reintroducing the sawtooth: 0.4 puts a **5.1-point** step
 * > back at the Bronze/Silver line.
 *
 * > **Not yet wired into the candidate pool, and that is deliberate rather than
 * > forgotten.** Turning a mix into an actual list is *pool composition*, which is
 * > T052's job in Phase 7 — the same place bots are padded in and widening is decided.
 * > Doing it here would mean choosing a selection rule before the bots that share the
 * > list exist. `bleed.test.ts` proves the ramp and the bound; Phase 7 owns the
 * > assembly, and it is the last thing 009 needs before the curve is continuous in
 * > practice as well as on paper.
 */

import { BLEED_EDGE_MIX, BLEED_RAMP } from './config.js';
import { LEAGUE_NAMES, leagueOf, positionInLeague, type League } from './league.js';

/**
 * How a player's offers divide between their own league and its neighbours.
 *
 * Always sums to 1, and `up`/`down` are **never both non-zero** — `BLEED_RAMP` is 0.1,
 * so a position cannot be inside both the bottom and top tenth of a band. That is
 * asserted in the tests rather than assumed here, because it stops being true the
 * moment somebody tunes the ramp past 0.5.
 */
export interface BleedMix {
  readonly own: number;
  /** Share drawn from the league above. `0` in Diamond, which has none. */
  readonly up: number;
  /** Share drawn from the league below. `0` in Bronze, which has none. */
  readonly down: number;
}

/** The next league up, or `null` at the top. */
export function leagueAbove(league: League): League | null {
  const index = LEAGUE_NAMES.indexOf(league);
  return LEAGUE_NAMES[index + 1] ?? null;
}

/** The next league down, or `null` at the bottom. */
export function leagueBelow(league: League): League | null {
  const index = LEAGUE_NAMES.indexOf(league);
  return index <= 0 ? null : (LEAGUE_NAMES[index - 1] ?? null);
}

/**
 * The raw ramp, before the end leagues are considered.
 *
 * Split out from `bleed()` so the continuity proof can compare the *shape* of the two
 * ramps directly, without Bronze's missing neighbour hiding half of it.
 */
export function ramps(positionInBand: number): { readonly up: number; readonly down: number } {
  const clamped = Math.min(1, Math.max(0, positionInBand));

  return {
    up: BLEED_EDGE_MIX * Math.max(0, (clamped - (1 - BLEED_RAMP)) / BLEED_RAMP),
    down: BLEED_EDGE_MIX * Math.max(0, (BLEED_RAMP - clamped) / BLEED_RAMP),
  };
}

/**
 * The mix for a gear score.
 *
 * **The end leagues bleed one way only** (FR-010), and the share that cannot bleed
 * stays in the player's own league rather than being redirected to the other side.
 * Redirecting would give a Bronze-floor player 50% Silver opponents — the exact
 * opposite of what a ramp at the *bottom* of a band is for.
 *
 * `09-matchmaking.md` records why neither end matters much: *"Diamond spans just
 * 1.17×, and every account starts at Bronze's floor, so its bottom is where the game
 * begins rather than where anyone lands."*
 */
export function bleed(gearScore: number): BleedMix {
  const league = leagueOf(gearScore);
  const raw = ramps(positionInLeague(gearScore));

  const up = leagueAbove(league) === null ? 0 : raw.up;
  const down = leagueBelow(league) === null ? 0 : raw.down;

  return { own: 1 - up - down, up, down };
}
