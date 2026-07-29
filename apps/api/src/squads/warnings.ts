/**
 * Non-blocking warnings on a defense save (T050).
 *
 * **`warnings` never blocks** (Constitution XVIII: harm is a gate, taste is a
 * note). Both of these are *taste*: a reach-1 champion in the back seat is a
 * priced decision, and a self-defeating power ranking is a lever. Neither harms
 * anybody, and both are recoverable by reopening a dropdown.
 *
 * The single thing this feature blocks is **eviction**, which is destructive and
 * non-obvious because the squads it breaks are not the one on screen.
 *
 * The distinction matters because the tempting move is to make these `422`s —
 * they *look* like mistakes. Blocking them would make the builder refuse
 * legitimate strategy: a reach-1 back seat is how you protect a fragile
 * high-damage champion, and it is a real choice with a real cost.
 */

import { getHero, type Hero } from '@lmntlz/content';
import { SWEEP_TURNS, firingProfile } from '@lmntlz/sim/rules';
import type { Seat } from '@lmntlz/sim/rules';
import type { SeatConfig } from './canonical.js';

export interface SquadWarning {
  readonly code: 'reach-1-back-seat' | 'power-never-fires';
  readonly heroId: string;
  readonly message: string;
  /** Present on `power-never-fires` — which tiers are dead under this ranking. */
  readonly tiers?: number[];
}

/**
 * **A reach-1 champion in the back seat cannot attack from there.**
 *
 * Reach is measured in rows on one shared 1–6 axis and a champion's own row
 * counts against it, so from row 3 (the back) a reach of 1 does not reach row 4
 * — the enemy front. Empty rows are skipped, so range opens up as a battle wears
 * on; that is why this is a warning and not a rule. She may do nothing for
 * several turns and then matter.
 */
function reachWarning(hero: Hero, seat: Seat): SquadWarning | null {
  if (seat.row !== 'back' || hero.reach > 1) return null;
  return {
    code: 'reach-1-back-seat',
    heroId: hero.id,
    message: `${hero.name} has reach 1 in the back seat. She cannot attack until the rows in front of her empty.`,
  };
}

/**
 * **Which powers this ranking switches off entirely.**
 *
 * A power fires only when everything ranked above it is on cooldown, and the
 * tier-0 auto-attack has cooldown 0 with no gate — so anything ranked below it
 * never fires **at any horizon**. The player cannot see that from the widget;
 * the widget shows an order, and the consequence is arithmetic over the cooldown
 * ladder.
 *
 * ### Measured at `SWEEP_TURNS`, and that is the whole correctness of this
 *
 * The obvious implementation asks `firingProfile(hero, ranking, BATTLE_TURNS)`
 * and warns on `fires === 0` — the same 9-turn horizon the builder *displays*.
 * It is wrong, and measurably so:
 *
 * ```
 * 5·4·3·2·1·0   a RECOMMENDED ordering   @ 9 turns: 21/27 heroes "dead"
 *                                        @60 turns:  0/27
 * 1·2·3·4·5·0   self-defeating           @ 9 turns: 27/27, 81 dead powers
 *                                        @60 turns: 27/27, 81 dead powers
 * ```
 *
 * A warning that fires on **21 of 27 champions using the game's own recommended
 * ranking** is not a warning, it is noise — and the first thing a player learns
 * is to ignore it, including the six times a year it means something.
 *
 * The two cases are genuinely different and only one is a mistake:
 *
 * - fires at 60 but not at 9 → the power is **slow**. It is a real cost and the
 *   builder shows it as a count, but the player has not switched anything off.
 * - fires at neither → the ranking has **switched it off**, permanently, and no
 *   battle length recovers it.
 *
 * So the display uses 9 turns (FR-022 — the number on screen must describe the
 * game the player is about to play) and this warning uses 60. They answer
 * different questions.
 */
function rankingWarning(hero: Hero, config: SeatConfig): SquadWarning | null {
  const profile = firingProfile(hero, config.powerRanking as never, SWEEP_TURNS);
  const dead = profile.filter((entry) => entry.fires === 0);
  if (dead.length === 0) return null;

  const tiers = [...new Set(dead.map((entry) => entry.tier))].sort((a, b) => a - b);
  const list =
    tiers.length === 1 ? `tier ${tiers[0]}` : `tiers ${tiers.slice(0, -1).join(', ')} and ${tiers.at(-1)}`;

  return {
    code: 'power-never-fires',
    heroId: hero.id,
    tiers,
    message: `Under this ranking, ${hero.name}'s ${list} ${tiers.length === 1 ? 'power' : 'powers'} never fire at all — everything above ${tiers.length === 1 ? 'it' : 'them'} is available too often.`,
  };
}

/** Every warning for a saved defense squad. **Order is seat order**, so the
 *  client can render them beside the rows they belong to. */
export function warningsFor(
  seats: readonly Seat[],
  configs: ReadonlyMap<string, SeatConfig>,
): SquadWarning[] {
  const out: SquadWarning[] = [];

  for (const seat of seats) {
    const hero = getHero(seat.heroId);

    const reach = reachWarning(hero, seat);
    if (reach) out.push(reach);

    const config = configs.get(seat.heroId);
    if (config && config.powerRanking.length === 6) {
      const ranking = rankingWarning(hero, config);
      if (ranking) out.push(ranking);
    }
  }

  return out;
}
