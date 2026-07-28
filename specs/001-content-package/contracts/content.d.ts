/**
 * `packages/content` — the public surface.
 *
 * Feature 001. Every other feature speaks this vocabulary; nothing else in the
 * repository may define a hero, a damage type or an effectiveness value.
 *
 * Constitution XV governs this file: `bane`, `fault`, `strengths` and every
 * effectiveness value are DERIVED. There is no setter for any of them and no
 * lookup table anywhere in the package.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MagicType = 'earth' | 'air' | 'fire' | 'water' | 'light' | 'dark';
export type MeleeType = 'slash' | 'pierce' | 'crush';
export type DamageType = MagicType | MeleeType;

export type Family = 'magic' | 'melee';
export type Role = 'striker' | 'tank' | 'ranged' | 'buffer';
export type Reach = 1 | 2;
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

/** The five effectiveness values. Nothing else is representable. */
export type Effectiveness = 1.5 | 1.25 | 1.0 | 0.8 | 0.5;

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export interface HeroStats {
  might: number;
  perception: number;
  agility: number;
  toughness: number;
  speed: number;
  luck: number;
  armor: number;
  magicResist: number;
  resolve: number;
  penetration: number;
}

export interface Power {
  readonly id: string;
  readonly name: string;
  readonly tier: Tier;
  /** Blank for the three powers that deal neither damage nor healing. */
  readonly multiplier: number | null;
  /** Integer turn count. Never milliseconds. Never fractional. */
  readonly cooldown: number;
  /** Tier 4 -> 3, tier 5 -> 5, everything else -> 1. */
  readonly gateTurn: number;
  /** A dual-typed power resolves as the BETTER of its two types. */
  readonly types: readonly [DamageType] | readonly [DamageType, DamageType];
  readonly targets: 'single' | 'row' | 'party' | number;
  readonly friendly: boolean;
  /** Present in the schema before any reactive power is authored, so the
   *  hero-numbers pass needs no migration. See 03-powers.md. */
  readonly reactive: boolean;
}

export interface Hero {
  readonly id: string;          // stable; survives a display-name change (FR-011)
  readonly name: string;
  readonly slug: string;

  // --- the ONLY two authored relationship fields (FR-001) ------------------
  readonly primary: DamageType;
  readonly secondary: DamageType;

  // --- derived; never present in any source file (FR-002) ------------------
  readonly family: Family;
  readonly strengths: readonly [DamageType, DamageType];  // {primary, secondary}
  readonly bane: DamageType;                              // counter(primary)
  readonly fault: DamageType;                             // counter(secondary)

  readonly role: Role;
  readonly reach: Reach;
  readonly stats: Readonly<HeroStats>;
  readonly powers: readonly [Power, Power, Power, Power, Power, Power];
  readonly passives: readonly [string, string, string];   // role, house, unique
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

/** Throws `UnknownHeroError` rather than returning undefined — a missing hero is
 *  a content bug, not a runtime condition a caller should branch on. */
export function getHero(id: string): Hero;

/** All 27, in stable roster order. Frozen. */
export function getAllHeroes(): readonly Hero[];

/**
 * The bijection over all nine types. Never crosses magic/melee (FR-003).
 *   earth<->air · fire<->water · light<->dark · crush->slash->pierce->crush
 */
export function counter(type: DamageType): DamageType;

/**
 * Takes a HERO, not a type (FR-007).
 *
 * Effectiveness reads the defender's TWO authored types, so a 9x9 type-versus-type
 * table cannot express `fault` or the x0.80 secondary case. This signature is the
 * enforcement: there is no overload accepting a bare defending type.
 */
export function effectiveness(attackType: DamageType, defender: Hero): Effectiveness;

/**
 * A dual-typed power resolves as the better of its two types (FR-009).
 * Single-typed powers take the same path — one array element, same code.
 */
export function powerEffectiveness(power: Power, defender: Hero): Effectiveness;

/** `"c" + sha256(authored workbook bytes)[0:12]`. See research.md Q3.
 *  Distinct from `engineVersion`; the two are never merged (Constitution XVI). */
export function contentVersion(): string;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationRule =
  | 'secondary-equals-primary'
  | 'secondary-is-counter-of-primary'
  | 'primary-is-counter-of-secondary'
  | 'stat-exceeds-cap'
  | 'stat-budget-violated'
  | 'cooldown-not-integer'
  | 'derived-column-disagrees'    // the workbook's convenience columns drifted
  | 'roster-size'
  | 'legal-pairing-count';        // the 60-of-72 enumeration (FR-005)

export interface ValidationFailure {
  readonly rule: ValidationRule;
  readonly heroId: string | null;   // null for roster-wide rules
  readonly field: string | null;
  readonly message: string;         // names the hero AND the field (FR-017)
}

/**
 * Runs at build time and again at startup. A non-empty result MUST prevent the
 * game from starting (FR-015) — an invalid roster never reaches play.
 */
export function validateRoster(): readonly ValidationFailure[];

/** Used by the authoring tooling and by the FR-005 enumeration test. */
export function isLegalPairing(
  primary: DamageType,
  secondary: DamageType,
): { legal: true } | { legal: false; rule: ValidationRule };
