/**
 * Reading a scouted wall, and scoring your six against it (019).
 *
 * Pure functions over the scout payload and `Hero[]`, separated from the panels
 * that draw them for the same reason `features/squads/analysis.ts` is: every
 * number here is a claim about the game, and a claim about the game belongs
 * somewhere a test can reach without rendering React.
 *
 * ### Nothing here authors a weakness or a multiplier
 *
 * `BANE`, `FAULT`, `RESISTED_PRIMARY` and `RESISTED_SECONDARY` are imported from
 * `@lmntlz/content` through the component layer, never retyped. The design
 * export this screen is drawn from weights a Bane as `+2` and a Fault as `+1` —
 * invented numbers that happen to rank the same way the real ladder does, and
 * would stop doing so the moment the ladder moved. Constitution XV: the ladder
 * has one source and this is not it.
 *
 * A defender's own `bane` and `fault` come off the payload, which the server
 * derives from the two authored fields. There is no 9×9 table in this file and
 * there must never be one.
 *
 * ### What IS invented here, and it is labelled
 *
 * `VERDICT_*` are **display thresholds** — where "workable" stops and
 * "favourable" starts is a matter of taste, not a rule, and the server has no
 * opinion about it. They decide a word on a card and nothing else. No battle,
 * no rating and no reward reads them.
 */

import type { DamageType, Hero } from '@lmntlz/content';
import {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
  type Effectiveness,
} from '../../components/index.js';
import type { ScoutSeat } from './types.js';

/**
 * What one damage type does to one defender.
 *
 * The whole ladder, in the direction a scout reads it: *I am bringing this
 * force — what happens when it lands on them?* The four named cases come off
 * the defender's derived profile, and everything else is neutral.
 */
export function effectivenessAgainst(
  dealt: DamageType,
  defender: { readonly primary: string; readonly secondary: string; readonly bane: string; readonly fault: string },
): Effectiveness {
  if (dealt === defender.bane) return BANE;
  if (dealt === defender.fault) return FAULT;
  if (dealt === defender.primary) return RESISTED_PRIMARY;
  if (dealt === defender.secondary) return RESISTED_SECONDARY;
  return NEUTRAL;
}

/**
 * The best any of these forces can do against one defender.
 *
 * **Both of a champion's forces count.** `strengths` is `{primary, secondary}`
 * everywhere else in the game — a squad screen that read only `primary` would
 * hide half of what a squad can open, and a dual-typed power takes the better of
 * its two types anyway (`03-combat.md`). Empty set is neutral, not zero: no
 * squad chosen yet is not the same claim as a squad that cannot hurt anybody.
 *
 * ### ⚠️ The accumulator starts at *nothing*, not at `NEUTRAL`
 *
 * Seeding it with `NEUTRAL` and keeping the larger value looks like the same
 * function and is not: 0.5 and 0.8 are both **below** 1.0, so a squad whose
 * every force this defender resists would come back neutral. It shipped that
 * way for one run — `walled` was structurally always zero, "walls you cannot
 * move" listed forces the verdict then ignored, and the subtraction that stops
 * the readout cheering for a stalling squad subtracted nothing. Nothing threw;
 * the readout was simply, quietly, half a readout.
 *
 * The empty case is handled by the `??`, where it is a statement rather than a
 * side effect of the seed.
 */
export function bestAgainst(
  forces: ReadonlySet<DamageType>,
  defender: Parameters<typeof effectivenessAgainst>[1],
): Effectiveness {
  let best: Effectiveness | null = null;
  for (const force of forces) {
    const roll = effectivenessAgainst(force, defender);
    if (best === null || roll > best) best = roll;
  }
  return best ?? NEUTRAL;
}

/** Every force a squad actually deals — the union of all six `strengths`. */
export const forcesOf = (squad: readonly Hero[]): ReadonlySet<DamageType> =>
  new Set(squad.flatMap((hero) => [hero.primary, hero.secondary]));

// ---------------------------------------------------------------------------
// The wall's own doors — true without reference to any attacker
// ---------------------------------------------------------------------------

export interface Door {
  readonly type: DamageType;
  /** How many of the six take this force as their **major** weakness (×1.50). */
  readonly banes: number;
  /** How many take it as their minor one (×1.25). */
  readonly faults: number;
}

/**
 * Which forces open this wall, most Banes first.
 *
 * **Free information, and disclosing it is the point.** Bane and Fault are a
 * pure function of two authored types, so a scout with the Codex open can
 * compute every one of these by hand — the panel's contribution is doing the
 * arithmetic across six champions and nine forces, which is exactly the sort of
 * counting that makes people not bother. The game is counter-building; refusing
 * to count would not protect anything, it would just make the read tedious.
 */
export function doorsOf(seats: readonly ScoutSeat[]): readonly Door[] {
  const banes = new Map<string, number>();
  const faults = new Map<string, number>();

  for (const seat of seats) {
    banes.set(seat.hero.bane, (banes.get(seat.hero.bane) ?? 0) + 1);
    faults.set(seat.hero.fault, (faults.get(seat.hero.fault) ?? 0) + 1);
  }

  return [...new Set([...banes.keys(), ...faults.keys()])]
    .map((type) => ({
      type: type as DamageType,
      banes: banes.get(type) ?? 0,
      faults: faults.get(type) ?? 0,
    }))
    .sort((a, b) => b.banes - a.banes || b.faults - a.faults || a.type.localeCompare(b.type));
}

// ---------------------------------------------------------------------------
// Your six against their wall
// ---------------------------------------------------------------------------

export type Verdict = 'favourable' | 'workable' | 'uphill';

export interface Reading {
  /** Their champions whose Bane one of your forces answers. */
  readonly opened: number;
  /** Answered only at ×1.25 — worth something, not a lever. */
  readonly nicked: number;
  /**
   * Their champions your squad's **best** answer is neutral or worse against.
   *
   * ### Why this is not "resisted"
   *
   * The first version counted defenders whose every incoming force is resisted
   * outright. Six champions bring up to nine distinct forces between them, so
   * that condition is **almost never true** — it measured zero across the whole
   * roster, which made the subtraction below inert and the verdict a count of
   * Banes wearing a subtraction's clothes.
   *
   * *You have no lever here* is the fact a player needs, and it is the same
   * whether their best is ×1.00 or ×0.50. `opened + nicked + unanswered` is
   * exactly the size of the wall.
   */
  readonly unanswered: number;
  /** `opened × 2 + nicked − unanswered`, `−6 .. 12`. A ranking, not a rule. */
  readonly score: number;
  readonly verdict: Verdict;
  /** Your forces that open at least one Bane, most first. */
  readonly opens: readonly { readonly type: DamageType; readonly count: number }[];
  /** Your forces this wall resists, most first. Never one that opens a Bane. */
  readonly resisted: readonly { readonly type: DamageType; readonly count: number }[];
}

/**
 * **Invented, and deliberately inert.** Where "workable" stops is taste; the
 * server has no opinion and nothing but a word on a card reads these.
 *
 * ### Fractions of the wall, not fixed integers
 *
 * The score's ceiling is `2 × wallSize`, so a fixed threshold means something
 * different against a six-champion wall than against a short one. Fixed `6` and
 * `2` also failed the only test that matters: **all three attack squads read
 * "favourable" at once** on the first build — one opening six of six and one
 * opening three, which is exactly the distinction the label exists to draw. A
 * fit chip that says the same word about every squad is decoration.
 *
 * `0.8` of the ceiling for favourable, `0.25` for workable.
 */
const VERDICT_FAVOURABLE = 1.6;
const VERDICT_WORKABLE = 0.5;

/**
 * How your six read against the six they surfaced.
 *
 * ### Why `unanswered` is subtracted rather than merely reported
 *
 * A squad that opens three of their champions and has nothing for the other
 * three is not a favourable read, and a count of Banes alone would call it one.
 * The subtraction is what stops the readout cheering for a squad that will
 * stall halfway through the fight.
 */
export function readWall(seats: readonly ScoutSeat[], squad: readonly Hero[]): Reading {
  const forces = forcesOf(squad);

  let opened = 0;
  let nicked = 0;
  let unanswered = 0;

  /* Per force: how many of their six it Banes, and how many resist it. A force
     is only listed as resisted when it opens nothing — "this is your lever AND
     your problem" is not a reading anybody can act on. */
  const opensBy = new Map<DamageType, number>();
  const resistsBy = new Map<DamageType, number>();

  for (const seat of seats) {
    const best = bestAgainst(forces, seat.hero);
    if (best === BANE) opened += 1;
    else if (best === FAULT) nicked += 1;
    else unanswered += 1;

    for (const force of forces) {
      const roll = effectivenessAgainst(force, seat.hero);
      if (roll === BANE) opensBy.set(force, (opensBy.get(force) ?? 0) + 1);
      if (roll <= RESISTED_SECONDARY) resistsBy.set(force, (resistsBy.get(force) ?? 0) + 1);
    }
  }

  const score = opened * 2 + nicked - unanswered;
  const size = seats.length;

  const rank = (m: ReadonlyMap<DamageType, number>) =>
    [...m.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return {
    opened,
    nicked,
    unanswered,
    score,
    verdict:
      score >= VERDICT_FAVOURABLE * size
        ? 'favourable'
        : score >= VERDICT_WORKABLE * size
          ? 'workable'
          : 'uphill',
    opens: rank(opensBy),
    resisted: rank(resistsBy).filter((entry) => !opensBy.has(entry.type)),
  };
}

/**
 * The one-line fit label a squad card carries.
 *
 * Same reading, same thresholds — a card and the readout below it disagreeing
 * about whether a squad works would be worse than either being wrong alone.
 */
export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  favourable: 'Favourable read',
  workable: 'Workable',
  uphill: 'Uphill',
};

/** Tone per verdict, for whichever component is drawing it. */
export const VERDICT_TONE: Readonly<Record<Verdict, 'success' | 'strong' | 'danger'>> = {
  favourable: 'success',
  workable: 'strong',
  uphill: 'danger',
};
