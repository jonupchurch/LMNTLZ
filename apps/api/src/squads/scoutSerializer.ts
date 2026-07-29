/**
 * The scout view (T042–T044).
 *
 * ### Why this is its own file
 *
 * **A shared serialiser is exactly how the Hidden squad leaks.** The profile
 * read, the battle record and this view all describe "a player and their
 * squads", and the obvious economy is one `serializePlayer` with a flag. The
 * failure mode is not that somebody writes `hidden: fullSquad` — it is that a
 * *later* feature adds a field to the shared serialiser for a good reason, and
 * that field is now disclosed here too, to an opponent, silently.
 *
 * So this module builds its output **field by field from scratch** and imports
 * no serialiser from anywhere. It is more code and that is the point: adding a
 * field to a player elsewhere cannot reach this file.
 *
 * ### Two disclosure rules in one response (Constitution XVII)
 *
 * | Disclosed | Withheld |
 * |---|---|
 * | the six Visible champions and both their types — so Bane and Fault | **every stat value**, base or runed |
 * | the 2/3/1 formation | **which stat** any rune boosts |
 * | each champion's three rune slots: element and stages 0–4 | **which utility effect** a completed slot holds |
 * | **both** hold streaks | **targeting priority and power ranking, in both zones** |
 * | | **the entire Hidden composition** |
 *
 * ### Rune fill shows commitment, never power
 *
 * At an identical 1,950-shard spend the best allocation scores ~3.35x the worst,
 * so a full set of pips means a player *committed*, not that they committed
 * well. That gap is what makes the disclosure safe and what makes bluffing a
 * real strategy — a scout can see effort and still be wrong about strength.
 *
 * **Storing is not exposing.** The database holds every stat, every ranking and
 * the whole Hidden squad; this function is the boundary that decides what leaves.
 */

import { derive, getHero } from '@lmntlz/content';
import type { StoredSquad } from './repository.js';

/** Rune slots are feature 010's. The shape is disclosed now so the scout view
 *  does not change shape later; stages read 0 until runes exist. */
export interface ScoutRuneSlot {
  readonly element: string;
  /** 0–4. **Never which stat it boosts, and never the utility effect.** */
  readonly stages: number;
}

export interface ScoutSeat {
  readonly row: string;
  readonly index: number;
  readonly hero: {
    readonly id: string;
    readonly name: string;
    readonly primary: string;
    readonly secondary: string;
    /** Derived from the two authored types, so it is free information anyway. */
    readonly bane: string;
    readonly fault: string;
    readonly role: string;
    readonly reach: number;
  };
  readonly runes: readonly ScoutRuneSlot[];
}

export interface ScoutView {
  readonly playerId: string;
  readonly username: string;
  readonly league: string;
  readonly visible: {
    readonly holdStreak: number;
    readonly canDefend: boolean;
    readonly seats: readonly ScoutSeat[];
  };
  /**
   * **The streak and nothing else** (FR-018, FR-020). No seats key, no length,
   * no `canDefend` — the absence of the field is the disclosure rule, and an
   * empty array would still tell a scout the shape of what is missing.
   */
  readonly hidden: { readonly holdStreak: number };
}

/**
 * Build the scout view.
 *
 * Takes the *stored* squads and returns only what may leave. Note what is
 * **not** read from `squad.configs` anywhere below: targeting rules and power
 * rankings are the defender's plan, and disclosing them would make the Visible
 * squad solvable rather than merely readable.
 */
export function serializeScoutView(input: {
  readonly targetId: string;
  readonly username: string;
  readonly league: string;
  readonly squads: readonly StoredSquad[];
}): ScoutView {
  const visible = input.squads.find((s) => s.kind === 'defense' && s.zone === 'visible');
  const hidden = input.squads.find((s) => s.kind === 'defense' && s.zone === 'hidden');

  const seats: ScoutSeat[] = (visible?.seats ?? [])
    .slice()
    .sort((a, b) => a.row.localeCompare(b.row) || a.index - b.index)
    .map((seat) => {
      const hero = getHero(seat.heroId);
      const profile = derive(hero.primary, hero.secondary);

      return {
        row: seat.row,
        index: seat.index,
        hero: {
          id: hero.id,
          name: hero.name,
          primary: hero.primary,
          secondary: hero.secondary,
          // Bane and Fault are a pure function of the two authored types, so a
          // scout could compute them from the Codex regardless. Sending them
          // saves a lookup and discloses nothing new.
          bane: profile.bane,
          fault: profile.fault,
          role: hero.role,
          reach: hero.reach,
        },
        // **Element and stages only.** Which stat a rune boosts is the thing
        // that would turn commitment into power.
        runes: [
          { element: hero.primary, stages: 0 },
          { element: hero.secondary, stages: 0 },
          { element: 'common', stages: 0 },
        ],
      };
    });

  return {
    playerId: input.targetId,
    username: input.username,
    league: input.league,
    visible: {
      holdStreak: visible?.holdStreak ?? 0,
      canDefend: (visible?.seats.length ?? 0) === 6,
      seats,
    },
    // Constructed inline, deliberately: there is no `serializeZone` that could
    // one day be called with `hidden` by mistake.
    hidden: { holdStreak: hidden?.holdStreak ?? 0 },
  };
}
