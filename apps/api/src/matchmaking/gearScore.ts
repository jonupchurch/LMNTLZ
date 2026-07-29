/**
 * The gear axis (009 T005–T007 · FR-001, FR-002).
 *
 * > **`score = 2.5 × effective stat points`, summed over every rune a player has
 * > currently placed.**
 *
 * ### Placed, never spent — and that is what makes hoarding not a sandbag
 *
 * `09-matchmaking.md` *Why not shards spent*: shards measure **investment**, the
 * league needs **power**, and the two diverge because every rune stage costs a flat
 * 150 while the gains diminish. A shard-proportional score would rate a player who
 * bought three `+5` traces as equal to one who bought three `+20` majors.
 *
 * The same choice answers the sandbag question that would otherwise need a rule.
 * A player who banks shards to stay in a lower league is **not** sandbagging,
 * because *"a sandbag exists only where score and power move by different
 * amounts, and banked shards are not power until they are placed"* — which is
 * precisely why the recompute is triggered **on placement** (`recordPlacement`)
 * rather than on request. Nothing in this file can see a shard balance, and that
 * absence is the enforcement (T007).
 *
 * ### The seam: 010 owns runes, and 009 is built first
 *
 * `spec.md`'s *Dependencies* names **10 (progression) for rune placement** as
 * upstream. There is no runes table yet, so a real sum would be `0` for every
 * account — putting the entire population *below* the Bronze floor and making
 * every league untestable against real data.
 *
 * So the vendor-behind-an-interface shape 008 used for `@vercel/blob` applies here
 * to a *feature* rather than a vendor: `RuneSource` is the one boundary, and until
 * 010 installs a real one, `gearScore()` answers with the **1,500 starter grant**.
 * **Null means "runes do not exist yet", and it is not zero** — the distinction is
 * the whole point, and it is why `player_ratings.gear_score` is nullable rather
 * than defaulted.
 *
 * **What 009 therefore cannot prove, and 010 must:** that a real placement moves a
 * real league. Every other league guarantee is proven here against the simulated
 * population, because league shares and bleed were always population questions.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { playerRatings } from '../db/schema/ratings.js';
import { STARTER_GRANT_SCORE } from './league.js';

/** `2.5` — the one conversion from stat points to gear score. */
export const SCORE_PER_STAT_POINT = 2.5;

/**
 * Where placed-rune stat points come from.
 *
 * **One method, and it answers only about runes currently placed.** There is
 * deliberately no `shardsSpent`, no `lifetimeInvestment` and no `runeHistory` — a
 * source that could report spend is a source somebody scores by accident, and
 * *Placed, not spent* is the guarantee this axis rests on.
 */
export interface RuneSource {
  /**
   * Effective stat points over every rune the account currently has placed, or
   * **`null` if rune placement does not exist yet** (no 010).
   */
  placedStatPoints(accountId: string): Promise<number | null>;
}

/** The pre-010 source. Answers `null` for everybody — never `0`. */
export const noRuneSource: RuneSource = {
  placedStatPoints: async () => null,
};

let source: RuneSource = noRuneSource;

/**
 * Install a rune source. **Returns the undo**, so a test cannot leak one into the
 * next file — the same shape `setReplayStorage` uses in 008.
 */
export function setRuneSource(next: RuneSource): () => void {
  const previous = source;
  source = next;
  return () => {
    source = previous;
  };
}

/** `2.5 × points`, rounded — a gear score is a whole number in every band table. */
export function scoreFromStatPoints(statPoints: number): number {
  return Math.round(SCORE_PER_STAT_POINT * statPoints);
}

/**
 * A player's gear score.
 *
 * **A read, not a computation.** The value is written on placement (see
 * `recordPlacement`), because FR-002 requires the recompute to happen *"on
 * placement, immediately — not on request"*. Computing here instead would make
 * every matchmaking query re-sum every rune of every candidate.
 *
 * A row that has never been scored — every row today — reads as the starter grant.
 */
export async function gearScore(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ gearScore: playerRatings.gearScore })
    .from(playerRatings)
    .where(eq(playerRatings.accountId, accountId))
    .limit(1);

  return row?.gearScore ?? STARTER_GRANT_SCORE;
}

/**
 * Recompute and store a player's gear score. **Called when a rune is placed**, by
 * whatever owns placement — which is 010.
 *
 * Returns the score it stored, or the starter grant if there is no rune source to
 * ask, in which case **nothing is written**: storing the placeholder would leave a
 * row that cannot be told apart from a genuinely-scored Bronze player.
 */
export async function recordPlacement(accountId: string): Promise<number> {
  const statPoints = await source.placedStatPoints(accountId);
  if (statPoints === null) return STARTER_GRANT_SCORE;

  const score = scoreFromStatPoints(statPoints);

  await db()
    .insert(playerRatings)
    .values({ accountId, gearScore: score })
    .onConflictDoUpdate({
      target: playerRatings.accountId,
      set: { gearScore: score, updatedAt: new Date() },
    });

  return score;
}
