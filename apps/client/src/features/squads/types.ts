/** The wire shapes of `GET /v1/roster`, per `contracts/squads-api.md`. */

import type { Hero } from '@lmntlz/content';
import type { Seat } from '@lmntlz/sim/rules';

export type Zone = 'visible' | 'hidden';

export interface DefenseZoneState {
  readonly seats: readonly Seat[];
  readonly holdStreak: number;
  readonly editedAt: string | null;
  /** FR-011 — an incomplete zone is a stated state, not a squad fighting short. */
  readonly canDefend: boolean;
  readonly reason?: string;
}

export interface OffenseSquadState {
  readonly slot: number;
  readonly name: string | null;
  readonly seats: readonly Seat[];
  readonly complete: boolean;
  /** `false` once an eviction has broken it. Distinct from merely unfinished. */
  readonly valid: boolean;
}

/** `POST /v1/squads/defense/:zone/preview-move`. Computed server-side only. */
export interface EvictionPreview {
  readonly heroId: string;
  /** **Every** affected squad. The server never truncates and neither does the UI. */
  readonly evicts: readonly {
    readonly slot: number;
    readonly name: string | null;
    readonly wasComplete: boolean;
    readonly wouldBe: number;
  }[];
  readonly poolAfter: {
    readonly heroes: number;
    readonly squads: number;
    readonly seatsNeeded: number;
  };
  /** Stated before the commit, per FR-014. `0` when there is nothing to lose. */
  readonly streakAtRisk: number;
}

/**
 * **Three streaks that must never be conflated** (FR-012). They are named apart
 * in the payload as well as in the schema: one `attack` belonging to the player,
 * two `hold` belonging to zones. Reading the wrong one means reaching into a
 * different object, not mistyping a field.
 */
export interface StreakState {
  readonly attack: number;
  readonly hold: Readonly<Record<Zone, number>>;
}

/**
 * Ambush odds **as served**. The client renders `chance` and computes nothing —
 * `perWin` and `cap` are here to be *displayed* ("+2% per win, up to 90%"), not
 * to be multiplied. SC-008 greps this app for either value as a literal.
 */
export interface AmbushState {
  readonly chance: number;
  readonly perWin: number;
  readonly cap: number;
  readonly capAt: number;
}

export interface RosterResponse {
  readonly heroes: readonly Hero[];
  readonly assignments: {
    readonly defense: Readonly<Record<Zone, DefenseZoneState>>;
    readonly offense: readonly OffenseSquadState[];
  };
  readonly streaks: StreakState;
  readonly ambush: AmbushState;
  readonly available: {
    /** Every hero — moving one off an attack squad is legal. */
    readonly forDefense: readonly string[];
    /** The 15 not on either defense squad. */
    readonly forOffense: readonly string[];
  };
}
