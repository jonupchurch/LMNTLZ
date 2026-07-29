/**
 * `@lmntlz/sim/ai` — the engine plays every defense squad. **Server only.**
 *
 * The third subtree, alongside `rules` and `resolver`, and the split is by what
 * a module *does* rather than by what it imports:
 *
 * - `rules` computes. Pure, shared, client-safe.
 * - `resolver` draws. Server only, because it holds the seed.
 * - `ai` **chooses**. Server only, because shipping it would hand every player
 *   the exact ranking and target preference the engine will use against them.
 *
 * **One thing that looks like it belongs here and does not**: `firingProfile`
 * lives in `rules`. A firing profile is arithmetic over the cooldown ladder — a
 * pure function of `(hero, ranking)` with no randomness and no server state — and
 * the squad builder needs it on every drag of a ranking widget. Putting it here
 * would force an endpoint and a round trip onto a calculation the client can do
 * itself.
 */

export type { PowerRanking, SquadMemberConfig, TargetRule } from './types.js';
export { TARGET_RULES, needsAllyRule } from './types.js';

export {
  DEFAULT_ALLY_RULE,
  ROLE_DEFAULTS,
  SAFE_ORDERINGS,
  defaultConfigFor,
  roleDefaults,
  safeOrderings,
} from './defaults.js';

export { choosePower } from './powerChoice.js';
export type { ChoiceContext, PowerChoice } from './powerChoice.js';

export { chooseTarget, decideAmong } from './targeting.js';
export type { TargetChoice } from './targeting.js';

export { chooseAlly } from './allyChoice.js';

export { decideAction } from './decide.js';
export type { Decision } from './decide.js';
