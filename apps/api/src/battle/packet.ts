/**
 * Folding a battle forward to the next real decision (007 T022).
 *
 * ### One request resolves the player's intent *and everything after it*
 *
 * A packet runs the acted turn, then every forced attacker turn and **every
 * defender turn**, stopping only where the player faces a choice with more than
 * one legal outcome. That is what turns a ~102-hero-turn battle into 20–40
 * requests: the engine plays all defense, so a request that stopped at each
 * defender turn would be asking the player to watch rather than to decide.
 *
 * ### Every turn it folds records what was chosen, so divergence is detectable
 *
 * Each event carries the actor, the power and the target that were *chosen*, not
 * just what came of them. **That does not mean a replay skips the defense AI** —
 * `act.ts` explains why it cannot: the AI's tiebreak draws sit between one
 * turn's resolution draws and the next, so a replay that skipped the decision
 * would read every later index from the wrong place.
 *
 * What the record buys is a **check**. A ranking function that answered
 * differently is visible against what it answered at the time, and the draw
 * totals move with it. The log does the same thing for draws; this does it for
 * choices.
 *
 * ### The packet ends *before* the choosing hero acts
 *
 * `nextActor` has already drained that hero's accumulator and set
 * `turnOfInstance`, so the returned state has them up and waiting. The next
 * `act` resolves exactly that hero — which is why `act` never calls `nextActor`
 * first, and why a packet and its successor cannot both claim the same turn.
 */

import {
  battleEnded,
  heroStateOf,
  sideOfRow,
  type BattleState,
  type Conclusion,
} from '@lmntlz/sim/rules';
import { decideAction, type SquadMemberConfig } from '@lmntlz/sim/ai';
import { rollTurnStart, type ActionIntent, type Seed } from '@lmntlz/sim/resolver';
import { forcedMove, isChoicePoint } from './choicePoint.js';
import { applyResolution, nextActor, takeTurn } from './turnLoop.js';
import type { ActionPacket, TurnEvent } from './idempotency.js';

/** Per-defending-hero configuration, keyed by instance id, from the snapshot. */
export type DefenderConfigs = Readonly<Record<string, SquadMemberConfig>>;

export interface FoldResult {
  readonly packet: ActionPacket;
  readonly drawsConsumed: bigint;
}

export class MissingDefenderConfigError extends Error {
  constructor(instanceId: string) {
    super(
      `no defence configuration for ${instanceId}. The snapshot is frozen at ` +
        'battle creation, so this is a battle that should never have started.',
    );
    this.name = 'MissingDefenderConfigError';
  }
}

/**
 * **A ceiling on turns inside one packet.**
 *
 * `battleEnded` already stops at the 300 hero-turn cap, so this can only fire
 * if the boundary rule is wrong — and the failure it prevents is a serverless
 * function folding a whole battle into one response while the player waits.
 * Set well above the ~102 turns a real battle takes.
 */
const MAX_TURNS_PER_PACKET = 320;

export class PacketRunawayError extends Error {
  constructor() {
    super(
      `a packet folded ${MAX_TURNS_PER_PACKET} turns without reaching a choice ` +
        'or a conclusion — the packet boundary is not stopping',
    );
    this.name = 'PacketRunawayError';
  }
}

/**
 * Resolve one player intent, then fold forward.
 *
 * `state.turnOfInstance` must already be the acting hero — the previous packet
 * left them up. `drawIndex` is where this packet's draws begin.
 */
export function resolveToNextChoice(
  seed: Seed,
  state: BattleState,
  intent: ActionIntent,
  drawIndex: bigint,
  configs: DefenderConfigs,
): FoldResult {
  const taken = takeTurn(seed, state, intent, drawIndex);

  const first: TurnEvent = {
    actorInstanceId: intent.actorInstanceId,
    powerId: intent.powerId,
    targetInstanceId: intent.targetInstanceId,
    source: 'player',
    outcome: taken.outcome,
  };

  return fold(seed, taken.state, drawIndex + taken.drawsConsumed, configs, [first], drawIndex);
}

/**
 * Fold from a standing start, with no player intent — **the opening packet.**
 *
 * A battle does not begin with the player acting: whoever the turn order puts
 * first may well be a defender, and several turns may resolve before the player
 * is asked anything. `POST /v1/battles` returns this, and the first `act`
 * carries sequence 0.
 */
export function openingPacket(
  seed: Seed,
  state: BattleState,
  drawIndex: bigint,
  configs: DefenderConfigs,
): FoldResult {
  return fold(seed, state, drawIndex, configs, [], drawIndex);
}

function fold(
  seed: Seed,
  startState: BattleState,
  startIndex: bigint,
  configs: DefenderConfigs,
  events: TurnEvent[],
  packetStart: bigint,
): FoldResult {
  let state = startState;
  let index = startIndex;

  const finish = (conclusion: Conclusion | null): FoldResult => ({
    packet: { events: [...events], state, conclusion },
    drawsConsumed: index - packetStart,
  });

  const alreadyOver = battleEnded(state);
  if (alreadyOver) return finish(alreadyOver);

  for (let folded = 0; folded < MAX_TURNS_PER_PACKET; folded++) {
    const step = nextActor(state);
    if (!step) return finish(battleEnded(state));

    state = step.state;

    /**
     * **Turn start rolls before anything reads the board** (021 US3).
     *
     * `Further Than It Looks` grants a row of reach for this turn, and the design
     * requires it be rolled and shown *before* the player chooses — so it has to
     * land above the choice-point check, above the forced-move search, and above
     * the defence AI. Every one of those asks `legalTargets`, and all three would
     * otherwise be answering about a smaller board than the resolver will.
     *
     * It draws only for a champion carrying one of these, so a battle with no
     * runes on it takes exactly the indices it always did.
     */
    const rolled = rollTurnStart(seed, state, step.instanceId, index);
    state = rolled.state;
    index += rolled.drawsConsumed;

    const actor = heroStateOf(state, step.instanceId);
    const isAttacker = sideOfRow(actor.row) === 'attacker';

    /**
     * **The stop, and it happens before the turn is taken.** The hero is up,
     * its accumulator is spent, and the player decides what it does next
     * request. Taking the turn here and asking afterwards would resolve a move
     * nobody chose.
     */
    if (isAttacker && isChoicePoint(state, step.instanceId)) return finish(null);

    const chosen = isAttacker
      ? attackerMove(state, step.instanceId)
      : defenderMove(seed, state, index, step.instanceId, configs);

    index += chosen.drawsConsumed;

    if (chosen.powerId === null) {
      /**
       * **A pass is still a turn.** No draws, no target, and Resolution runs —
       * so cooldowns tick and a status loses a turn. Skipping it entirely is
       * how a hero out of reach stops paying down its cooldowns and comes back
       * with everything available at once.
       */
      state = applyResolution(state, step.instanceId, null);
      events.push({
        actorInstanceId: step.instanceId,
        powerId: null,
        targetInstanceId: null,
        source: isAttacker ? 'player' : 'engine',
        outcome: {
          hit: false,
          crit: false,
          damage: 0,
          healing: 0,
          overheal: 0,
          ridersLanded: [],
          ridersResisted: [],
          deaths: [],
          conclusion: battleEnded(state),
        },
      });
    } else {
      const taken = takeTurn(
        seed,
        state,
        {
          sequence: 0,
          actorInstanceId: step.instanceId,
          powerId: chosen.powerId,
          targetInstanceId: chosen.targetInstanceId,
        },
        index,
      );

      index += taken.drawsConsumed;
      state = taken.state;

      events.push({
        actorInstanceId: step.instanceId,
        powerId: chosen.powerId,
        targetInstanceId: chosen.targetInstanceId,
        /**
         * **`player` for a forced attacker turn.** It is the player's hero and
         * the player's squad; there was simply nothing to choose. Calling it
         * `engine` would make the replay read as though the defence had played
         * the attacker's champion.
         */
        source: isAttacker ? 'player' : 'engine',
        outcome: taken.outcome,
      });
    }

    const conclusion = battleEnded(state);
    if (conclusion) return finish(conclusion);
  }

  throw new PacketRunawayError();
}

interface Move {
  readonly powerId: string | null;
  readonly targetInstanceId: string | null;
  readonly drawsConsumed: bigint;
}

/** A forced attacker turn — one usable power, one legal target, or a pass. */
function attackerMove(state: BattleState, instanceId: string): Move {
  const move = forcedMove(state, instanceId);
  return move
    ? { powerId: move.powerId, targetInstanceId: move.targetInstanceId, drawsConsumed: 0n }
    : { powerId: null, targetInstanceId: null, drawsConsumed: 0n };
}

/**
 * A defender turn, decided by that squad's own configuration.
 *
 * **`decideAction` consumes draws** — targeting tiebreaks are resolved by the
 * seed, not by iteration order — so its count is added to the running index
 * before the turn is resolved. Losing that addition would make the resolution
 * read from indices the decision had already used, and every replay would
 * diverge from the battle it is replaying.
 */
function defenderMove(
  seed: Seed,
  state: BattleState,
  drawIndex: bigint,
  instanceId: string,
  configs: DefenderConfigs,
): Move {
  const config = configs[instanceId];
  if (!config) throw new MissingDefenderConfigError(instanceId);

  const decision = decideAction(state, seed, drawIndex, instanceId, config);

  return {
    powerId: decision.powerId,
    targetInstanceId: decision.targetInstanceId,
    drawsConsumed: decision.drawsConsumed,
  };
}
