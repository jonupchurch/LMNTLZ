/** The wire shapes of `GET /v1/roster`, per `contracts/squads-api.md`. */

import type { Hero } from '@lmntlz/content';
import type { Seat } from '@lmntlz/sim/rules';

export type Zone = 'visible' | 'hidden';

/**
 * How the engine plays one seated champion.
 *
 * **Served, never derived here** (T049, FR-023). The role-default table lives
 * behind `@lmntlz/sim/ai`, which a purity test makes unreachable from this app —
 * deliberately, because shipping it would hand every player the exact ranking the
 * engine plays against them. So a seat arrives carrying either the player's own
 * choice or the default already being played on their behalf, and the client's
 * only job is to render it and send it back.
 */
export interface SeatConfigWire {
  readonly targeting: readonly [string, string];
  readonly ranking: readonly number[];
  readonly allyRule: string | null;
}

/** A defense seat as served: the placement, plus the behaviour that goes with it. */
export interface ConfiguredSeat extends Seat {
  readonly config: SeatConfigWire;
}

export interface DefenseZoneState {
  readonly seats: readonly ConfiguredSeat[];
  readonly holdStreak: number;
  readonly editedAt: string | null;
  /** FR-011 — an incomplete zone is a stated state, not a squad fighting short. */
  readonly canDefend: boolean;
  readonly reason?: string;
}

/**
 * The menus, and who faces the third one.
 *
 * `ally` is the same list as `target` rather than a subset — the ally menu
 * discriminates better than the enemy one, not differently.
 */
export interface RuleMenus {
  readonly target: readonly string[];
  readonly ally: readonly string[];
  /** Hero ids that own a friendly power. The predicate is server-side too. */
  readonly needsAllyRule: readonly string[];
}

/**
 * `PUT /v1/squads/defense/:zone`.
 *
 * **`warnings` never blocks** — the save above it already happened. A reach-1 back
 * seat and a self-defeating ranking are both priced decisions, and this screen
 * surfaces them rather than preventing them.
 */
export interface SaveDefenseResponse {
  readonly holdStreak: number;
  readonly streakReset: boolean;
  readonly evictedSquadIds: readonly string[];
  readonly warnings: readonly {
    readonly code: string;
    readonly heroId: string;
    readonly message: string;
  }[];
}

/**
 * `PUT /v1/squads/offense/:slot`.
 *
 * **No warnings and no streak.** Both belong to defense: a warning describes what
 * the engine will do with a champion the player is not commanding, and a hold
 * streak measures how long a *defense* has stood.
 */
export interface SaveOffenseResponse {
  readonly slot: number;
  readonly name: string | null;
  readonly complete: boolean;
  readonly valid: boolean;
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
  readonly rules: RuleMenus;
  readonly available: {
    /** Every hero — moving one off an attack squad is legal. */
    readonly forDefense: readonly string[];
    /** The 15 not on either defense squad. */
    readonly forOffense: readonly string[];
  };
}
