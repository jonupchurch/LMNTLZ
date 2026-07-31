/**
 * What the SQUAD READOUT says about six champions (019 US2).
 *
 * Pure functions over `Hero[]`, deliberately separated from the panel that
 * draws them: every number here is a claim about the game, and a claim about
 * the game belongs somewhere a test can reach without rendering React.
 *
 * ### Nothing in this file authors a weakness
 *
 * Constitution XV and `CLAUDE.md` are explicit — *"never hand-author a hero's
 * weaknesses, and never hand-author the 9×9 matrix"*. Every reading below comes
 * off `hero.bane`, `hero.fault` and `hero.strengths`, which `@lmntlz/content`
 * derives from the two authored fields through the `counter` bijection. There
 * is no table here and there must never be one.
 *
 * ### The two constants that are presentation, not rules
 *
 * `BANE` and `FAULT` are the real effectiveness multipliers, imported rather
 * than retyped, so a bane weighs a bane's worth in the vulnerability bars.
 * `SLOW_COOLDOWN` is the only invented number and it is a **hint threshold**,
 * not a mechanic — see `tempo()`.
 */

import { DAMAGE_TYPES, type DamageType, type Hero } from '@lmntlz/content';
import { BANE, FAULT } from '../../components/index.js';

// ---------------------------------------------------------------------------
// Collective vulnerability
// ---------------------------------------------------------------------------

export interface ForceVulnerability {
  readonly type: DamageType;
  /** How many of the six take this force as their **major** weakness. */
  readonly banes: number;
  /** How many take it as their minor one. */
  readonly faults: number;
  /**
   * `0 .. 1`, for the bar. Weighted by the real multipliers, so a single Bane
   * outruns a single Fault by exactly the amount it outruns it in a battle.
   * `1` is every champion in the squad baned by this one force.
   */
  readonly weight: number;
}

export function vulnerability(squad: readonly Hero[]): readonly ForceVulnerability[] {
  const ceiling = squad.length * BANE;

  return DAMAGE_TYPES.map((type) => {
    const banes = squad.filter((hero) => hero.bane === type).length;
    const faults = squad.filter((hero) => hero.fault === type).length;
    return {
      type,
      banes,
      faults,
      weight: ceiling === 0 ? 0 : (banes * BANE + faults * FAULT) / ceiling,
    };
  });
}

/**
 * A force that is the **Bane** of more than one champion — a shared door.
 *
 * Faults are deliberately not counted. Two champions sharing a Fault is a
 * ×1.25 coincidence; two sharing a Bane is one enemy hero deleting a third of
 * the squad, and conflating them would make the callout fire on every squad
 * and mean nothing.
 */
export function sharedDoors(squad: readonly Hero[]): readonly ForceVulnerability[] {
  return vulnerability(squad).filter((v) => v.banes > 1);
}

// ---------------------------------------------------------------------------
// Damage coverage
// ---------------------------------------------------------------------------

export interface Coverage {
  readonly covered: ReadonlySet<DamageType>;
  readonly count: number;
}

/**
 * Which of the nine this squad can *deal*.
 *
 * Read off `strengths`, which is `{ primary, secondary }` — the same pair the
 * derivation uses, so coverage and weakness can never disagree about what a
 * champion is.
 */
export function coverage(squad: readonly Hero[]): Coverage {
  const covered = new Set<DamageType>();
  for (const hero of squad) for (const force of hero.strengths) covered.add(force);
  return { covered, count: covered.size };
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/**
 * Turns of waiting at which a power stops being part of the squad's ordinary
 * rhythm and starts being something it builds toward.
 *
 * **A hint threshold, not a mechanic.** Nothing in the engine reads it; it
 * exists so this panel can put a dot on a line. Cooldown 0 and 1 both mean
 * "about every turn" once a six-hero initiative order is interleaved, so the
 * first real wait is 2.
 */
const SLOW_COOLDOWN = 2;

export interface Tempo {
  /** `0` pure sustain · `1` pure burst — the share of damage behind a wait. */
  readonly burst: number;
  readonly band: 'sustain' | 'balanced' | 'burst';
}

/**
 * How much of this squad's damage is locked behind a cooldown or a gate.
 *
 * Weighted by `multiplier` rather than counted, because a squad whose *big*
 * powers are the slow ones plays completely differently from one whose slow
 * powers are incidental — and counting powers cannot tell those apart.
 *
 * Powers with a null multiplier deal neither damage nor healing and are
 * skipped: they are utility, and utility has no share of a damage total.
 */
export function tempo(squad: readonly Hero[]): Tempo {
  let locked = 0;
  let total = 0;

  for (const hero of squad) {
    for (const power of hero.powers) {
      if (power.multiplier === null) continue;
      total += power.multiplier;
      if (power.cooldown >= SLOW_COOLDOWN || power.gateTurn > 1) locked += power.multiplier;
    }
  }

  const burst = total === 0 ? 0 : locked / total;
  return { burst, band: burst < 0.35 ? 'sustain' : burst > 0.65 ? 'burst' : 'balanced' };
}

// ---------------------------------------------------------------------------
// Reach
// ---------------------------------------------------------------------------

export interface ReachSpread {
  readonly long: number;
  readonly short: number;
}

/**
 * Reach 2 versus reach 1 across the squad.
 *
 * **No claim about what anybody can hit.** Distance counts *occupied* rows
 * crossed, so the answer changes the moment a row empties — `SquadBoard` asks
 * `@lmntlz/sim/rules` for that against a real formation. This is a census of
 * the champions, which is true regardless of where they are standing.
 */
export function reachSpread(squad: readonly Hero[]): ReachSpread {
  return {
    long: squad.filter((hero) => hero.reach === 2).length,
    short: squad.filter((hero) => hero.reach === 1).length,
  };
}

// ---------------------------------------------------------------------------
// The sentence at the top
// ---------------------------------------------------------------------------

/**
 * One line summarising the six, in the voice the export uses.
 *
 * Composed from two clauses rather than picked from a table of finished
 * sentences: the shape is *"<how it fails> with <how it wins>"*, and a table
 * would need one entry per combination and would grow a hole the first time a
 * band was added.
 */
export function headline(squad: readonly Hero[]): string {
  if (squad.length === 0) return 'Six seats, and nobody in them yet.';

  const doors = sharedDoors(squad);
  const shape =
    doors.length === 0
      ? 'A closed formation'
      : `A formation with ${doors.length === 1 ? 'a shared door' : `${doors.length} shared doors`}`;

  const reach = reachSpread(squad);
  const punch =
    tempo(squad).band === 'burst'
      ? 'that waits for its moment'
      : reach.long > reach.short
        ? 'with room to punch'
        : 'that has to close the distance';

  return `${shape} ${punch}.`;
}
