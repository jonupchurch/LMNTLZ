/**
 * The content schema (FR-001, FR-010, FR-013, FR-014).
 *
 * **Every object here is strict.** That is the enforcement of FR-001 rather than
 * a stylistic preference: a source file carrying a hand-authored `bane`, `fault`
 * or `strengths` must be *rejected*, and a non-strict schema would silently strip
 * the field and let the file look valid. Constitution XV is only real if the
 * illegal thing fails loudly.
 */

import { z } from 'zod';
import { DAMAGE_TYPES, MAGIC_TYPES, MELEE_TYPES, family, type DamageType } from './types.js';
import { isLegalPairing } from './derive.js';

// ---------------------------------------------------------------------------
// Validation vocabulary
// ---------------------------------------------------------------------------

export type ValidationRule =
  | 'secondary-equals-primary'
  | 'secondary-is-counter-of-primary'
  | 'primary-is-counter-of-secondary'
  | 'stat-exceeds-cap'
  | 'stat-budget-violated'
  | 'cooldown-not-integer'
  | 'derived-column-disagrees'
  | 'roster-size'
  | 'legal-pairing-count';

export interface ValidationFailure {
  readonly rule: ValidationRule;
  readonly heroId: string | null;
  readonly field: string | null;
  /** Names the hero AND the field (FR-017). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Constants that the design fixed
// ---------------------------------------------------------------------------

/** `01-stats.md`: every stat is capped at 75; anything past it is ignored. */
export const STAT_CAP = 75;

/**
 * `01-stats.md`: **275 if a hero is arcane and not a Striker; 300 otherwise.**
 * 15 heroes at 300, 12 at 275, no outliers.
 */
export function statBudgetFor(primary: DamageType, role: Role): number {
  return family(primary) === 'magic' && role !== 'striker' ? 275 : 300;
}

export const STAT_KEYS = Object.freeze([
  'might',
  'perception',
  'agility',
  'toughness',
  'speed',
  'luck',
  'armor',
  'magicResist',
  'resolve',
  'penetration',
] as const);

export type StatKey = (typeof STAT_KEYS)[number];

// ---------------------------------------------------------------------------
// Leaf schemas
// ---------------------------------------------------------------------------

export const damageTypeSchema = z.enum(DAMAGE_TYPES as readonly [DamageType, ...DamageType[]]);

export const roleSchema = z.enum(['striker', 'tank', 'ranged', 'buffer']);
export type Role = z.infer<typeof roleSchema>;

/** Rows on the shared 1-6 axis. Nothing between, nothing beyond (T039). */
export const reachSchema = z.union([z.literal(1), z.literal(2)]);

/**
 * A stat is a whole number from 0 to the cap. Fractional stats are refused
 * rather than rounded — a rounded stat is a number nobody authored.
 */
const statSchema = z
  .number()
  .int('must be a whole number')
  .min(0, 'cannot be negative')
  .max(STAT_CAP, `exceeds the ${STAT_CAP} cap`);

export const heroStatsSchema = z.strictObject({
  might: statSchema,
  perception: statSchema,
  agility: statSchema,
  toughness: statSchema,
  speed: statSchema,
  luck: statSchema,
  armor: statSchema,
  magicResist: statSchema,
  resolve: statSchema,
  penetration: statSchema,
});

export type HeroStats = z.infer<typeof heroStatsSchema>;

export const powerSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  /** Blank for the three powers that deal neither damage nor healing. */
  multiplier: z.number().positive().nullable(),
  /**
   * **Integer turn counts only** (T038, FR-013). The settled design says
   * cooldowns are turns and never milliseconds; a fractional value here is
   * almost always a duration in seconds that leaked in from somewhere.
   */
  cooldown: z.number().int('cooldowns are whole turns, never fractional').min(0),
  /** tier 4 -> 3, tier 5 -> 5, everything else -> 1. */
  gateTurn: z.number().int().min(1),
  types: z.union([
    z.tuple([damageTypeSchema]),
    z.tuple([damageTypeSchema, damageTypeSchema]),
  ]),
  targets: z.union([z.literal('single'), z.literal('row'), z.literal('party'), z.number().int().positive()]),
  friendly: z.boolean(),
  /** Accepted now so the hero-numbers pass needs no migration (T039). */
  reactive: z.boolean(),
});

export type Power = z.infer<typeof powerSchema>;

// ---------------------------------------------------------------------------
// The authored hero
// ---------------------------------------------------------------------------

/**
 * What a source file is allowed to say about a hero.
 *
 * Note what is **absent**: `bane`, `fault`, `strengths` and `family`. They are
 * not optional here, they are unrepresentable — the schema is strict, so a file
 * offering one is rejected by name (FR-001).
 */
export const authoredHeroSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    primary: damageTypeSchema,
    secondary: damageTypeSchema,
    role: roleSchema,
    reach: reachSchema,
    stats: heroStatsSchema,
    powers: z.tuple([
      powerSchema,
      powerSchema,
      powerSchema,
      powerSchema,
      powerSchema,
      powerSchema,
    ]),
    passives: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  })
  .superRefine((h, ctx) => {
    const result = isLegalPairing(h.primary, h.secondary);
    if (!result.legal) {
      ctx.addIssue({
        code: 'custom',
        message: `hero "${h.id}": field "secondary" — ${h.primary}/${h.secondary} is an illegal pairing (${result.rule})`,
        path: ['secondary'],
      });
    }
  });

export type AuthoredHero = z.infer<typeof authoredHeroSchema>;

/** The four fields a source file may never carry (FR-001). */
export const FORBIDDEN_AUTHORED_FIELDS = Object.freeze([
  'bane',
  'fault',
  'strengths',
  'family',
] as const);

// ---------------------------------------------------------------------------
// Roster-wide rules (T019, FR-010)
// ---------------------------------------------------------------------------

export const ROSTER_SIZE = 27;
export const CHAMPIONS_PER_TYPE = 3;

/** 9 x 9, minus the nine self-pairings, minus the twelve that collide. */
export const LEGAL_PAIRING_COUNT = 60;

/**
 * Roster-wide checks that no per-hero schema can express.
 *
 * The `legal-pairing-count` assertion is the odd one out and the important one:
 * it does not look at the roster at all. It re-derives the size of the legal
 * space from `counter` and fails if it is not 60 — so a change to the bijection
 * that quietly widened what heroes may be authored breaks here, at build time,
 * rather than showing up as a hero nobody meant to allow.
 */
export function checkRosterRules(heroes: readonly AuthoredHero[]): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (heroes.length !== ROSTER_SIZE) {
    failures.push({
      rule: 'roster-size',
      heroId: null,
      field: null,
      message: `roster has ${heroes.length} heroes, expected exactly ${ROSTER_SIZE}`,
    });
  }

  for (const type of DAMAGE_TYPES) {
    const champions = heroes.filter((h) => h.primary === type);
    if (champions.length !== CHAMPIONS_PER_TYPE) {
      failures.push({
        rule: 'roster-size',
        heroId: null,
        field: 'primary',
        message:
          `damage type "${type}" has ${champions.length} champions, ` +
          `expected exactly ${CHAMPIONS_PER_TYPE}`,
      });
    }
  }

  const legal = DAMAGE_TYPES.flatMap((primary) =>
    DAMAGE_TYPES.filter((secondary) => isLegalPairing(primary, secondary).legal),
  );

  if (legal.length !== LEGAL_PAIRING_COUNT) {
    failures.push({
      rule: 'legal-pairing-count',
      heroId: null,
      field: null,
      message:
        `the legal pairing space is ${legal.length}, expected ${LEGAL_PAIRING_COUNT} — ` +
        `counter() or the distinctness rules changed`,
    });
  }

  const ids = new Set<string>();
  for (const hero of heroes) {
    if (ids.has(hero.id)) {
      failures.push({
        rule: 'roster-size',
        heroId: hero.id,
        field: 'id',
        message: `hero "${hero.id}": duplicate id`,
      });
    }
    ids.add(hero.id);
  }

  return failures;
}

/** Sanity: the two families partition the nine types. Cheap, and it has been wrong before. */
export function checkTypeFamilies(): ValidationFailure[] {
  return MAGIC_TYPES.length + MELEE_TYPES.length === DAMAGE_TYPES.length
    ? []
    : [
        {
          rule: 'roster-size',
          heroId: null,
          field: null,
          message: 'the magic and melee families do not partition the nine damage types',
        },
      ];
}
