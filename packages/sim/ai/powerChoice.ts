/**
 * Which power fires. **The ranking is the whole of the decision.**
 *
 * Highest-ranked power that is off cooldown, past its gate, and has somebody to
 * point at. That is the entire algorithm, and its plainness is the design:
 *
 * > **This does not re-rank to chase a matchup.** It could notice that a
 * > lower-ranked power would be super-effective against the champion in front of
 * > it, and it must not. The ranking is the defender's lever — the deepest one
 * > in the game — and an optimizer that overrode it would collapse every defense
 * > toward the same choice. Twelve players who ranked their squads differently
 * > would find the engine playing all twelve identically.
 *
 * **Power preference resolves first, then targeting** (FR-005). Type
 * effectiveness depends on which power fired, so the power has to be known
 * before a target can be scored — the reverse order is not merely a different
 * choice, it is unimplementable.
 */

import { getHero, type Power } from '@lmntlz/content';
import { isPowerAvailable, legalTargets, type BattleState } from '../rules/index.js';
import type { Compulsion, TargetFilter } from '../rules/targeting.js';
import { heroStateOf } from '../rules/state.js';
import { InvalidRankingError } from '../rules/firingProfile.js';
import type { SquadMemberConfig } from './types.js';

export type PowerChoice = { readonly powerId: string } | { readonly pass: true };

export interface ChoiceContext {
  readonly filters?: readonly TargetFilter[];
  readonly compulsion?: Compulsion | null;
}

function rankedPowers(heroId: string, ranking: SquadMemberConfig['ranking']): readonly Power[] {
  const seen = new Set(ranking);
  if (seen.size !== 6) throw new InvalidRankingError(ranking);

  return ranking.map((tier) => {
    const found = getHero(heroId).powers.find((p) => p.tier === tier);
    if (!found) throw new InvalidRankingError(ranking);
    return found;
  });
}

/**
 * The power this hero fires this turn, or `pass`.
 *
 * **`pass` is never a tactical choice** (FR-006, FR-012). It comes back only
 * when no power the hero owns has a legal target — a reach-1 champion in the
 * back seat at full formation, three occupied rows from anything. It is not
 * "held its action"; there was no action to take. The hero still reaches
 * Resolution, so its cooldowns still tick.
 *
 * Note the check is per power rather than per hero. Reach is a property of the
 * hero, but the *pool* is chosen by the power's `friendly` flag — so a champion
 * that cannot reach an enemy may still have a friendly power with a legal target
 * (itself, at distance 0). It heals rather than passing, which is right: doing
 * something is better than doing nothing, and the ranking said so.
 */
export function choosePower(
  state: BattleState,
  actorInstanceId: string,
  config: SquadMemberConfig,
  context: ChoiceContext = {},
): PowerChoice {
  const actor = heroStateOf(state, actorInstanceId);
  const { filters = [], compulsion = null } = context;

  for (const power of rankedPowers(actor.heroId, config.ranking)) {
    if (!isPowerAvailable(power, actor.cooldowns, state.heroTurn)) continue;

    const { candidates } = legalTargets(state, actorInstanceId, power.id, filters, compulsion);
    if (candidates.length > 0) return { powerId: power.id };
  }

  return { pass: true };
}
