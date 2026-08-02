/**
 * Battle income — **the only writer of positive shard income** (010 T011).
 *
 * `06-progression.md`: *"Rewards only. Nothing ever costs shards."* A loss pays
 * nothing and **takes nothing away**; the sting of losing lives in the rating
 * ladder, not in the economy (FR-002). There is deliberately no entry-fee path
 * anywhere in this directory, and `tests/progression/income.test.ts` asserts a
 * loss leaves the balance untouched rather than merely un-credited.
 *
 * ### The order the multipliers apply in, which is not arbitrary
 *
 * ```
 * base        20 attack  ·  10 hold
 * × zone      Hidden doubles either side          (a base property of the game)
 * × daily     1.5 / 1.0 / 0.5 by victory count    (attack only — holds are never tiered)
 * × starter   1.5 while in the nursery            (attack only — 009)
 * → cap       at 6,500 the credit becomes 0       (silently; no overflow, no queue)
 * ```
 *
 * **Zone before daily is what makes 011's boost compose.** `06-progression.md`
 * records that a boosted ambush lands on 4× *"and nothing special-cases it"* —
 * that only stays true while the zone multiplier is an ordinary factor in this
 * chain rather than a branch. Anything that special-cases Hidden here will break
 * a purchase two features away.
 *
 * ### Rounding is floor, once, at the end
 *
 * The daily curve's 1.5× and 0.5× and the starter 1.5× all produce halves that
 * compound: `20 × 1.5 × 1.5 = 45`, but `10 × 0.5 × 1.5 = 7.5`. Rounding at each
 * step would make the total depend on the order of the factors, which is the kind
 * of defect that shows up as a player being one shard short and nobody able to say
 * why. One `Math.floor` at the end, in the player's favour nowhere and against
 * them nowhere — the published table has no fractional entries to disagree with.
 */

/**
 * **Progression imports matchmaking, and never the other way round.** 009 built
 * `gearScore.ts`'s `setRuneSource` seam precisely so the rune half of that
 * relationship could be injected rather than imported, which is what keeps this
 * one-directional and acyclic.
 */
import { starterIncomeMultiplier } from '../matchmaking/starterLeague.js';
import { headroom } from './cap.js';
import { append, holdsToday, victoriesToday } from './ledger.js';
import { entitlementFor } from '../payments/entitlements.js';
import type { LedgerReason } from '../db/schema/ledger.js';
import { db } from '../db/client.js';
import {
  ATTACK_VICTORY,
  BOOST_MULTIPLIER,
  BOOSTED_EVENTS_PER_DAY,
  DAILY_TIERS,
  DEFENSE_HOLD,
  HIDDEN_MULTIPLIER,
  HOLDS_ARE_TIERED,
  LOSS_PAYOUT,
  STREAK_BONUS_THRESHOLD,
} from './config.js';

/** What produced the income. `zone` decides the Hidden double. */
export interface IncomeEvent {
  readonly kind: 'attack-victory' | 'defense-hold' | 'loss';
  readonly zone: 'visible' | 'hidden';
}

/**
 * The multiplier for the `n`th victory of the day, where `n` is **1-based and
 * includes the victory being paid**.
 *
 * Off-by-one here is a silent, permanent overpay or underpay, so the boundaries
 * are pinned at exactly 5/6 and 20/21 in `tests/progression/tiers.test.ts`. Read
 * the table as *"victories 1–5"*, so victory 5 is still 1.5× and victory 6 is not.
 */
export function dailyMultiplier(victoryNumber: number): number {
  for (const tier of DAILY_TIERS) {
    if (tier.through === null || victoryNumber <= tier.through) return tier.multiplier;
  }
  /* c8 ignore next -- the final tier has `through: null`, so the loop always returns. */
  return 1;
}

/** The base rate before any multiplier. A loss is zero and stays zero. */
function baseFor(kind: IncomeEvent['kind']): number {
  if (kind === 'attack-victory') return ATTACK_VICTORY;
  if (kind === 'defense-hold') return DEFENSE_HOLD;
  return LOSS_PAYOUT;
}

/**
 * What an event would pay, before the cap. **Pure** — no database, no clock — so
 * the published table can be asserted directly against it.
 *
 * `victoryNumber` is ignored for holds, because **holds are never tiered**: a hold
 * is driven by how often other people attack you, which the defender does not
 * control, so there is nothing there to pace (FR-003).
 */
export function payoutFor(
  event: IncomeEvent,
  victoryNumber: number,
  starterMultiplier = 1,
  /**
   * **Whether a held boost pass applies to *this* event** (011 T046).
   *
   * A boolean rather than the entitlement, and rather than a count, because the
   * ten-a-day cap is a question about the day and this function is pure. The
   * caller — `awardShards` — knows how many of this kind have already been paid
   * today; this one knows what a boosted event is worth.
   */
  boosted = false,
): number {
  const base = baseFor(event.kind);
  if (base === 0) return 0;

  const zone = event.zone === 'hidden' ? HIDDEN_MULTIPLIER : 1;

  const tiered =
    event.kind === 'attack-victory' || HOLDS_ARE_TIERED ? dailyMultiplier(victoryNumber) : 1;

  const starter = event.kind === 'attack-victory' ? starterMultiplier : 1;

  /**
   * **A term in the same product as everything else, deliberately.**
   *
   * `06-progression.md` documents the composition as *chosen ×1 · chosen boosted
   * ×2 · ambush ×2 · ambush boosted ×4*, and the ×4 is not written anywhere in
   * this file — it **emerges** from `zone × boost`. Special-casing "ambush with a
   * pass" would produce the same four numbers today and be a second place the
   * rule lives the moment either half moves.
   *
   * It multiplies the starter bonus too, and that is correct: both are
   * multipliers on the same base, and a player who bought a pass during their
   * starter window gets what both say they give.
   */
  const boost = boosted ? BOOST_MULTIPLIER : 1;

  return Math.floor(base * zone * tiered * starter * boost);
}

/** What `awardShards` actually did, so a caller can report it without a re-read. */
export interface Award {
  /** Shards credited. `0` for a loss, and `0` at the cap. */
  readonly credited: number;
  /** What the event would have paid with no cap. Equals `credited` below the cap. */
  readonly earned: number;
  /** True when the cap reduced the credit — including reducing it to nothing. */
  readonly cappedAt: number | null;
}

/**
 * Credit a battle result. **The only writer of positive battle income** (FR-001).
 *
 * Losses short-circuit before any query: there is nothing to write, and writing a
 * zero row would put noise in the table that every later aggregate has to filter.
 *
 * `tx` threads the caller's transaction through, so income credited during
 * settlement commits or rolls back with the battle record rather than beside it.
 */
export async function awardShards(
  accountId: string,
  event: IncomeEvent,
  battleId: string | null = null,
  now: Date = new Date(),
  tx: Pick<ReturnType<typeof db>, 'insert'> = db(),
): Promise<Award> {
  if (event.kind === 'loss') return { credited: 0, earned: 0, cappedAt: null };

  /**
   * **The entitlement, read here, in the income path** (011 T046, T049).
   *
   * This call is the whole of Phase 8. `entitlementFor` existed, was correct and
   * was tested, and **nothing outside `payments/` had ever called it** — so a
   * purchased pass granted a row, sent a receipt, and paid exactly normal
   * income. The store took the money and appeared to work, which is the worst
   * shape of the seam-with-no-caller defect this project keeps shipping: the
   * other instances were loud.
   *
   * `boostedSoFar` counts the same kind of event, so ten attack wins do not
   * consume the defense allowance — the storefront table states the two caps
   * separately.
   */
  const [priorVictories, boostedSoFar, held, starter, room] = await Promise.all([
    event.kind === 'attack-victory' ? victoriesToday(accountId, now) : Promise.resolve(0),
    event.kind === 'attack-victory'
      ? victoriesToday(accountId, now)
      : holdsToday(accountId, now),
    entitlementFor(accountId, 'boost-pass', now),
    starterIncomeMultiplier(accountId),
    headroom(accountId),
  ]);

  /**
   * **The first ten of each kind, and the pass must be live at this instant.**
   *
   * `boostedSoFar` is how many have already been paid today, so the event being
   * paid is number `boostedSoFar + 1` — boosted while that is within the cap.
   */
  const boosted = held.active && boostedSoFar < BOOSTED_EVENTS_PER_DAY;

  const earned = payoutFor(event, priorVictories + 1, starter, boosted);

  /**
   * **The cap truncates rather than refuses.** A player 30 shards from the cap
   * winning a 60-shard ambush is credited 30, not 0 and not 60 — the balance
   * lands exactly on the cap. Refusing the whole payout would make the last
   * victory before the cap worth less than the one before it, which reads as a
   * bug from inside the game.
   */
  const credited = Math.max(0, Math.min(earned, room));
  if (credited === 0) return { credited: 0, earned, cappedAt: 0 };

  await append(accountId, credited, event.kind as LedgerReason, battleId, tx);

  return { credited, earned, cappedAt: credited < earned ? credited : null };
}

// ---------------------------------------------------------------------------
// The streak reward (2026-08-01)
// ---------------------------------------------------------------------------

/**
 * What a win at this streak pays **on top of** the ordinary award.
 *
 * Pure and flat: it is added beside the victory, never folded into
 * `payoutFor`'s product. Two reasons, and the first is the load-bearing one.
 *
 * **The multiplier chain must stay a chain.** `income.ts` records that Hidden ×
 * daily × starter × boost composes into 011's advertised ×4 *"and nothing
 * special-cases it"*. A streak term inside that product would be multiplied by
 * the boost pass and by the Hidden double, so a boosted ambush at streak 300
 * would pay **+800** rather than +200 — a number nobody chose, arrived at by
 * composition.
 *
 * **And a bonus is not a rate.** The daily curve exists to pace grinding; the
 * streak tail rewards a thing that is hard *because* it is fragile. Tapering it
 * by the same curve would mean the twenty-first win of the day both earns the
 * most streak and is paid half of it.
 *
 * `streak` is the streak **after** the win being paid — the number the player is
 * shown.
 */
export function streakBonusFor(streak: number): number {
  return Math.max(0, streak - STREAK_BONUS_THRESHOLD);
}

/**
 * What a defense is paid for **ending** a streak: the whole of it.
 *
 * No threshold. `06-progression.md` states the asymmetry plainly — the attacker
 * is paid only for the tail past 100, and the defender is paid the entire run.
 * A defender does not choose who attacks them, so gating the bounty would make
 * the common case (a short streak) pay nothing for the same work.
 *
 * Takes the streak **as it stood before the loss**, which is why the caller must
 * read the row before writing the reset and not after.
 */
export function streakBountyFor(brokenStreak: number): number {
  return Math.max(0, brokenStreak);
}

/**
 * Credit a flat streak reward, under the same cap as everything else.
 *
 * **Not `awardShards`**, because that function's whole body is the multiplier
 * chain and the daily tier lookup, neither of which applies here. Sharing it
 * would mean threading a "skip the multipliers" flag through it — a branch that
 * makes the chain conditional is exactly what its header warns against.
 *
 * What *is* shared is the part that must be: `headroom` and `append`, so a bonus
 * cannot push a balance past the ceiling and every shard still lands in the one
 * ledger.
 */
export async function awardStreakReward(
  accountId: string,
  amount: number,
  reason: Extract<LedgerReason, 'streak-bonus' | 'streak-broken'>,
  battleId: string | null = null,
  tx: Pick<ReturnType<typeof db>, 'insert'> = db(),
): Promise<Award> {
  if (amount <= 0) return { credited: 0, earned: 0, cappedAt: null };

  const room = await headroom(accountId);
  const credited = Math.max(0, Math.min(amount, room));
  if (credited === 0) return { credited: 0, earned: amount, cappedAt: 0 };

  await append(accountId, credited, reason, battleId, tx);

  return { credited, earned: amount, cappedAt: credited < amount ? credited : null };
}
