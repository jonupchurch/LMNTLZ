/**
 * Who gets the heal. **Stages 1 and 4 only** (FR-011).
 *
 * Reach applies unchanged — a heal is range-limited exactly as an attack is, by
 * the same function, with the same rules about empty rows. That is one rule for
 * enemies and allies alike, and it is why `poolFor` in feature 002 has the
 * ally/enemy distinction in exactly one place.
 *
 * **Taunt and fade do not apply.** They are properties of *enemy* targeting: a
 * taunt compels an attacker, and a fade hides from one. Neither has anything to
 * say about which of your own champions you top up, so stages 2 and 3 are absent
 * rather than present-and-empty.
 *
 * ### One rule, not a pair
 *
 * `SquadMemberConfig.allyRule` is a single choice where `targeting` is a pair,
 * and the asymmetry is measured rather than stylistic: the enemy menu leaves the
 * target undefined 49–80% of the time and needs a fallback, while *lowest HP
 * percentage* over five allies almost always names exactly one. The engine's own
 * tiebreaks cover the rest.
 */

import { getHero } from '@lmntlz/content';
import { heroStateOf, type BattleState } from '../rules/index.js';
import type { Seed } from '../resolver/seed.js';
import { decideAmong, type TargetChoice } from './targeting.js';
import { DEFAULT_ALLY_RULE } from './defaults.js';
import type { SquadMemberConfig } from './types.js';

/**
 * Sort the reachable allies and name one.
 *
 * A champion configured with no `allyRule` — because it owns no friendly power,
 * or because a config was built before it did — falls to **lowest HP
 * percentage**, which is the published default and the only entry that means
 * *"whoever is most hurt"*.
 *
 * The caster is a legal ally of itself, at distance 0, so this never runs out of
 * candidates for a hero that can heal at all.
 */
export function chooseAlly(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  powerId: string,
  config: SquadMemberConfig,
  candidates: readonly string[],
): TargetChoice {
  const actor = heroStateOf(state, actorInstanceId);
  const power = getHero(actor.heroId).powers.find((p) => p.id === powerId);

  if (power && !power.friendly) {
    throw new Error(
      `chooseAlly was given "${powerId}", which is a hostile power. The friendly ` +
        `flag selects the pool, so routing a hostile power through here would ` +
        `aim a damaging strike at an ally.`,
    );
  }

  return decideAmong(state, seed, drawIndex, actorInstanceId, powerId, candidates, [
    config.allyRule ?? DEFAULT_ALLY_RULE,
    // Stage 4. Stages 2 and 3 are deliberately absent — see the module note.
    'nearest',
  ]);
}
