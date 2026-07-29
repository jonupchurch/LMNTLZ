/**
 * One defender's whole turn, in the one order it can be resolved in.
 *
 * **Power preference resolves first, then targeting** (FR-005, T021). That is
 * not a stylistic sequencing — type effectiveness is a property of the *power*,
 * so tiebreak 3 and the `least-mitigation` rule are both unanswerable until the
 * power is known. Choosing a target first and then a power for it would leave
 * the two most discriminating rules on the menu with nothing to read.
 *
 * The result is an `ActionIntent`, which is deliberately the same shape the
 * player's client sends. **The engine and the player go through the same door**:
 * the resolver cannot tell whose turn it resolved, so a defense cannot acquire a
 * privilege an attacker lacks by taking a different path into the same code.
 */

import { getHero } from '@lmntlz/content';
import { heroStateOf, legalTargets, type BattleState } from '../rules/index.js';
import type { Compulsion, TargetFilter } from '../rules/targeting.js';
import type { Seed } from '../resolver/seed.js';
import { choosePower, type ChoiceContext } from './powerChoice.js';
import { chooseAlly } from './allyChoice.js';
import { chooseTarget } from './targeting.js';
import type { SquadMemberConfig } from './types.js';

export interface Decision {
  readonly actorInstanceId: string;
  /** `null` when the hero passes — no power it owns had a legal target. */
  readonly powerId: string | null;
  readonly targetInstanceId: string | null;
  readonly drawsConsumed: bigint;
}

/**
 * Choose a power, then a target for it.
 *
 * **Nothing here reads a zone** (FR-013). Visible and Hidden squads are played
 * by exactly this function with exactly these inputs; the distinction between
 * them is visibility and reward, never behaviour. A defender who moved a squad
 * from one to the other would find it playing identically, which is the property
 * that keeps Hidden from being a second, better AI nobody can scout.
 */
export function decideAction(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  config: SquadMemberConfig,
  context: ChoiceContext = {},
): Decision {
  const choice = choosePower(state, actorInstanceId, config, context);

  if ('pass' in choice) {
    return { actorInstanceId, powerId: null, targetInstanceId: null, drawsConsumed: 0n };
  }

  const actor = heroStateOf(state, actorInstanceId);
  const power = getHero(actor.heroId).powers.find((p) => p.id === choice.powerId)!;
  const legal = legalTargets(
    state,
    actorInstanceId,
    choice.powerId,
    context.filters ?? [],
    context.compulsion ?? null,
  );

  // **Stage 3 is applied here, and it has to be.** `legalTargets` reports
  // `compelled` alongside `candidates` rather than narrowing the set itself, so
  // a caller that read `candidates` alone would silently drop every taunt in the
  // game — the preference would sort the full pool and the compulsion would
  // have no effect it could point at. Narrowing before the sort is also what
  // makes "a taunt beats a priority" structural rather than a rule: by the time
  // any preference runs, there is one champion left to prefer.
  const candidates = legal.compelled === null ? legal.candidates : [legal.compelled];

  const chosen = power.friendly
    ? chooseAlly(state, seed, drawIndex, actorInstanceId, choice.powerId, config, candidates)
    : chooseTarget(state, seed, drawIndex, actorInstanceId, choice.powerId, config, candidates);

  return {
    actorInstanceId,
    powerId: choice.powerId,
    targetInstanceId: chosen.targetInstanceId,
    drawsConsumed: chosen.drawsConsumed,
  };
}

export type { ChoiceContext, Compulsion, TargetFilter };
