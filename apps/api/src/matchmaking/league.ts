/**
 * The five leagues, on **fixed thresholds** (009 T008, T009 · FR-003, FR-007).
 *
 * ### Fixed, not population quintiles — and this is the load-bearing choice
 *
 * `09-matchmaking.md` *Fixed thresholds, not population quintiles*: with quintiles
 * a player's league moves **because other people geared up**, which is maddening
 * for a *gear* rating in a way it would not be for a skill rating. Nothing about
 * that player changed. Fixed thresholds mean **score only rises and a league is
 * never taken away** — US2 exists entirely to hold this line, and T020 advances a
 * whole simulated population past a standing-still player to prove it.
 *
 * The consequence is deliberate: **Diamond ends up the largest league** at roughly
 * a quarter to a third of a mature population, because those players sit at the
 * gear cap and are *genuinely identical*. A crowd there is the correct outcome,
 * not a distribution to fix.
 *
 * ### Where the numbers come from
 *
 * `specs/data-model.md` § 6 carries the table, and it is derived rather than
 * chosen: a rune completed through all four stages is worth **125**
 * (`2.5 × (20 + 10 + 5 + 15)`), so the two anchors are
 *
 * ```
 * starter grant  12 heroes × one complete rune  = 1,500   ← the Bronze floor
 * full kit       81 runes                        = 10,125  ← the Diamond ceiling
 * ```
 *
 * **This file is the only definition of the bands in code.** They existed solely
 * in a spec document until 009; a second copy is how one of them drifts.
 */

/** A rune taken through all four stages: `2.5 × (20 + 10 + 5 + 15)`. */
export const COMPLETE_RUNE_SCORE = 125;

/** 12 heroes, one complete rune each. Also the Bronze floor, and not by accident. */
export const STARTER_GRANT_SCORE = 12 * COMPLETE_RUNE_SCORE;

/** 81 runes — 27 heroes × 3 slots. The Diamond ceiling. */
export const FULL_KIT_SCORE = 81 * COMPLETE_RUNE_SCORE;

export const LEAGUE_NAMES = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;

export type League = (typeof LEAGUE_NAMES)[number];

/**
 * Each band as `[floor, ceiling)` — **half-open, except Diamond**.
 *
 * A shared boundary has to belong to exactly one league or a score of 2,500 is
 * both Bronze and Silver, and the two answers would disagree about whether the
 * player is at their ceiling (bleeding up) or their floor (bleeding down) —
 * opposite behaviour from one number. The convention is *floor-inclusive*, so
 * 2,500 is Silver's first score.
 *
 * **Diamond's ceiling is inclusive**, because a full kit is exactly 10,125 and a
 * half-open top would place the game's strongest possible account outside every
 * league.
 */
export const LEAGUE_BANDS: ReadonlyArray<{
  readonly league: League;
  readonly floor: number;
  readonly ceiling: number;
}> = [
  { league: 'bronze', floor: STARTER_GRANT_SCORE, ceiling: 2500 },
  { league: 'silver', floor: 2500, ceiling: 4000 },
  { league: 'gold', floor: 4000, ceiling: 6200 },
  { league: 'platinum', floor: 6200, ceiling: 8700 },
  { league: 'diamond', floor: 8700, ceiling: FULL_KIT_SCORE },
];

/**
 * Which league a gear score sits in.
 *
 * **Both ends clamp rather than throw.** Below the Bronze floor is unreachable by
 * construction — every account is granted 12 complete runes — but "unreachable by
 * construction" is exactly the assumption that breaks when 010 changes the grant,
 * and the failure mode of throwing here is a player who cannot be matched at all.
 * Above the ceiling is likewise arithmetically impossible with 81 runes, and a
 * fourth rune slot is named in `06-progression.md` as future work; if it ever
 * lands, this clamps instead of crashing while the thresholds are re-derived.
 */
export function leagueOf(gearScore: number): League {
  for (const band of LEAGUE_BANDS) {
    if (gearScore < band.ceiling) return band.league;
  }
  return 'diamond';
}

export function bandOf(league: League): { readonly floor: number; readonly ceiling: number } {
  const band = LEAGUE_BANDS.find((b) => b.league === league);
  if (!band) throw new Error(`no such league: ${league}`);
  return { floor: band.floor, ceiling: band.ceiling };
}

/**
 * Where a player sits inside their own league, as `0` at the floor to `1` at the
 * ceiling.
 *
 * > **Against the league's own range, never against the population** (FR-007).
 *
 * That is not a simplification, it is the same guarantee `leagueOf` keeps one level
 * down. A percentile *within* the league would move a player's bleed mix — and
 * therefore who they fight — because other players geared up, reintroducing at the
 * edges exactly what fixed thresholds removed at the boundaries. Someone standing
 * still would watch their opponents change for reasons invisible to them.
 *
 * Clamped to `0..1` so a score outside the band (see `leagueOf`) cannot produce a
 * bleed fraction above 1, which `bleed.ts` would read as more than all of a
 * player's opponents coming from the neighbouring league.
 */
export function positionInLeague(gearScore: number): number {
  const { floor, ceiling } = bandOf(leagueOf(gearScore));
  const raw = (gearScore - floor) / (ceiling - floor);
  return Math.min(1, Math.max(0, raw));
}
