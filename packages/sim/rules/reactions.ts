/**
 * Reactions — **the only way a hero acts outside its own turn.**
 *
 * `04-turns.md` § *Reactions* specifies the whole mechanic and then records that
 * it "currently governs nothing — there is not a single reactive power in the
 * roster". As of 2026-08-02 there is one (`Redouble`, on the three Slash
 * champions), which is what makes this module worth writing and what turns
 * `Already Gone` and `Nothing to Discuss` from names into passives.
 *
 * ### What lives here and what does not
 *
 * **This module answers *may* and never *what happens*.** Deciding a reaction
 * fires is a rule — reach, cooldown, standing, the two passives — and rules may
 * not consume randomness (`purity.test.ts` walks the import graph). Resolving
 * the counter is an attack, and every attack draws, so that belongs to the
 * resolver.
 *
 * ### The fence, and why it is structural
 *
 * > **A reaction cannot trigger a reaction.** Phase 4 resolves exactly one layer
 * > deep and stops.
 *
 * Both squads are counter-built by design, so two squads full of reactive powers
 * would otherwise ping-pong forever on one strike — an infinite loop reachable
 * through ordinary play, on a server that resolves the whole turn before
 * answering the client.
 *
 * A depth counter would express that. It is not what the resolver does:
 * `resolveOne` calls `enactReactions`, `enactReactions` calls `resolveStrike`,
 * and `resolveStrike` calls neither. **The layer bound is the call graph**, so
 * there is no counter to pass wrongly and no default to forget — a second layer
 * would need somebody to write a new edge, not to mis-set a number.
 */

import { getHero, type Power } from '@lmntlz/content';
import { deniesReactions, refusesReactions, targetingFor } from './passives.js';
import { isPowerAvailable } from './phases.js';
import { heroStateOf, isStanding, type BattleState, type HeroState } from './state.js';
import { legalTargets } from './targeting.js';

/**
 * A hero that was hit (or swung at) and may answer.
 *
 * `connected` is the resolver's finding, not this module's: **it is the word
 * *damages* in `Nothing to Discuss`**, and a rule cannot know whether a payload
 * landed. On a miss it is `false` for everybody the swing would have reached.
 */
export interface ReactionCandidate {
  readonly instanceId: string;
  readonly connected: boolean;
}

/** A counter that will fire: who swings back, and with what. */
export interface ReactionOpportunity {
  readonly reactorInstanceId: string;
  readonly powerId: string;
}

/**
 * The reactive power this champion owns, or `null`.
 *
 * **First by tier order rather than "the" reactive power**, because the roster
 * could author a second one on a hero and a lookup that threw would take a
 * battle down for a content edit. `content`'s own test asserts at most one per
 * champion; this stays total regardless.
 */
export function reactivePowerOf(heroId: string): Power | null {
  return getHero(heroId).powers.find((p) => p.reactive) ?? null;
}

/**
 * May `reactor` counter `attacker`, and with what?
 *
 * Every gate here is a rule settled elsewhere, and the ordering is cheapest
 * first — the common case on a board with no reactive power at all is one
 * `find` that returns nothing.
 *
 * 1. **A dead defender cannot react.** It was removed in phase 3, and phase 4
 *    gives nothing to corpses. Nor can a dead attacker be countered — an earlier
 *    reaction in the same phase may have killed it.
 *
 *    ⚠️ **Only the first half of that line is load-bearing**, which mutation
 *    testing found rather than reasoning: deleting `isStanding(attacker)` breaks
 *    nothing, because `poolFor` at step 6 already refuses a fallen target and a
 *    corpse is in nobody's pool. It stays because phase 4's rule is *"gives
 *    nothing to corpses"* in both directions and a reader looking for it should
 *    find it stated, not have to derive it from targeting — but the guarantee
 *    lives one layer down and `reactions.test.ts` pins it there.
 * 2. **It has to own one**, and `reactive` is a property of the power.
 * 3. **A reactive power has a cooldown like any other**, counted in its owner's
 *    turns. The gate turn is checked with it, so a tier-5 reaction could not
 *    counter on turn 1.
 * 4. **`Already Gone`** — the attacker cannot be the target of a reactive power,
 *    landed blow or missed one.
 * 5. **`Nothing to Discuss`** — the attacker silences whoever it *damaged*, so a
 *    swing it missed with denies nothing.
 * 6. **A reaction respects reach.** `02-squads.md` states one reach rule with no
 *    exceptions; a defender that cannot reach its attacker cannot counter it.
 *
 * On (6), one deliberate reading: the reactor's **filters apply and its
 * compulsion does not.** A fade on the attacker hides it from a counter exactly
 * as it hides it from an attack — that is one rule with no exceptions. A taunt
 * is different in kind: it says *whom you must pick* on your own turn, and a
 * counter has no pick to make. Letting a taunt elsewhere on the board suppress a
 * retaliation would make a third hero's status decide whether these two exchange
 * blows.
 */
export function reactionFor(
  state: BattleState,
  reactorInstanceId: string,
  attackerInstanceId: string,
  connected: boolean,
): ReactionOpportunity | null {
  const reactor = heroStateOf(state, reactorInstanceId);
  const attacker = heroStateOf(state, attackerInstanceId);

  if (!isStanding(reactor) || !isStanding(attacker)) return null;

  const power = reactivePowerOf(reactor.heroId);
  if (power === null) return null;

  if (!isPowerAvailable(power, reactor.cooldowns, state.heroTurn)) return null;

  if (refusesReactions(attacker)) return null;
  if (connected && deniesReactions(attacker)) return null;

  const { filters } = targetingFor(state, reactorInstanceId);
  const { candidates } = legalTargets(state, reactorInstanceId, power.id, filters, null);
  if (!candidates.includes(attackerInstanceId)) return null;

  return { reactorInstanceId, powerId: power.id };
}

/**
 * The order counters resolve in — **row, then instance id**, the same order
 * every other per-target loop in the resolver uses.
 *
 * Iteration order is a replay hazard that does not look like one, and it matters
 * more here than in most loops: this decides who counters *first*, which decides
 * who is still standing to counter at all.
 *
 * Ordering only. {@link reactionFor} is asked separately, per candidate, against
 * the board as it stands when that candidate's turn to answer arrives — an
 * earlier counter may have felled the attacker, and a list computed once up front
 * would let a dead hero be countered.
 */
export function inReactionOrder(
  state: BattleState,
  candidates: readonly ReactionCandidate[],
): readonly ReactionCandidate[] {
  return [...candidates].sort((a, b) => {
    const left = heroStateOf(state, a.instanceId);
    const right = heroStateOf(state, b.instanceId);
    return (
      left.row - right.row ||
      (left.instanceId < right.instanceId ? -1 : left.instanceId > right.instanceId ? 1 : 0)
    );
  });
}

/**
 * The cooldown a fired reaction writes, **charged the instant it fires**.
 *
 * `chargeAfterFiring`'s `+ 1` exists to absorb the unconditional Resolution tick
 * on the turn a power was cast. A reaction fires during **somebody else's** turn,
 * so its owner's Resolution has not run and will not until its own next turn —
 * at which point the charge ticks to `cooldown` and matches a normally-cast power
 * exactly. Same arithmetic, arrived at from the other side.
 *
 * ⚠️ **Written even for a cooldown-0 power**, which is the one place this differs
 * from `resolveClocks`. There, a free power is left free because a tier-0
 * auto-attack that could be locked out would leave a silenced hero with nothing
 * to do. Here, no charge at all would let a defender counter *every* incoming
 * blow — and the fence `04-turns.md` names is "at most once per its own turn
 * cycle, however many times it is hit". That fence is the charge.
 */
export function reactionCharge(cooldown: number): number {
  return cooldown + 1;
}

/** The reactor with its counter on cooldown. Pure — the caller replaces the hero. */
export function chargeReaction(reactor: HeroState, powerId: string, cooldown: number): HeroState {
  return {
    ...reactor,
    cooldowns: { ...reactor.cooldowns, [powerId]: reactionCharge(cooldown) },
  };
}
