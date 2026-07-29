/**
 * What "edited" means, for the hold streak (006 T009–T010, research.md Q1).
 *
 * A defense squad's hold streak is public and it is worth something, so the
 * question *"did the player change their squad?"* has to have one answer that
 * both sides agree on and neither side can nudge.
 *
 * **The answer is a hash of the canonical form, never a dirty flag.** A dirty
 * flag is set by the editor, which means it is set by the client, which means it
 * is wrong the first time a re-render touches a field — and wrong in the
 * player's favour, since a squad that quietly kept its streak through a real
 * change is a squad nobody reports.
 *
 * **A no-op save must cost nothing.** Opening the editor to *read* a
 * configuration is the normal way to check what a squad is doing before deciding
 * whether to change it. Charging a streak for that teaches players not to look,
 * which is precisely backwards for a builder-first game.
 */

import { createHash } from 'node:crypto';
import { SQUAD_ROWS, type SquadRow } from '../db/schema/squads.js';

/** The per-hero defense behaviour that belongs to a seat. */
export interface SeatConfig {
  readonly targetPrimary: string;
  readonly targetFallback: string;
  /** `null` when the hero owns no friendly power. */
  readonly allyRule: string | null;
  /** A permutation of the six power slots. */
  readonly powerRanking: readonly number[];
}

export interface CanonicalSeat {
  readonly row: SquadRow;
  readonly index: number;
  readonly heroId: string;
  readonly config: SeatConfig;
}

/** Row order is the axis order, not alphabetical — front is nearest the enemy. */
const ROW_ORDER: Readonly<Record<SquadRow, number>> = Object.freeze({
  front: 0,
  middle: 1,
  back: 2,
});

/**
 * The canonical form: **six seats in row order then seat order**, each rendered
 * as `heroId · primary · fallback · ranking · allyRule`.
 *
 * Sorting is the entire point. The client may submit seats in whatever order the
 * editor happened to hold them, and two identical squads that serialised
 * differently would reset a streak for nothing.
 *
 * **What is inside the hash and why each is a real change:**
 *
 * | Included | Because |
 * |---|---|
 * | hero identity per seat | obviously |
 * | which **seat** each hero occupies | row placement decides reach; swapping two heroes between rows changes what the squad can hit |
 * | targeting primary **and** fallback | the fallback is the rule that usually fires — 49–80% of the time |
 * | the full power ranking | a ranking change can switch a power off entirely |
 * | the ally rule | it decides who a Buffer heals, which decides whether the squad survives |
 *
 * **What is deliberately outside**: runes and gear score (a player who invests in
 * a hero has not changed their *plan*, and the other rule makes investment and
 * defense mutually exclusive), the squad name and anything cosmetic, and the
 * order the seats arrived in.
 */
export function canonicalForm(seats: readonly CanonicalSeat[]): string {
  return [...seats]
    .sort((a, b) => ROW_ORDER[a.row] - ROW_ORDER[b.row] || a.index - b.index)
    .map((seat) =>
      [
        seat.row,
        seat.index,
        seat.heroId,
        seat.config.targetPrimary,
        seat.config.targetFallback,
        // Joined with a separator that cannot appear in a slot number, so
        // [1,23] and [12,3] cannot canonicalise to the same string.
        seat.config.powerRanking.join('.'),
        seat.config.allyRule ?? '-',
      ].join('·'),
    )
    .join('\n');
}

/** `sha256` of the canonical form. Used only for comparison, never stored as identity. */
export function canonicalHash(seats: readonly CanonicalSeat[]): string {
  return createHash('sha256').update(canonicalForm(seats), 'utf8').digest('hex');
}

/**
 * **Does this save reset the hold streak?** (T010)
 *
 * `true` iff the canonical forms differ. Reordering to an identical arrangement
 * is free; so is reopening the editor and saving without touching anything.
 *
 * Takes the two squads rather than a flag, so there is no argument a caller
 * could pass that makes a real change look like a no-op.
 */
export function streakResets(
  previous: readonly CanonicalSeat[],
  next: readonly CanonicalSeat[],
): boolean {
  return canonicalHash(previous) !== canonicalHash(next);
}

/** Exported for the test that asserts the row order is the axis order. */
export const CANONICAL_ROW_ORDER: readonly SquadRow[] = Object.freeze([...SQUAD_ROWS]);
