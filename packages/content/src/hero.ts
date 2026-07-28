/**
 * The `Hero` shape as everything downstream sees it — the authored fields plus
 * the four derived ones, already resolved.
 *
 * `AuthoredHero` in `schema.ts` is what a *source file* may say. This is what a
 * *consumer* gets. The difference between them is exactly the derivation, which
 * is why they are two types and not one with optional fields.
 */

import type { DamageType, Family } from './types.js';
import type { AuthoredHero, HeroStats, Power, Role } from './schema.js';

export type { HeroStats, Power, Role };

export type Reach = 1 | 2;
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export interface Hero extends AuthoredHero {
  // --- derived; never present in any source file (FR-002) ------------------
  readonly family: Family;
  readonly strengths: readonly [DamageType, DamageType];
  /** `counter(primary)` — the major weakness, super-effective. */
  readonly bane: DamageType;
  /** `counter(secondary)` — the minor weakness. */
  readonly fault: DamageType;
}

export class UnknownHeroError extends Error {
  readonly heroId: string;

  constructor(heroId: string, known: readonly string[]) {
    super(
      `unknown hero "${heroId}". A missing hero is a content bug, not a runtime ` +
        `condition — known ids: ${known.join(', ')}`,
    );
    this.name = 'UnknownHeroError';
    this.heroId = heroId;
  }
}
