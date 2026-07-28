/**
 * The nine damage types, the two families, and the `counter` bijection.
 *
 * **Constitution XV governs this file.** `counter` is the single source of every
 * weakness in the game: a hero's Bane is `counter(primary)` and its Fault is
 * `counter(secondary)`. Nothing anywhere else in the repository may state a
 * weakness, and there is no 9x9 table — see `effectiveness.ts` for why one could
 * not express the rules even if someone wrote it.
 */

export type MagicType = 'earth' | 'air' | 'fire' | 'water' | 'light' | 'dark';
export type MeleeType = 'slash' | 'pierce' | 'crush';
export type DamageType = MagicType | MeleeType;

export type Family = 'magic' | 'melee';

export const MAGIC_TYPES: readonly MagicType[] = Object.freeze([
  'earth',
  'air',
  'fire',
  'water',
  'light',
  'dark',
]);

export const MELEE_TYPES: readonly MeleeType[] = Object.freeze([
  'slash',
  'pierce',
  'crush',
]);

/** All nine, magic first, in stable order. */
export const DAMAGE_TYPES: readonly DamageType[] = Object.freeze([
  ...MAGIC_TYPES,
  ...MELEE_TYPES,
]);

const MELEE_SET: ReadonlySet<string> = new Set(MELEE_TYPES);

export function family(type: DamageType): Family {
  return MELEE_SET.has(type) ? 'melee' : 'magic';
}

export function isDamageType(value: unknown): value is DamageType {
  return typeof value === 'string' && (DAMAGE_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The bijection
// ---------------------------------------------------------------------------

/**
 * The three magic oppositions. Each is symmetric, so `counter` is an involution
 * on the magic family: `counter(counter(t)) === t`.
 */
const MAGIC_OPPOSITIONS: readonly (readonly [MagicType, MagicType])[] = Object.freeze([
  ['earth', 'air'],
  ['fire', 'water'],
  ['light', 'dark'],
]);

/**
 * The melee triangle, read as **"beats"**: crush beats slash, slash beats pierce,
 * pierce beats crush. `counter(x)` is the type that beats `x`, which is `x`'s
 * *predecessor* here — so `counter` is a 3-cycle, not an involution.
 *
 * Verified against `resources/characters/MATCHUPS.md`: a Slash hero's Bane is
 * Crush (row 19), a Pierce hero's is Slash (row 22), a Crush hero's is Pierce
 * (row 25).
 */
const MELEE_CYCLE: readonly MeleeType[] = Object.freeze(['crush', 'slash', 'pierce']);

const COUNTER: ReadonlyMap<DamageType, DamageType> = (() => {
  const map = new Map<DamageType, DamageType>();

  for (const [a, b] of MAGIC_OPPOSITIONS) {
    map.set(a, b);
    map.set(b, a);
  }

  for (let i = 0; i < MELEE_CYCLE.length; i++) {
    const beaten = MELEE_CYCLE[(i + 1) % MELEE_CYCLE.length]!;
    const beater = MELEE_CYCLE[i]!;
    map.set(beaten, beater);
  }

  return map;
})();

/**
 * The bijection over all nine types. **Never crosses magic/melee** (FR-003).
 *
 *   earth<->air · fire<->water · light<->dark · crush->slash->pierce->crush
 *
 * The arrows in that last cycle read as "beats", so `counter` walks them
 * backwards: `counter('slash') === 'crush'`.
 */
export function counter(type: DamageType): DamageType {
  const result = COUNTER.get(type);
  if (result === undefined) {
    throw new Error(`counter: not a damage type: ${String(type)}`);
  }
  return result;
}
