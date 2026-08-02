/**
 * Reach — the one targeting rule, applied identically to enemies and allies.
 *
 * **Distance is the count of *occupied* rows crossed**, so it shrinks as heroes
 * fall. That is the mechanic, not an optimization: a losing position hands the
 * back seat a job it did not have at full formation.
 */

import { getHero } from '@lmntlz/content';
import {
  heroStateOf,
  isRowOccupied,
  type BattleState,
  type Row,
} from './state.js';
import { reachBonusOf } from './status.js';

/**
 * Occupied rows crossed, **including the target's row and excluding the actor's
 * own** (FR-005, FR-006). An empty row counts zero.
 *
 * At full formation row 1 → row 4 is distance **3** — rows 2, 3 and 4 all
 * occupied — so the back seat cannot attack. That is priced, not a bug.
 * Empty the attacker's row 3 and the same shot becomes distance **2**.
 *
 * Symmetric: `distance(a, b) === distance(b, a)` whenever both endpoints stand,
 * because "excluding the actor's own row" and "including the target's" cancel.
 */
export function distance(state: BattleState, from: Row, to: Row): number {
  if (from === to) return 0;

  const step = to > from ? 1 : -1;
  let crossed = 0;

  for (let row = from + step; ; row += step) {
    if (isRowOccupied(state, row as Row)) crossed++;
    if (row === to) break;
  }

  return crossed;
}

/**
 * `distance ≤ hero.reach + reachMod + any reach effect` (FR-007).
 *
 * **Never bounded by a constant.** Feature 004 carries FR-020 specifically for
 * this: a reach-2 front-seat hero with a `+1` reach rune sees *three* enemy
 * rows, not two. An implementation that wrote `Math.min(reach + mod, 2)` would
 * look defensive and quietly delete the rune.
 *
 * The three terms are three different things and stay three: what the champion
 * **is** (`hero.reach`), what its owner **bought** (`reachMod`, permanent), and
 * what the battle **granted** (`Out of Reach`, one turn at a time). Folding the
 * third into the second would put a passive's grant in the field a rune owns —
 * the same collision `statMods` already carries a warning about.
 */
export function inReach(state: BattleState, actorInstanceId: string, targetRow: Row): boolean {
  const actor = heroStateOf(state, actorInstanceId);
  const reach = getHero(actor.heroId).reach + actor.reachMod + reachBonusOf(actor);

  return distance(state, actor.row, targetRow) <= reach;
}

/** Every row the actor can currently touch, on either side. */
export function rowsInReach(state: BattleState, actorInstanceId: string): readonly Row[] {
  const rows: Row[] = [];
  for (const row of [1, 2, 3, 4, 5, 6] as const) {
    if (inReach(state, actorInstanceId, row)) rows.push(row);
  }
  return rows;
}
