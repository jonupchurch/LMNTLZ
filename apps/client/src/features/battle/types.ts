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
    /**
     * Healing the target had no room for. **`healing: 0` with `overheal > 0` is
     * a heal that worked perfectly on an ally who was already full** — which is
     * the difference between a bug and a wasted turn, and the screen had no way
     * to tell them apart until this field existed.
     *
     * ### ⚠️ Optional, and that is Constitution XVI rather than laziness
     *
     * The engine emits it on every packet from 2026-08-01 onward, so a *live*
     * battle always carries it. `ReplayViewer` reads this same type out of
     * **stored JSON event logs**, and every replay recorded before that date was
     * written without the field. Those recordings are immutable and cannot be
     * backfilled — a replay is replayed verbatim, never re-simulated.
     *
     * So a required `number` here would be the type asserting something false
     * about most of the archive. Optional is the truth: present going forward,
     * absent behind. Readers must treat absent as "unknown", not as zero.
     */
    readonly overheal?: number;
    readonly ridersLanded: readonly string[];
    readonly ridersResisted: readonly string[];
    /**
     * Rune effects that did something this turn, `<effectId>:<instanceId>`
     * (021 US4).
     *
     * **Optional for exactly the reason `overheal` is**, one field up: a battle
     * recorded before this existed has no such list and cannot be given one, so a
     * required array would have the type assert *"nothing fired"* about every
     * replay in the archive. Absent means unknown, not empty.
     */
    readonly runesFired?: readonly string[];
    /**
     * Counters this turn provoked, in the order they resolved (2026-08-02).
     *
     * **Optional for the third time on this type, and for the same reason.** A
     * reaction is the only thing a hero does outside its own turn, so it is the
     * one event the log cannot infer from the action it was given — and nothing
     * recorded before the reaction system existed carries the field. Absent means
     * unknown; most turns provoke nothing and say so by omission.
     */
    readonly reactions?: readonly ReactionEvent[];
    readonly deaths: readonly string[];
  };
}

/**
 * One counter, as it arrives on the wire.
 *
 * **The same vocabulary the outcome above uses**, because a reaction *is* an
 * attack — resolved by the same pipeline, on the same board, with the same
 * contest. A second set of field names would invite a second set of log rules for
 * the same events. It carries no `conclusion`: the turn reports one, once, after
 * every counter has resolved.
 */
export interface ReactionEvent {
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string;
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly ridersLanded: readonly string[];
  readonly ridersResisted: readonly string[];
  readonly runesFired: readonly string[];
  readonly deaths: readonly string[];
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

/**
 * What the battle paid — present **only** on the response that concluded it
 * (`specs/GAPS.md` §2c).
 *
 * The amounts are not persisted, so the final `act` is the one request that can
 * ever report them. Absent on every ordinary turn, and absent again on a later
 * `GET` of the same finished battle. The client must therefore treat this as
 * *"the news, once"* rather than as state it can re-fetch — which is why
 * `BattleScreen` holds it rather than deriving it.
 *
 * **Projected onto the requester.** `won` is about *this* player, not the
 * attacker: a defender who holds their wall sees `won: true` against
 * `winner: 'defender'`.
 */
export interface BattleSettlement {
  readonly winner: 'attacker' | 'defender';
  readonly won: boolean;
  readonly shards: number;
  /** What the win was worth before the daily cap. `>= shards`. */
  readonly shardsEarned: number;
  readonly cappedAt: number | null;
  /** How much of `shards` came from the streak reward. `0` when none did. */
  readonly streakShards: number;
  readonly ratingDelta: number;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly attackStreak: number;
  readonly holdStreak: number;
  readonly turnCount: number;
  readonly zone: 'visible' | 'hidden';
}

export interface ActResponse {
  readonly sequence: number;
  readonly packet: ActionPacket;
  readonly nextSequence: number;
  readonly settlement?: BattleSettlement;
}

/** `GET /v1/battles/:battleId` — the resynchronisation route after a `409`. */
export interface BattleView {
  readonly battleId: string;
  readonly zone: 'visible' | 'hidden';
  /**
   * **Served, not derived from `zone`.** They happen to agree today — only the
   * attacker can load a battle and a Hidden squad cannot be chosen — but that
   * agreement is a rule, and a client that re-derived it would be a second copy
   * of the rule sitting in the build that ships to Steam.
   */
  readonly ambushed: boolean;
  readonly sequence: number;
  readonly state: BattleState;
  readonly conclusion: Conclusion | null;
  readonly startedAt: string;
  readonly concludedAt: string | null;
}

/**
 * What a Hidden battle is worth, **as served** — the slice of
 * `GET /v1/me/shards` the ambush banner needs and nothing else.
 *
 * Two constants, not one. `hiddenMultiplier` doubles the shard payout and
 * `hiddenRatingMultiplier` doubles the winner's positive rating delta; they
 * happen to both be `2` today and they are tuned independently, so the screen
 * reads two fields rather than one number twice.
 */
export interface AmbushRewards {
  readonly shardMultiplier: number;
  readonly ratingMultiplier: number;
}

export interface ActionIntent {
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
}
