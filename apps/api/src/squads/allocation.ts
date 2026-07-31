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
  isPowerRanking as isRanking,
  validateFormation,
  validatePlacement,
  type FormationFaultCode,
  type Seat,
} from '@lmntlz/sim/rules';
import { getHero } from '@lmntlz/content';
/**
 * **`@lmntlz/sim/ai` is server-only and this file is server-only**, which is why
 * the import is safe here and would not be in `packages/sim/rules`. The client
 * never sees a role default until the server sends one back — shipping the table
 * would hand every player the exact ranking the engine uses against them.
 */
import { TARGET_RULES, resolveConfig, type SquadMemberConfig, type TargetRule } from '@lmntlz/sim/ai';
import { MAX_ATTACK_SQUADS } from '../db/schema/squads.js';
import type { SeatConfig } from './canonical.js';

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
 * **What a squad has to satisfy to be *stored*, which is less than to fight.**
 *
 * A defense zone can be saved with fewer than six — empty, even — so a player
 * can reorganise across two zones and three attack squads without having to
 * complete every move in one sitting. Moving one champion between zones used to
 * mean the source zone was un-savable until a replacement was found, which is
 * the shuffle nobody could perform.
 *
 * **Nothing was relaxed about fighting.** Every impossible placement is still
 * refused here — an unknown row, two champions in one seat, the same champion
 * twice, a champion who does not exist — because those are wrong at three
 * heroes exactly as at six. What moved is the *count*, and it moved to the two
 * places that need it: `defenseReadiness`, which already reported an incomplete
 * zone as unable to defend, and `createBattle`, which now refuses to start one.
 *
 * A stored short squad therefore never reaches a battle from either side. It
 * cannot attack, and it cannot be attacked.
 */
export function validateStorableShape(seats: readonly Seat[]): void {
  const fault = validatePlacement(seats);
  if (fault) throw new InvalidSquadError(fault.code, fault.detail);
}

/**
 * Re-exported from `@lmntlz/sim/rules` — the builder disables the save button
 * with the same predicate the route rejects with.
 */
export { isPowerRanking } from '@lmntlz/sim/rules';

/**
 * **A targeting rule the engine actually has** (Constitution XII, AGENTS rule 2).
 *
 * `battle/snapshot.ts` has always rejected an unknown rule, because a defender it
 * cannot read is a defender nobody can attack. `PUT /squads/defense/:zone` did
 * **not**, and the two together were a way to store a squad that fails at battle
 * time rather than at save time — a `MalformedSnapshotError` raised against
 * whoever attacks you, for a string you typed.
 *
 * So the predicate lives here, beside the shape validator, and both boundaries
 * use this one. `TARGET_RULES` never reaches the client; the *menu* is served.
 */
export const isTargetRule = (value: unknown): value is TargetRule =>
  typeof value === 'string' && (TARGET_RULES as readonly string[]).includes(value);

/** The menu the builder renders, served rather than compiled into the client. */
export const targetRuleMenu = (): readonly string[] => TARGET_RULES;

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

/**
 * **A champion left unconfigured gets her Role's defaults** (T049, FR-023).
 *
 * Never an empty config and never "she does nothing". A defense squad is played
 * by the engine whether or not the player opened the editor, so the only
 * question is whether the fallback is *stated* or *accidental*. `roleDefaults`
 * is feature 004's measured table — a Striker takes `lowest-current-hp` then
 * `nearest`, a Tank `highest-might` then `nearest`, and so on — so an
 * unconfigured squad plays sensibly rather than in seat order.
 *
 * The player is never told a default is "their" choice; it is what happens
 * until they choose.
 */
export function configFor(heroId: string, saved: SquadMemberConfig | undefined): SquadMemberConfig {
  return resolveConfig(getHero(heroId), saved);
}

/**
 * The same resolution, in the shape the database column and the wire both use.
 *
 * **One converter, because there were already two.** `battle/snapshot.ts` and
 * `matchmaking/seedBots.ts` each spell the `SquadMemberConfig` ↔ column mapping
 * out by hand, and a third copy would be how `allyRule` ends up written for a
 * champion who cannot heal on one path and omitted on another.
 *
 * **Each stored field is guarded before it overrides a default, and the guards
 * are load-bearing.** `repository.ts` represents "no config row" as empty
 * strings and an empty ranking, and `resolveConfig` merges on truthiness — so an
 * unguarded `targeting: ['', '']` is a truthy array that would replace a Role
 * default with two rules the engine does not have.
 */
export function resolvedSeatConfig(heroId: string, stored?: Partial<SeatConfig>): SeatConfig {
  const resolved = resolveConfig(getHero(heroId), {
    ...(stored?.targetPrimary && stored.targetFallback
      ? {
          targeting: [stored.targetPrimary, stored.targetFallback] as SquadMemberConfig['targeting'],
        }
      : {}),
    ...(isRanking(stored?.powerRanking)
      ? { ranking: stored.powerRanking as unknown as SquadMemberConfig['ranking'] }
      : {}),
    // `TargetRule`, not `SquadMemberConfig['allyRule']` — the latter includes
    // `undefined`, which `exactOptionalPropertyTypes` will not accept in a
    // present key. The field's absence is the signal; `undefined` is not.
    ...(stored?.allyRule ? { allyRule: stored.allyRule as TargetRule } : {}),
  });

  return {
    targetPrimary: resolved.targeting[0],
    targetFallback: resolved.targeting[1],
    /**
     * `null` rather than omitted, because this is the *column* shape and the
     * column is `NOT NULL`-free rather than optional. `SquadMemberConfig` keeps
     * the field absent to say which champions face the decision; that
     * distinction is restored on the way back in, by `resolveConfig` itself.
     */
    allyRule: resolved.allyRule ?? null,
    powerRanking: resolved.ranking,
  };
}

/** Fill every seat's config, leaving explicit choices untouched. */
export function withRoleDefaults(
  seats: readonly Seat[],
  saved: ReadonlyMap<string, SquadMemberConfig>,
): Map<string, SquadMemberConfig> {
  return new Map(seats.map((seat) => [seat.heroId, configFor(seat.heroId, saved.get(seat.heroId))]));
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
    // **Slot order, always.** Without this the list arrives in whatever order
    // the database returned rows, which is unspecified and does change — and a
    // confirm dialog whose list reshuffles between renders is the kind of thing
    // that makes a player re-read it instead of trusting it.
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
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
