/**
 * The allocation invariants (006 T006–T008).
 *
 * **Pure functions over plain data, deliberately.** Every rule here is a
 * property of a set of squads, not of the database — so they are testable
 * without a connection, callable from the route layer before a transaction
 * opens, and impossible to accidentally enforce differently in two places.
 *
 * The arithmetic that shapes all of it:
 *
 * ```
 * 27 heroes, all unlocked, identical for every player
 * 12 to defense (two zones of 6) — and those 12 cannot attack
 * up to 3 attack squads drawn from the remaining 15
 *
 *   3 x 6 = 18 > 15   →  overlap between attack squads is FORCED
 * ```
 *
 * That last line is the one to keep in mind. Overlap is not a permitted edge
 * case to be tolerated; it is the ordinary state of a full roster. A rule that
 * treats a hero appearing in two attack squads as a conflict makes the game
 * unplayable, and it would pass every test written with fewer than three squads.
 */

import {
  SQUAD_SIZE,
  validateFormation,
  type FormationFaultCode,
  type Seat,
} from '@lmntlz/sim/rules';
import { MAX_ATTACK_SQUADS } from '../db/schema/squads.js';

export type { Seat };

export interface SquadShape {
  readonly id: string;
  readonly kind: 'defense' | 'offense';
  readonly zone?: 'visible' | 'hidden' | undefined;
  readonly slotIndex?: number | undefined;
  readonly name?: string | undefined;
  readonly seats: readonly Seat[];
}

/** The formation faults, re-exported so callers need one import. */
export type ShapeRejection = FormationFaultCode;

export class InvalidSquadError extends Error {
  readonly status = 422 as const;
  readonly code: ShapeRejection;
  /** What was wrong, concretely — the route passes this straight to the player. */
  readonly detail: string;

  constructor(code: ShapeRejection, detail: string) {
    super(detail);
    this.name = 'InvalidSquadError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * **Exactly six heroes as 2 front, 3 middle, 1 back** (T006, FR-003).
 *
 * The rule itself lives in `@lmntlz/sim/rules` so the squad builder can run the
 * *same code* on every drag rather than a copy that drifts. What is added here
 * is the throw: the API needs a `422` with a code, and the builder needs a value
 * it can render — so the shared function returns a fault and this one raises it.
 */
export function validateSquadShape(seats: readonly Seat[]): void {
  const fault = validateFormation(seats);
  if (fault) throw new InvalidSquadError(fault.code, fault.detail);
}

/**
 * Re-exported from `@lmntlz/sim/rules` — the builder disables the save button
 * with the same predicate the route rejects with.
 */
export { isPowerRanking } from '@lmntlz/sim/rules';

/** Every hero id in a squad, in seat order. */
export const heroesOf = (squad: SquadShape): readonly string[] => squad.seats.map((s) => s.heroId);

/**
 * **Every hero committed to defense** — across *both* zones (T007, FR-007).
 *
 * The union, not either zone alone. A rule written against the Visible squad
 * only would pass every test that uses one zone, and the Hidden squad is the
 * one nobody looks at.
 */
export function defendingHeroes(squads: readonly SquadShape[]): ReadonlySet<string> {
  const committed = new Set<string>();
  for (const squad of squads) {
    if (squad.kind !== 'defense') continue;
    for (const seat of squad.seats) committed.add(seat.heroId);
  }
  return committed;
}

/** The 15 (or fewer) heroes that may still be drafted into an attack squad. */
export function availableForOffense(
  allHeroIds: readonly string[],
  squads: readonly SquadShape[],
): readonly string[] {
  const defending = defendingHeroes(squads);
  return allHeroIds.filter((id) => !defending.has(id));
}

export class HeroUnavailableError extends Error {
  readonly status = 409 as const;
  readonly code = 'hero_on_defense' as const;
  readonly heroId: string;
  readonly zone: 'visible' | 'hidden';

  constructor(heroId: string, zone: 'visible' | 'hidden') {
    super(`${heroId} is defending the ${zone} zone and cannot attack.`);
    this.name = 'HeroUnavailableError';
    this.heroId = heroId;
    this.zone = zone;
  }
}

/**
 * **A hero on either defense zone is unavailable to every offense squad, without
 * exception** (T007).
 *
 * Reports the zone, because *"Bramwen cannot attack"* is not actionable and
 * *"Bramwen is defending your Hidden zone"* is — especially for the Hidden
 * squad, which the player is not looking at.
 */
export function assertAvailableForOffense(
  heroIds: readonly string[],
  squads: readonly SquadShape[],
): void {
  const zoneOf = new Map<string, 'visible' | 'hidden'>();
  for (const squad of squads) {
    if (squad.kind !== 'defense' || !squad.zone) continue;
    for (const seat of squad.seats) zoneOf.set(seat.heroId, squad.zone);
  }

  for (const heroId of heroIds) {
    const zone = zoneOf.get(heroId);
    if (zone) throw new HeroUnavailableError(heroId, zone);
  }
}

/**
 * **A zone short of six cannot defend, and says so** (T017, FR-011).
 *
 * The alternative — defending with five — is worse than it sounds. It is a free
 * win for every attacker, it is invisible to the player who caused it, and it
 * would most often be caused by *our own* eviction rule rather than by anything
 * they did deliberately. So an incomplete zone is a stated state with a reason,
 * not a squad that quietly fights a man down.
 *
 * It is reported, never repaired. Substituting a hero into the gap would replace
 * the player's plan with our guess.
 */
export interface DefenseReadiness {
  readonly zone: 'visible' | 'hidden';
  readonly seated: number;
  readonly required: number;
  readonly canDefend: boolean;
  /** Present only when it cannot — the sentence the player is shown. */
  readonly reason?: string;
}

export function defenseReadiness(
  zone: 'visible' | 'hidden',
  squad: SquadShape | undefined,
): DefenseReadiness {
  const seated = squad?.seats.length ?? 0;
  if (seated === SQUAD_SIZE) {
    return { zone, seated, required: SQUAD_SIZE, canDefend: true };
  }
  return {
    zone,
    seated,
    required: SQUAD_SIZE,
    canDefend: false,
    reason:
      seated === 0
        ? `Your ${zone} zone is empty and cannot defend. It needs ${SQUAD_SIZE} champions.`
        : `Your ${zone} zone has ${seated} of ${SQUAD_SIZE} champions and cannot defend.`,
  };
}

export class SquadCannotAttackError extends Error {
  readonly status = 409 as const;
  readonly code = 'squad_incomplete' as const;
  readonly slot: number;
  readonly seated: number;

  constructor(slot: number, seated: number, name: string | undefined) {
    super(
      `${name ?? `Attack squad ${slot + 1}`} has ${seated} of ${SQUAD_SIZE} champions and cannot attack.`,
    );
    this.name = 'SquadCannotAttackError';
    this.slot = slot;
    this.seated = seated;
  }
}

/**
 * **An invalidated squad cannot attack until it is refilled to six** (T026,
 * FR-009, SC-009).
 *
 * The squad most likely to be in this state is one *our own eviction rule*
 * emptied a seat in, not one the player left unfinished — so letting it fight
 * five-strong would be a loss caused by the game and invisible until the result
 * came back. Refusing is the honest failure, and it is recoverable in one
 * action: put somebody in the gap.
 *
 * **Nothing here repairs it (T027).** The squad is the player's plan; filling
 * the gap for them substitutes a guess and hides that they are over-committed.
 */
export function assertSquadCanAttack(squad: SquadShape | undefined, slot: number): void {
  const seated = squad?.seats.length ?? 0;
  if (seated !== SQUAD_SIZE) {
    throw new SquadCannotAttackError(slot, seated, squad?.name);
  }
}

export interface EvictedSquad {
  readonly id: string;
  readonly slotIndex: number | undefined;
  readonly name: string | undefined;
  /** Seats left after the hero is removed — always `SQUAD_SIZE - 1` here. */
  readonly remaining: number;
  /** Whether it was complete and valid before this move. */
  readonly wasReady: boolean;
}

export interface EvictionImpact {
  readonly heroId: string;
  /** **Every** affected squad. Never truncated, never sampled. */
  readonly squads: readonly EvictedSquad[];
  /** How many heroes remain for offense once this move commits. */
  readonly poolAfter: number;
  readonly squadsNeeded: number;
  readonly squadSize: number;
}

/**
 * What moving `heroId` to defense would break (T008, FR-008).
 *
 * **The result is complete or it is wrong.** Not "the first two", not "and 2
 * others" — every attack squad containing the hero, because truncation is
 * exactly what makes a player discover the third squad mid-battle. The common
 * case is *three*: 18 seats drawn from 15 heroes means a hero commonly sits in
 * all of them, so the plural path is the default and singular is the branch.
 *
 * Returns the impact rather than performing the move. The warning is a
 * confirmation shown **before** anything commits (research.md Q2), and a
 * function that both computed and applied would make that impossible to render.
 */
export function evictionImpact(
  heroId: string,
  squads: readonly SquadShape[],
  rosterSize: number,
): EvictionImpact {
  const affected = squads
    .filter((s) => s.kind === 'offense' && s.seats.some((seat) => seat.heroId === heroId))
    .map<EvictedSquad>((s) => ({
      id: s.id,
      slotIndex: s.slotIndex,
      name: s.name,
      remaining: s.seats.length - 1,
      wasReady: s.seats.length === SQUAD_SIZE,
    }));

  const defendingAfter = new Set(defendingHeroes(squads));
  defendingAfter.add(heroId);

  return {
    heroId,
    squads: affected,
    poolAfter: rosterSize - defendingAfter.size,
    squadsNeeded: MAX_ATTACK_SQUADS,
    squadSize: SQUAD_SIZE,
  };
}
