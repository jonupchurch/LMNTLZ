/**
 * `GET /v1/me/runes` — **what the owner is allowed to see** (018 T006).
 *
 * ### Nothing has ever read a rune back
 *
 * `POST /v1/heroes/:heroId/runes/:slot` commits a stage, `gearScore.ts` sums
 * them for matchmaking, and the ledger records what was spent. **No response in
 * the API has ever returned a player their own rune state.** Feature 010 was
 * closed, tested and deployed as a write-only resource, which is the
 * seam-with-no-caller defect wearing a CRUD costume: every gate was green
 * because every gate was about writing.
 *
 * The Forge cannot exist without this. A player choosing where to spend 150
 * shards needs to know which slot already holds what, at what stage, allocating
 * which stats — none of which is anywhere.
 *
 * ### This file shares no code with `squads/scoutSerializer.ts`, on purpose
 *
 * Constitution XVII. The scout view already returns runes and returns them
 * *deliberately incomplete* — `{ element, stages }`, because **which stat a rune
 * boosts is the thing an opponent must not learn**. This returns the
 * allocations. Two serialisers, two audiences, two rules.
 *
 * The tempting alternative is one function with an `includeAllocations` flag.
 * It would be shorter and it would be wrong: a boolean that defaults wrong
 * exactly once publishes every player's build to everyone who scouts them, and
 * the failure is silent — the response still validates, the screen still
 * renders, and nobody finds out until somebody notices their counters are being
 * pre-empted. **`tests/squads/scoutBoundary.test.ts` asserts the scout response
 * still omits `allocations` after this route ships**, which is the check that
 * only means something because these are two files.
 *
 * ### Every hero comes back, including the bare ones
 *
 * 27 heroes × 3 slots is small, and the Forge's *ALL 27 · OPEN · BARE* filter is
 * then a client-side view of one complete list rather than three requests that
 * can disagree with each other. **`stage: 0` means empty** — not that a stage
 * zero exists.
 */

import { eq } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import { db } from '../db/client.js';
import {
  RUNE_SLOTS,
  STAGE_COSTS,
  runes,
  type RuneAllocations,
  type RuneSlot,
} from '../db/schema/runes.js';
import { slotAccepts } from './runes.js';

export interface OwnedRuneSlot {
  readonly slot: RuneSlot;
  /**
   * The damage type this slot accepts — `null` for `common`, which takes any.
   *
   * **Derived from the hero here too**, by the same `slotAccepts` the write path
   * uses. Storing it on the row would be a second source for a value that comes
   * off two authored fields (Constitution XV).
   */
  readonly element: string | null;
  /** `0..4`. **`0` is empty.** */
  readonly stage: number;
  /** The whole point of this route. Absent from every opponent-facing view. */
  readonly allocations: RuneAllocations;
  /** Stage 4 only; `null` below it, because the slot is gated behind all three. */
  readonly utility: string | null;
  /** Shards committed to this slot, **summed from the stage costs, not stored**. */
  readonly spent: number;
}

export interface OwnedHeroRunes {
  readonly heroId: string;
  readonly slots: readonly OwnedRuneSlot[];
}

/**
 * What stages 1..`stage` cost in total.
 *
 * Derived rather than read from the ledger. The ledger is the authority on a
 * *balance* and it records reasons rather than slots, so attributing a debit to
 * one of 81 slots would mean parsing a reason string — and `STAGE_COSTS` is the
 * same array the charge was computed from, so the two cannot disagree.
 */
export function spentThroughStage(stage: number): number {
  let total = 0;
  for (let s = 1; s <= stage; s += 1) total += STAGE_COSTS[s - 1] ?? 0;
  return total;
}

export async function ownedRunes(accountId: string): Promise<readonly OwnedHeroRunes[]> {
  const rows = await db().select().from(runes).where(eq(runes.accountId, accountId));

  /** Keyed by `heroId:slot` so the join below is a lookup, not a scan per slot. */
  const placed = new Map(rows.map((r) => [`${r.heroId}:${r.slot}`, r]));

  return getAllHeroes().map((hero) => ({
    heroId: hero.id,
    slots: RUNE_SLOTS.map((slot): OwnedRuneSlot => {
      const row = placed.get(`${hero.id}:${slot}`);

      return {
        slot,
        element: slotAccepts(hero.id, slot),
        /* An absent row is `stage: 0`. There is no 404 anywhere in this route:
           a player always has 27 heroes and an empty slot is a state, not a
           missing thing. */
        stage: row?.stage ?? 0,
        allocations: row?.allocations ?? {},
        /**
         * **Gated on the stage, not only on the column.** A `utilityEffect`
         * written at stage 3 by a future bug would be a rule leaking through a
         * serialiser; below stage 4 this reports `null` whatever the row says.
         */
        utility: row && row.stage >= 4 ? row.utilityEffect : null,
        spent: spentThroughStage(row?.stage ?? 0),
      };
    }),
  }));
}
