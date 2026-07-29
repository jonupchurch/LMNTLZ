/** The wire shapes of the battle routes, per `contracts/battle-api.md`. */

import type { BattleState, Conclusion } from '@lmntlz/sim/rules';

/**
 * One hero turn as the server resolved it.
 *
 * **Deliberately not `ResolvedPacket` from `@lmntlz/sim/resolver`.** That module
 * is server-only — it holds the RNG and the seed, and eslint refuses the import
 * here. The client needs the same *shape* without the package that produces it,
 * so the wire type is declared independently, and the fields it does not carry
 * are the point: there is no draw index and no seed anywhere in it.
 */
export interface TurnEvent {
  readonly actorInstanceId: string;
  /** `null` when the hero passed — nothing it owned had a legal target. */
  readonly powerId: string | null;
  readonly targetInstanceId: string | null;
  readonly source: 'player' | 'engine';
  readonly outcome: {
    readonly hit: boolean;
    readonly crit: boolean;
    readonly damage: number;
    readonly healing: number;
    readonly ridersLanded: readonly string[];
    readonly ridersResisted: readonly string[];
    readonly deaths: readonly string[];
  };
}

/**
 * What one request resolves to: **the acted turn, then every forced turn and
 * every engine turn** up to the next real choice.
 *
 * Several hero turns arrive at once, which is why the client plays them out at
 * its own pace and never round-trips on an animation.
 */
export interface ActionPacket {
  readonly events: readonly TurnEvent[];
  readonly state: BattleState;
  readonly conclusion: Conclusion | null;
}

export interface StartedBattle {
  readonly battleId: string;
  readonly zone: 'visible' | 'hidden';
  /** True when the server's ambush roll put the player into the Hidden zone. */
  readonly ambushed: boolean;
  readonly sequence: number;
  readonly packet: ActionPacket;
}

export interface ActResponse {
  readonly sequence: number;
  readonly packet: ActionPacket;
  readonly nextSequence: number;
}

/** `GET /v1/battles/:battleId` — the resynchronisation route after a `409`. */
export interface BattleView {
  readonly battleId: string;
  readonly zone: 'visible' | 'hidden';
  readonly sequence: number;
  readonly state: BattleState;
  readonly conclusion: Conclusion | null;
  readonly startedAt: string;
  readonly concludedAt: string | null;
}

export interface ActionIntent {
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
}
