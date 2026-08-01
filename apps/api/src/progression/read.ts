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
import { getAllHeroes, type StatKey } from '@lmntlz/content';
import { db } from '../db/client.js';
import { RUNE_SLOTS, runes, type RuneAllocations, type RuneSlot } from '../db/schema/runes.js';
import { slotAccepts, spentThroughStage } from './runes.js';
import type { RuneLoadout } from '../battle/board.js';

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
 * What every champion's runes are worth in a **battle**, keyed by hero id.
 *
 * ### Why this is not `ownedRunes`
 *
 * `ownedRunes` answers the Forge's question — three slots, what is in each,
 * what it cost. A battle asks a different one: *one number per stat, and which
 * effects are live*. Slots are a purchase boundary, not a combat one, so the
 * three are summed here and the engine never learns that a slot existed.
 *
 * Deriving it from `ownedRunes` rather than querying again keeps one read path
 * for `stage` — the field that, when it had two, shipped `stages: 0` to every
 * scouted opponent for two months.
 *
 * ### Only heroes with something to contribute appear
 *
 * A hero with three empty slots is absent rather than present-with-zeroes.
 * `board.ts` treats an absent loadout as none, so the two agree, and a battle
 * snapshot does not carry 27 empty objects into permanent storage.
 *
 * **Stage 4 grants no points and is not skipped**: it contributes the utility
 * effect, which is the whole reason it costs 200 and grants nothing.
 */
export async function runeLoadouts(accountId: string): Promise<ReadonlyMap<string, RuneLoadout>> {
  const owned = await ownedRunes(accountId);
  const out = new Map<string, RuneLoadout>();

  for (const hero of owned) {
    const statPoints: Partial<Record<StatKey, number>> = {};
    const utility: string[] = [];

    for (const slot of hero.slots) {
      for (const [stat, amount] of Object.entries(slot.allocations)) {
        if (typeof amount !== 'number') continue;
        statPoints[stat as StatKey] = (statPoints[stat as StatKey] ?? 0) + amount;
      }
      if (slot.utility) utility.push(slot.utility);
    }

    if (Object.keys(statPoints).length === 0 && utility.length === 0) continue;
    out.set(hero.heroId, { statPoints, utility });
  }

  return out;
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
