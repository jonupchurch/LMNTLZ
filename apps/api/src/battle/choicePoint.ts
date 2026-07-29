/**
 * Where a packet ends (007 T021).
 *
 * ### The rule, and why it is exactly this
 *
 * ```
 * choice  iff  ( available powers > 1 )  OR  ( legal targets for the only power > 1 )
 * ```
 *
 * A packet runs forward through every turn whose outcome is **forced** and
 * stops at the first turn where the player has something to decide. Getting
 * this boundary wrong is not a crash — it is a game that feels wrong in one of
 * two opposite ways, and the request count is the only place it shows:
 *
 * | | Symptom | What it means |
 * |---|---|---|
 * | Too fine (over ~45 acts) | the game asks constantly | something forced is being treated as a decision |
 * | Too coarse (under ~15) | the game plays itself | **turns that carried a decision are being folded, and the player is not being asked** |
 *
 * The second is far worse and it is the quiet one. Nobody files a bug that says
 * "I had fewer choices than I should have"; they say the game felt shallow.
 *
 * ### Every defender turn folds, always
 *
 * The engine plays all defense (`CLAUDE.md`). A defender turn is never a choice
 * point regardless of how many powers or targets it has, because it is not the
 * player's turn to decide — which is why `isChoicePoint` takes the side into
 * account rather than only counting options.
 */

import {
  availablePowers,
  heroStateOf,
  legalTargets,
  sideOfRow,
  type BattleState,
  type Compulsion,
  type TargetFilter,
} from '@lmntlz/sim/rules';

/**
 * What the board imposes on this hero's turn.
 *
 * **Threaded through rather than ignored**, because a taunt changes what the
 * player is *offered*, not only what the resolver accepts. A compelled target
 * collapses a six-target choice to one — so a boundary that ignored compulsions
 * would stop the packet to present a list with a single legal entry, and would
 * do it on exactly the turns a taunt was meant to take the decision away.
 *
 * Empty here today: statuses become compulsions in `resolveToNextChoice`, which
 * is what will supply this. It is a parameter now so that the rule is written
 * and tested once, rather than retrofitted through two call sites later.
 */
export interface TurnContext {
  readonly filters?: readonly TargetFilter[];
  readonly compulsion?: Compulsion | null;
}

/**
 * The powers a hero can actually fire this turn: **off cooldown, past its tier
 * gate, and with somewhere to point.**
 *
 * ### Why this is not `mustPass`
 *
 * `@lmntlz/sim/rules` exports `mustPass`, whose name and docstring both read
 * like the answer to "does this hero have anything to do?" — and it is not.
 * **It iterates every power the hero *owns*, ignoring cooldowns and tier
 * gates.** So a champion whose only power with a legal target is still gated
 * comes back as *not* passing, and the caller then goes looking for a move that
 * does not exist.
 *
 * Concretely, at hero-turn 1: a reach-2 champion in the attacker's back row can
 * reach nothing, but it owns a friendly power — and a friendly power can always
 * target its own caster at distance 0 — so `mustPass` says false while the hero
 * has no *available* power it can use.
 *
 * Feature 004's `choosePower` gets this right by checking `isPowerAvailable`
 * before `legalTargets`, and it is the only other place that asks the question.
 * This mirrors it deliberately: **one rules engine means both sides of a battle
 * answer "can this hero act?" identically**, and they would not if this called
 * `mustPass` and the engine did not.
 */
export function usablePowers(state: BattleState, instanceId: string, context: TurnContext = {}) {
  const { filters = [], compulsion = null } = context;
  return availablePowers(state, instanceId).filter(
    (power) => legalTargets(state, instanceId, power.id, filters, compulsion).candidates.length > 0,
  );
}

/**
 * Does this hero's turn present the **player** with a real decision?
 *
 * `false` for every defender turn, for a hero that must pass, and for a hero
 * whose single available power has at most one legal target.
 */
export function isChoicePoint(
  state: BattleState,
  instanceId: string,
  context: TurnContext = {},
): boolean {
  const hero = heroStateOf(state, instanceId);

  // The engine decides every defender turn; the player is never asked.
  if (sideOfRow(hero.row) !== 'attacker') return false;

  /**
   * **Counted over powers that can actually be used**, not over powers that are
   * merely off cooldown. A power with no legal target is not an option, and
   * counting it would stop the packet to offer a choice between one real move
   * and one impossible one.
   *
   * Zero usable powers is a pass — nothing to do and nothing to decide.
   */
  const usable = usablePowers(state, instanceId, context);

  if (usable.length === 0) return false;
  if (usable.length > 1) return true;

  /**
   * One power, so the decision — if there is one — is which target.
   *
   * **A compelled target is not a choice.** A taunt that names one hero leaves
   * the player nothing to pick even when the pool is large, so the packet
   * carries on rather than presenting a list with one legal entry.
   */
  const targeting = legalTargets(
    state,
    instanceId,
    usable[0]!.id,
    context.filters ?? [],
    context.compulsion ?? null,
  );
  if (targeting.compelled !== null) return false;

  return targeting.candidates.length > 1;
}

/**
 * The single forced move for a turn that is **not** a choice point, or `null`
 * when the hero passes.
 *
 * Used for the attacker's own forced turns. Defender turns go through
 * `@lmntlz/sim/ai` instead, because they are decided by that squad's
 * configuration rather than by there being only one option.
 */
export function forcedMove(
  state: BattleState,
  instanceId: string,
  context: TurnContext = {},
): { readonly powerId: string; readonly targetInstanceId: string } | null {
  const { filters = [], compulsion = null } = context;

  for (const power of usablePowers(state, instanceId, context)) {
    const targeting = legalTargets(state, instanceId, power.id, filters, compulsion);
    const target = targeting.compelled ?? targeting.candidates[0];
    if (target !== undefined) return { powerId: power.id, targetInstanceId: target };
  }

  return null;
}
