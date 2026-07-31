/**
 * `@lmntlz/content` — the public surface.
 *
 * Every other feature speaks this vocabulary; nothing else in the repository may
 * define a hero, a damage type or an effectiveness value.
 */

import { HEROES } from './heroes.generated.js';
import { UnknownHeroError, type Hero } from './hero.js';
import { validateHeroes } from './validate.js';
import type { ValidationFailure } from './schema.js';

export { counter, family, isDamageType, DAMAGE_TYPES, MAGIC_TYPES, MELEE_TYPES } from './types.js';
export type { DamageType, MagicType, MeleeType, Family } from './types.js';

export { derive, isLegalPairing, IllegalPairingError } from './derive.js';
export type { DerivedProfile } from './derive.js';

export { effectiveness, powerEffectiveness } from './effectiveness.js';
export type { Effectiveness } from './effectiveness.js';
/**
 * The five tiers by name, alongside the functions that return them.
 *
 * Added for 017 T024: `RelationshipStrip` must render all five and the task
 * requires them **read from here**, not transcribed — four design exports print
 * `FAULT ×1.2` and none prints `×0.80`, so any component that types its own
 * ladder is one copy-paste from shipping the wrong one. Exporting the values
 * makes the correct ladder the path of least resistance, and the `Effectiveness`
 * union above makes the wrong one a compile error.
 */
export {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_SECONDARY,
  RESISTED_PRIMARY,
} from './effectiveness.js';

export { contentVersion } from './version.js';

export { UnknownHeroError } from './hero.js';
export type { Hero, HeroStats, Power, Role, Reach, Tier } from './hero.js';
/**
 * The 27 ids as a literal union, generated with the roster (017 T035).
 *
 * `Hero['id']` is `string` and cannot narrow, so anything keyed *by* hero —
 * the icon manifest, a rune allocation map — would accept `h99` and fail at
 * runtime. `Record<HeroId, T>` makes that a compile error and makes the map
 * exhaustive: add a 28th hero and every such record stops compiling until it
 * is filled in, which is the point.
 */
export { HERO_IDS } from './heroes.generated.js';
export type { HeroId } from './heroes.generated.js';

export { validateHeroes } from './validate.js';
export type { ValidationFailure, ValidationRule } from './schema.js';
export { STAT_CAP, STAT_KEYS, ROSTER_SIZE, LEGAL_PAIRING_COUNT } from './schema.js';
/**
 * `StatKey` accompanies `STAT_KEYS` because a consumer that can iterate the stats
 * almost always needs to key by one — 010's rune allocations are
 * `Partial<Record<StatKey, number>>`. Exporting the values without the type left
 * every caller re-deriving `(typeof STAT_KEYS)[number]` for itself.
 */
export type { StatKey } from './schema.js';

// ---------------------------------------------------------------------------
// The startup guard (T021, FR-015)
// ---------------------------------------------------------------------------

/**
 * **An invalid roster prevents startup.**
 *
 * This runs at module load, which is the whole point: the alternative is a
 * validation call somebody has to remember to make, and the failure surfacing
 * mid-battle instead of before the process is listening. A content bug should
 * cost a failed deploy, never a corrupted match.
 */
const startupFailures = validateHeroes(HEROES);
if (startupFailures.length > 0) {
  throw new Error(
    `@lmntlz/content: the roster is invalid and the game must not start.\n` +
      startupFailures.map((f) => `  - [${f.rule}] ${f.message}`).join('\n'),
  );
}

const BY_ID: ReadonlyMap<string, Hero> = new Map(HEROES.map((h) => [h.id, h]));

/**
 * Throws rather than returning `undefined` (FR-011).
 *
 * A missing hero is a content bug. Returning `undefined` would push a branch
 * onto every call site for a condition that must never happen, and those
 * branches get written to do something plausible instead of stopping.
 */
export function getHero(id: string): Hero {
  const hero = BY_ID.get(id);
  if (!hero) throw new UnknownHeroError(id, [...BY_ID.keys()]);
  return hero;
}

/** All 27, in stable roster order. Frozen. */
export function getAllHeroes(): readonly Hero[] {
  return HEROES;
}

/** Re-runs validation on demand. Empty on any roster that got this far. */
export function validateRoster(): readonly ValidationFailure[] {
  return validateHeroes(HEROES);
}
