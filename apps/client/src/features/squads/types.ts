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

export interface RosterResponse {
  readonly heroes: readonly Hero[];
  readonly assignments: {
    readonly defense: Readonly<Record<Zone, DefenseZoneState>>;
    readonly offense: readonly OffenseSquadState[];
  };
  readonly available: {
    /** Every hero — moving one off an attack squad is legal. */
    readonly forDefense: readonly string[];
    /** The 15 not on either defense squad. */
    readonly forOffense: readonly string[];
  };
}
