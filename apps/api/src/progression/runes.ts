/**
 * Rune placement and replacement (010 T013–T016, T022–T025).
 *
 * **Planning is free; committing is permanent.** A player may arrange any
 * allocation they like at no cost — `plan()` is pure and touches nothing — and
 * pays only when a stage is committed. That asymmetry is deliberate:
 * `06-progression.md` makes deliberation *correct play*, because a rune is
 * destroyed when it is replaced.
 *
 * ### The 75 cap is the only constraint on allocation
 *
 * The three boosts (+20 · +10 · +5) may all stack on one stat. Nothing here
 * restricts the split beyond `STAT_CAP`, and that permissiveness is the feature:
 * 35 points on one stat lands on **57 exact fills** across the roster — a stat
 * taken precisely to 75 — and hitting one is the most satisfying thing a rune
 * does (FR-007, SC-008). Constitution XVIII applies directly: **harm is a gate,
 * taste is a note.** A bad allocation is the player's to make.
 *
 * ### Stage 4 buys no points, and that is what makes the gate economic
 *
 * Stages 1–3 cost 150 each and grant +20, +10, +5. Stage 4 costs **200 and grants
 * no stat points at all** — it unlocks a utility effect. So the utility slot is a
 * bad buy early, while the roster still has obvious fills, and a good buy late,
 * once the 75 cap has absorbed everything the boosts can give. **The stage gate
 * justifies itself economically rather than by a rule** (FR-006, FR-011).
 */

import { and, eq } from 'drizzle-orm';
import { getHero, STAT_CAP, STAT_KEYS, type StatKey } from '@lmntlz/content';
import { poolOf } from '@lmntlz/sim/rules';
import { db } from '../db/client.js';
import {
  MAX_STAGE,
  RUNE_SLOTS,
  STAGE_BOOSTS,
  STAGE_COSTS,
  runes,
  type RuneAllocations,
  type RuneRow,
  type RuneSlot,
} from '../db/schema/runes.js';
import { FULL_RUNE_COST, REFUND_RATE } from './config.js';
import { append, balance } from './ledger.js';
import {
  recordPlacement,
  type RuneSource,
  type Transactional,
} from '../matchmaking/gearScore.js';

export class RuneError extends Error {
  constructor(
    readonly code: 'insufficient-shards' | 'needs-confirmation' | 'slot-mismatch' | 'cap-exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'RuneError';
  }
}

/**
 * Which damage type a slot accepts on a given hero. `common` accepts anything.
 *
 * **Derived from the hero, never stored on the rune.** A hero's `primary` and
 * `secondary` are the two authored fields the whole relationship profile comes
 * from (Constitution XV); copying either onto a rune row would create a second
 * source for a value that is already derived, and one that goes stale the moment
 * a hero is re-authored.
 */
export function slotAccepts(heroId: string, slot: RuneSlot): string | null {
  /**
   * **Delegates to the engine rather than deriving it again (021).**
   *
   * This function and `poolOf` in `packages/sim/rules/runeEffects.ts` answered the
   * same question — *which element does this slot accept* — from the same two
   * authored fields, in two places. That is the drift this repo keeps producing,
   * and here it would have been load-bearing: the Forge offers a pool from the
   * engine's answer while the server validates against this one, so any
   * disagreement is a purchase the client offers and the server refuses.
   *
   * The `null`-means-common shape is kept because 010's callers and its JSON
   * responses are written against it; only the derivation moved.
   */
  const pool = poolOf(heroId, slot);
  return pool === 'common' ? null : pool;
}

/** The stat points a rune at `stage` has granted in total — `20 + 10 + 5` by stage 3. */
export function pointsThroughStage(stage: number): number {
  /**
   * `reduce<number>` rather than bare `reduce`. `STAGE_BOOSTS` is `as const`, so
   * its element type is the literal union `0 | 5 | 10 | 20` — and because the seed
   * `0` is *itself* a member of that union, TypeScript picks the same-type overload
   * and then rejects the sum. `STAGE_COSTS` has the identical shape and compiles
   * only because `0` is not one of `150 | 200`.
   */
  return STAGE_BOOSTS.slice(0, stage).reduce<number>((sum, boost) => sum + boost, 0);
}

/** What advancing from `stage` to `stage + 1` costs. */
export function costOfStage(stage: number): number {
  return STAGE_COSTS[stage - 1] ?? 0;
}

/**
 * What stages 1..`stage` cost in total.
 *
 * Derived rather than read from the ledger. The ledger is the authority on a
 * *balance* and it records reasons rather than slots, so attributing a debit to
 * one of 81 slots would mean parsing a reason string — and `STAGE_COSTS` is the
 * same array the charge was computed from, so the two cannot disagree.
 *
 * **Moved here from `read.ts` when the refund arrived.** `read.ts` already
 * imports `slotAccepts` from this file, so a refund reaching backwards for it
 * would have closed an import cycle — and it belongs beside `costOfStage` and
 * `pointsThroughStage` regardless: all three answer *what does a stage cost or
 * grant*, from the same two arrays.
 */
export function spentThroughStage(stage: number): number {
  let total = 0;
  for (let s = 1; s <= stage; s += 1) total += STAGE_COSTS[s - 1] ?? 0;
  return total;
}

/**
 * Validate an allocation against the hero's base stats and the 75 cap (FR-012).
 *
 * Returns the offending stat rather than a boolean, so the refusal can name it —
 * *"Might is already 70; +20 would exceed the 75 cap by 15"* is actionable and
 * "invalid allocation" is not.
 */
export function capViolation(
  heroId: string,
  allocations: RuneAllocations,
): { readonly stat: StatKey; readonly would: number } | null {
  const hero = getHero(heroId);

  for (const stat of STAT_KEYS) {
    const added = allocations[stat] ?? 0;
    if (added === 0) continue;

    const would = hero.stats[stat] + added;
    if (would > STAT_CAP) return { stat, would };
  }

  return null;
}

/**
 * Check that an allocation spends **exactly** the points the stage grants.
 *
 * Under-spending would silently forfeit points a player paid 150 shards for;
 * over-spending is the obvious exploit. Both are refused, and neither is a
 * judgment about *which* stats — that stays entirely the player's.
 */
export function pointsMisallocated(stage: number, allocations: RuneAllocations): number | null {
  const granted = STAGE_BOOSTS[stage - 1] ?? 0;
  const spent = STAT_KEYS.reduce((sum, stat) => sum + (allocations[stat] ?? 0), 0);
  return spent === granted ? null : granted;
}

/** Every rune this account currently has placed. */
export async function placedRunes(
  accountId: string,
  tx?: Transactional,
): Promise<readonly RuneRow[]> {
  return (tx ?? db()).select().from(runes).where(eq(runes.accountId, accountId));
}

/**
 * Total stat points across every rune the account **currently has placed** — the
 * real implementation of 009's `RuneSource`, which has answered `null` for
 * everybody since the day it was written.
 *
 * > **Placed, not spent.** 009's interface refuses to expose lifetime investment
 * > on purpose, and this is why: ten rebuilds of one slot is 6,500 shards spent
 * > for **125 of gear score, not 1,250**. A player cannot buy their way into a
 * > higher league by churning runes.
 */
export async function placedStatPoints(
  accountId: string,
  tx?: Transactional,
): Promise<number> {
  const rows = await placedRunes(accountId, tx);
  return rows.reduce((sum, rune) => sum + pointsThroughStage(rune.stage), 0);
}

/**
 * The real `RuneSource` — install it once at startup so `gearScore()` stops
 * answering the 1,500 starter grant for everybody.
 *
 * **009 wrote the seam and left it empty on purpose**, because a source that could
 * report lifetime spend is a source somebody scores by accident. This fills it
 * with the only thing it was ever allowed to answer: points currently placed.
 */
export const runeSource: RuneSource = {
  placedStatPoints: (accountId, tx) => placedStatPoints(accountId, tx),
};

async function runeAt(
  accountId: string,
  heroId: string,
  slot: RuneSlot,
): Promise<RuneRow | undefined> {
  const [row] = await db()
    .select()
    .from(runes)
    .where(and(eq(runes.accountId, accountId), eq(runes.heroId, heroId), eq(runes.slot, slot)))
    .limit(1);

  return row;
}

/** Merge a stage's new points into the running allocation. */
function merged(existing: RuneAllocations, addition: RuneAllocations): RuneAllocations {
  const next: RuneAllocations = { ...existing };
  for (const stat of STAT_KEYS) {
    const add = addition[stat] ?? 0;
    if (add !== 0) next[stat] = (next[stat] ?? 0) + add;
  }
  return next;
}

export interface PlaceResult {
  readonly stage: number;
  readonly charged: number;
  readonly balance: number;
  readonly gearScore: number;
}

/**
 * Commit one stage — creating the rune at stage 1, or advancing an existing one.
 *
 * **One transaction: charge, write, rescore.** The gear-score recompute is
 * *inside* it (T023), and that placement is load-bearing rather than tidy: a
 * recompute outside the transaction is exactly the window feature 009 exists to
 * close — *"no window between deploying a month of shards and the league noticing"*.
 * Between the two statements a player would hold the runes and the old league.
 */
export async function placeStage(
  accountId: string,
  heroId: string,
  slot: RuneSlot,
  allocations: RuneAllocations,
): Promise<PlaceResult> {
  if (!RUNE_SLOTS.includes(slot)) {
    throw new RuneError('slot-mismatch', `No such rune slot: ${slot}.`);
  }

  const existing = await runeAt(accountId, heroId, slot);
  const nextStage = existing ? existing.stage + 1 : 1;

  if (nextStage > MAX_STAGE) {
    throw new RuneError(
      'needs-confirmation',
      `That rune is already complete. Replacing it destroys all four stages — use a rebuild.`,
    );
  }

  const cost = costOfStage(nextStage);
  const current = await balance(accountId);
  if (current < cost) {
    throw new RuneError(
      'insufficient-shards',
      `That stage costs ${cost} shards; the balance is ${current}.`,
    );
  }

  /** Stage 4 grants no points, so it carries no allocation to validate. */
  if (nextStage < MAX_STAGE) {
    const misallocated = pointsMisallocated(nextStage, allocations);
    if (misallocated !== null) {
      throw new RuneError(
        'slot-mismatch',
        `Stage ${nextStage} grants exactly ${misallocated} points; the allocation spends a different total.`,
      );
    }

    const combined = merged(existing?.allocations ?? {}, allocations);
    const violation = capViolation(heroId, combined);
    if (violation) {
      throw new RuneError(
        'cap-exceeded',
        `${violation.stat} would reach ${violation.would}, past the ${STAT_CAP} cap.`,
      );
    }
  }

  return db().transaction(async (tx) => {
    await append(accountId, -cost, 'rune-stage', null, tx);

    if (existing) {
      await tx
        .update(runes)
        .set({
          stage: nextStage,
          allocations: merged(existing.allocations, allocations),
          updatedAt: new Date(),
        })
        .where(eq(runes.id, existing.id));
    } else {
      await tx.insert(runes).values({ accountId, heroId, slot, stage: 1, allocations });
    }

    /** Inside the transaction, and reading through `tx` so it sees the write above. */
    const gearScore = await recordPlacement(accountId, tx);

    return { stage: nextStage, charged: cost, balance: current - cost, gearScore };
  });
}

/**
 * Destroy a completed rune and start a new one in its place — **one transaction
 * with one charge of `FULL_RUNE_COST`** (T022, FR-008).
 *
 * ### A rebuild still refunds nothing, and that is now a narrower claim
 *
 * ⚠️ **Reversed 2026-08-01.** This used to read *"there is deliberately no refund
 * path"*. There is one — `refundHero` below — and it returns `REFUND_RATE` of a
 * hero's whole rune investment. What is unchanged is *this* operation: a rebuild
 * of one slot is still a full charge with nothing back, because it is the
 * *impatient* path. A player who wants the shards returns them all and starts the
 * hero over.
 *
 * The confirm is not boilerplate: it must name that the old rune is gone
 * **including its utility effect**, and that the new one is **not necessarily an
 * upgrade** (SC-007). A player who did not understand that has not consented to
 * it.
 */
export async function rebuildRune(
  accountId: string,
  heroId: string,
  slot: RuneSlot,
  allocations: RuneAllocations,
  confirmed: boolean,
): Promise<PlaceResult> {
  const existing = await runeAt(accountId, heroId, slot);
  if (!existing) {
    throw new RuneError('slot-mismatch', 'There is no rune in that slot to rebuild.');
  }
  if (!confirmed) {
    throw new RuneError(
      'needs-confirmation',
      'A rebuild destroys the existing rune and all four stages, including its utility effect. The replacement is not necessarily an upgrade.',
    );
  }

  const current = await balance(accountId);
  if (current < FULL_RUNE_COST) {
    throw new RuneError(
      'insufficient-shards',
      `A rebuild costs ${FULL_RUNE_COST} shards; the balance is ${current}.`,
    );
  }

  /**
   * **A rebuild produces a complete rune, so its whole allocation is chosen up
   * front.** The charge is a full 650 and the result is stage 4, which has granted
   * all `20 + 10 + 5` points — so an allocation spending less would create a rune
   * whose stage claims points its allocation never placed, and `placedStatPoints`
   * would score the difference out of thin air.
   */
  const total = STAT_KEYS.reduce((sum, stat) => sum + (allocations[stat] ?? 0), 0);
  const required = pointsThroughStage(MAX_STAGE);
  if (total !== required) {
    throw new RuneError(
      'slot-mismatch',
      `A rebuilt rune is complete and places all ${required} points at once; this allocation spends ${total}.`,
    );
  }

  const violation = capViolation(heroId, allocations);
  if (violation) {
    throw new RuneError(
      'cap-exceeded',
      `${violation.stat} would reach ${violation.would}, past the ${STAT_CAP} cap.`,
    );
  }

  return db().transaction(async (tx) => {
    await append(accountId, -FULL_RUNE_COST, 'rune-rebuild', null, tx);

    await tx.delete(runes).where(eq(runes.id, existing.id));
    await tx.insert(runes).values({
      accountId,
      heroId,
      slot,
      stage: MAX_STAGE,
      allocations,
      utilityEffect: null,
    });

    const gearScore = await recordPlacement(accountId, tx);
    return {
      stage: MAX_STAGE,
      charged: FULL_RUNE_COST,
      balance: current - FULL_RUNE_COST,
      gearScore,
    };
  });
}

/**
 * What a hero's runes are worth back, and what they hold right now.
 *
 * Returned by the refusal path as well as the success path, so the confirm
 * dialog can name every rune it is about to destroy rather than a total.
 */
export interface RefundQuote {
  readonly heroId: string;
  /** One entry per placed rune, in `RUNE_SLOTS` order. Empty slots are absent. */
  readonly slots: readonly {
    readonly slot: RuneSlot;
    readonly stage: number;
    readonly value: number;
    readonly allocations: RuneAllocations;
    readonly utility: string | null;
  }[];
  /** Sum of `value` — what was actually paid for what is currently placed. */
  readonly invested: number;
  /** `floor(invested × REFUND_RATE)`. */
  readonly refund: number;
  readonly rate: number;
}

/**
 * Quote a refund without touching anything.
 *
 * **Valued at the CURRENT stage, never at lifetime spend on the slot.** A slot
 * rebuilt three times cost 650 × 3 and is worth one rune; refunding lifetime
 * spend would pay a player back for value that was already destroyed, and would
 * turn rebuild-then-refund into a way to print shards. `runes.ts`'s schema note
 * refuses to store spend per rune for the neighbouring reason — *"a source that
 * could report spend is a source somebody scores by accident"* — so the current
 * stage is both the right answer and the only one available.
 */
export async function quoteRefund(accountId: string, heroId: string): Promise<RefundQuote> {
  getHero(heroId); // 404s an unknown hero before anything else is read.

  const rows = await db()
    .select()
    .from(runes)
    .where(and(eq(runes.accountId, accountId), eq(runes.heroId, heroId)));

  const order = new Map(RUNE_SLOTS.map((slot, at) => [slot, at]));
  const placed = rows
    .filter((row): row is RuneRow & { slot: RuneSlot } => order.has(row.slot as RuneSlot))
    .sort((a, b) => (order.get(a.slot) ?? 0) - (order.get(b.slot) ?? 0))
    .map((row) => ({
      slot: row.slot,
      stage: row.stage,
      value: spentThroughStage(row.stage),
      allocations: row.allocations,
      utility: row.stage >= MAX_STAGE ? row.utilityEffect : null,
    }));

  const invested = placed.reduce((sum, r) => sum + r.value, 0);

  return {
    heroId,
    slots: placed,
    invested,
    /* `floor`, so rounding never invents a shard. Every stage total is a
       multiple of 50 and 0.8 of it is whole, but the rate is a tuning dial and
       the next value chosen will not be. */
    refund: Math.floor(invested * REFUND_RATE),
    rate: REFUND_RATE,
  };
}

export interface RefundResult extends RefundQuote {
  readonly balance: number;
  readonly gearScore: number;
  /** How many runes were destroyed. `slots.length`, stated so a caller need not count. */
  readonly destroyed: number;
}

/**
 * **Melt every rune on one hero for `REFUND_RATE` of what is placed** (2026-08-01).
 *
 * ### All three slots or none
 *
 * `06-progression.md` forbids piecemeal editing — a player cannot reclaim the
 * trace boost and keep the major — and that prohibition is **not** what was
 * reversed here. A per-slot refund would be exactly it, one level up: melt the
 * common slot, keep the primary, and the hero is re-specced for 20%. Taking the
 * whole hero keeps the unit of commitment a *hero* rather than a component.
 *
 * ### The credit bypasses the balance cap, deliberately
 *
 * It is the player's own spend coming back. Capping it would confiscate shards
 * already paid, from exactly the heavily-invested players who are the only ones
 * with runes worth melting — the same asymmetry, and the same argument, that
 * `cap.ts` records for grants.
 *
 * ### Confirm-gated like a rebuild, and for a stronger reason
 *
 * A rebuild destroys one rune; this destroys up to three, including their
 * utility effects, and the refusal carries the full quote so the dialog can name
 * each one. A player who has not seen the list has not consented to it.
 */
export async function refundHero(
  accountId: string,
  heroId: string,
  confirmed: boolean,
): Promise<RefundResult> {
  const quote = await quoteRefund(accountId, heroId);

  if (quote.slots.length === 0) {
    throw new RuneError('slot-mismatch', 'That champion has no runes to refund.');
  }

  if (!confirmed) {
    throw new RuneError(
      'needs-confirmation',
      `Refunding destroys all ${quote.slots.length} of this champion's runes, including any utility effects, and returns ${quote.refund} of the ${quote.invested} placed. It cannot be undone.`,
    );
  }

  /* Read BEFORE the transaction, as `rebuildRune` does. `balance()` runs on
     `db()` rather than `tx`, so calling it inside would not see the credit just
     appended — the arithmetic would look right and depend on that. */
  const current = await balance(accountId);

  return db().transaction(async (tx) => {
    /* Credited, then the runes go — one transaction, so a failure between the
       two cannot leave a player paid for runes they still hold. */
    await append(accountId, quote.refund, 'rune-refund', null, tx);
    await tx.delete(runes).where(and(eq(runes.accountId, accountId), eq(runes.heroId, heroId)));

    const gearScore = await recordPlacement(accountId, tx);

    return {
      ...quote,
      destroyed: quote.slots.length,
      balance: current + quote.refund,
      gearScore,
    };
  });
}
