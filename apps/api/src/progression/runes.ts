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
import { FULL_RUNE_COST } from './config.js';
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
  const hero = getHero(heroId);
  if (slot === 'primary') return hero.primary;
  if (slot === 'secondary') return hero.secondary;
  return null;
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
 * ### There is deliberately no refund path
 *
 * Commitment is the mechanic. Destruction on replacement is why a balance change
 * writes off real spend, which is the origin of the balance-upward rule
 * (Constitution XIV) — a refund would quietly undo the thing the rest of the
 * design is built around.
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
