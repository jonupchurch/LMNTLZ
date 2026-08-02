/**
 * 🔴 **Rune utility effects (021).**
 *
 * Stage 4 of a rune costs 200 shards — the most expensive of the four — grants no
 * stat points by design, and wrote `null` into the database for the whole life of
 * the project. Every test here either compares against a control (the same board
 * without the effect) or asserts a value only reachable through it.
 * `expect(x).toBeDefined()` proves nothing about an effect and is not used.
 *
 * The structural guards below **scan rather than list**. A hand-written roll of
 * the thirty-three names would pass while an effect was quietly missing, which is
 * how 020's anti-vacuity check went stale the moment eleven hooks were added.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES, PASSIVES, getAllHeroes } from '@lmntlz/content';
import {
  POOL_KEYS,
  RESOLVED_AT_BOARD_BUILD,
  RUNE_EFFECTS,
  RUNE_MAGNITUDES,
  RUNE_SLOTS,
  effectsForSlot,
  effectsInPool,
  poolOf,
} from '../../rules/runeEffects.js';

const SOURCE = readFileSync(new URL('../../rules/runeEffects.ts', import.meta.url), 'utf8');
const ALL = Object.values(RUNE_EFFECTS);

/** What `06-progression.md` § *The utility catalog* specifies. */
const DESIGNED = { common: 6, perElement: 3 } as const;

/**
 * Which pool the design puts each not-yet-built effect in.
 *
 * **Transcribed from `06-progression.md`'s table**, which is the only place these
 * four exist until US3 builds them — so they cannot be looked up from the catalog
 * without making the completeness test assert whatever is there.
 */
const DESIGNED_POOL_OF: Readonly<Record<string, string>> = {
  'take-it-back': 'common',
  'further-than-it-looks': 'air',
  'both-ways': 'slash',
  'knocked-loose': 'crush',
};

// ---------------------------------------------------------------------------
// Shape of the catalog
// ---------------------------------------------------------------------------

describe('the catalog', () => {
  it('keys every entry by its own id', () => {
    const mismatched = Object.entries(RUNE_EFFECTS).filter(([key, e]) => key !== e.id);
    expect(mismatched, 'a stored rune names the id; the key must be it').toEqual([]);
  });

  it('gives every effect a pool the game actually has', () => {
    const stray = ALL.filter((e) => !POOL_KEYS.includes(e.pool));
    expect(stray.map((e) => e.id)).toEqual([]);
    expect(POOL_KEYS, 'ten pools: common + one per damage type').toHaveLength(
      DAMAGE_TYPES.length + 1,
    );
  });

  /**
   * 🔴 **Never over its designed size, and never two of one role in a pool.**
   *
   * This holds at every stage of the build, unlike a total count, and it catches
   * the realistic authoring error: an effect landing in the wrong pool, or two
   * offensive effects in one element while that element's tempo slot is empty.
   * The design's whole point is that *"the choice is made on what the hero does
   * rather than on which effect is strongest."*
   */
  it('never exceeds a pool, and never repeats a role inside one', () => {
    for (const pool of POOL_KEYS) {
      const inPool = effectsInPool(pool);
      const limit = pool === 'common' ? DESIGNED.common : DESIGNED.perElement;

      expect(inPool.length, `${pool} holds at most ${limit}`).toBeLessThanOrEqual(limit);

      if (pool !== 'common') {
        const roles = inPool.map((e) => e.role);
        expect(new Set(roles).size, `${pool} repeats a role: ${roles.join(', ')}`).toBe(
          roles.length,
        );
      }
    }
  });

  /**
   * 🔴 **Every pool is full, minus a declared remainder that US3 must empty.**
   *
   * This is the assertion that would have caught the US1-only state, where Water
   * held **zero** and seven of the ten pools held exactly one — the *"fixed single
   * effect per pool"* outcome `06-progression.md` names as the one to avoid,
   * because it strands half the elemental shard sink.
   *
   * The list below held the four probabilistic effects until US3 landed them
   * behind the `e0.6.0` bump. **It was a countdown, not an allowance** — emptying
   * it is what made the arithmetic demand all 33, and it is left in place rather
   * than deleted so the next partial feature has the shape to reuse.
   */
  const PENDING_US3: readonly string[] = [];

  it('offers every effect its pool is designed for, less the four US3 owes', () => {
    const owed = (pool: string): number =>
      PENDING_US3.filter((id) => DESIGNED_POOL_OF[id] === pool).length;

    for (const pool of POOL_KEYS) {
      const designed = pool === 'common' ? DESIGNED.common : DESIGNED.perElement;
      expect(effectsInPool(pool).length, `${pool} is short`).toBe(designed - owed(pool));
    }

    expect(ALL.length, 'the catalog is 33 once US3 lands').toBe(
      DESIGNED.common + DAMAGE_TYPES.length * DESIGNED.perElement - PENDING_US3.length,
    );
  });

  it('declares no pending effect that is already in the catalog', () => {
    const arrived = PENDING_US3.filter((id) => id in RUNE_EFFECTS);
    expect(arrived, 'US3 landed this — take it out of PENDING_US3').toEqual([]);
  });

  /**
   * 🔴 **No name may collide with a power or a passive.**
   *
   * `06-progression.md` records that all 33 were checked against the 127 entries
   * in the workbook's `Power List` sheet, and that the generated Rune Forge screen
   * proposed ~23 effects of which **eight collided exactly** — *"its ideas are
   * worth mining, its names are not."* This is that check, executable.
   */
  it('collides with no power name and no passive name', () => {
    const taken = new Set<string>(PASSIVES.map((p) => p.name));
    for (const hero of getAllHeroes()) {
      for (const power of hero.powers) taken.add(power.name);
    }

    const collisions = ALL.filter((e) => taken.has(e.name)).map((e) => e.name);
    expect(collisions).toEqual([]);
  });

  it('gives every hook a name matching its catalog entry', () => {
    const mismatched = ALL.filter((e) => e.hooks.name !== e.name).map((e) => e.id);
    expect(mismatched, 'the hook name is what the battle log prints').toEqual([]);
  });

  /**
   * **The exemption is declared, and declaring it is only half the guard.**
   *
   * `Before the First Blow` legitimately hooks nothing — its shield is placed at
   * board construction, where `maxHp` is known and no turn has been taken. Every
   * other empty entry is decoration a player paid 200 shards for.
   *
   * A list in the source could be extended to excuse anything, so the other half
   * lives in `apps/api/tests/battle/runeEffectsInBattle.test.ts`: each declared id
   * must be named in `board.ts` **and** show up on a real board. Both halves have
   * to be satisfied for an effect to be missing and green.
   */
  it('leaves no entry whose hooks do nothing, except the one that is resolved elsewhere', () => {
    const inert = ALL.filter(
      (e) => Object.keys(e.hooks).filter((k) => k !== 'name').length === 0,
    ).map((e) => e.id);

    expect(inert, 'a catalog entry that hooks nothing is decoration').toEqual([
      ...RESOLVED_AT_BOARD_BUILD,
    ]);
  });

  it('declares no exemption for an id that is not in the catalog', () => {
    const unknown = RESOLVED_AT_BOARD_BUILD.filter((id) => !(id in RUNE_EFFECTS));
    expect(unknown, 'an exemption naming nothing exempts nothing').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The tuning surface
// ---------------------------------------------------------------------------

describe('magnitudes', () => {
  /**
   * 🔴 **Every number comes from `RUNE_MAGNITUDES`, so the tuning pass is one
   * edit.**
   *
   * This matters more here than it usually would. `06-progression.md` sizes the
   * whole catalog against a battle of **~102 hero-turns** and the engine currently
   * produces **~28**, so these numbers are known to be wrong by roughly 3.6× for
   * the trigger-then-persistent family and exactly right for the immediate ones.
   * They will move. A literal buried in a closure is a number the tuning pass
   * misses.
   *
   * `0` and `1` are exempt: they are the multiplicative identity and the mark
   * counter's step, not magnitudes.
   */
  it('hides no magnitude inside an effect body', () => {
    const start = SOURCE.indexOf('const M = RUNE_MAGNITUDES;');
    const end = SOURCE.indexOf('export const RUNE_EFFECTS');
    expect(start, 'anchor moved').toBeGreaterThan(0);
    expect(end, 'anchor moved').toBeGreaterThan(start);

    const bodies = SOURCE.slice(start, end);
    const offenders: string[] = [];

    for (const line of bodies.split('\n')) {
      /* Comments carry the reasoning and quote the design's numbers freely. */
      const code = line.replace(/\/\*.*?\*\//g, '').trim();
      if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;

      for (const match of code.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)/g)) {
        const value = Number(match[1]);
        if (value !== 0 && value !== 1) offenders.push(code);
      }
    }

    expect(offenders, 'a magnitude outside RUNE_MAGNITUDES survives a tuning pass').toEqual([]);
  });

  it('freezes the tuning object', () => {
    expect(Object.isFrozen(RUNE_MAGNITUDES)).toBe(true);
    expect(Object.isFrozen(RUNE_EFFECTS)).toBe(true);
  });

  /**
   * 🔴 **The descriptions quote the magnitudes; they never restate them.**
   *
   * The no-magic-numbers scan above stops at `RUNE_EFFECTS`, so it does not see
   * these — and a description is exactly where a stale number does the most harm,
   * because the player reads it *before* committing 200 shards. Every figure must
   * arrive by interpolation, so a tuning pass moves the copy with the rule.
   */
  it('hardcodes no number in a description', () => {
    const start = SOURCE.indexOf('export const RUNE_EFFECTS');
    const offenders = SOURCE.slice(start)
      .split('\n')
      .filter((line) => line.trim().startsWith('description:'))
      /* Blank out every `${…}` first: what is left is the prose. */
      .filter((line) => /\d/.test(line.replace(/\$\{[^}]*\}/g, '')));

    expect(offenders, 'a number typed into copy outlives the tuning pass').toEqual([]);
  });

  it('gives every effect a description a player can act on', () => {
    const missing = ALL.filter((e) => e.description.trim().length < 20).map((e) => e.id);
    expect(missing, 'the Forge shows this before 200 shards are spent').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pool derivation — Constitution XV
// ---------------------------------------------------------------------------

describe('pool derivation', () => {
  it('derives each slot from the champion, never from stored data', () => {
    for (const hero of getAllHeroes()) {
      expect(poolOf(hero.id, 'primary')).toBe(hero.primary);
      expect(poolOf(hero.id, 'secondary')).toBe(hero.secondary);
      expect(poolOf(hero.id, 'common')).toBe('common');
    }
  });

  /**
   * 🔴 **Three slots, three different pools, for every champion on the roster.**
   *
   * Follows from the authored rule `secondary ≠ primary`, and asserted rather than
   * assumed: if it ever failed, a champion would be offered the same three effects
   * twice and one of its 200-shard purchases would be a duplicate.
   */
  it('gives every champion three distinct pools', () => {
    for (const hero of getAllHeroes()) {
      const pools = RUNE_SLOTS.map((slot) => poolOf(hero.id, slot));
      expect(new Set(pools).size, `${hero.id} repeats a pool`).toBe(RUNE_SLOTS.length);
    }
  });

  it('offers a slot exactly the effects of its pool', () => {
    for (const hero of getAllHeroes()) {
      for (const slot of RUNE_SLOTS) {
        const offered = effectsForSlot(hero.id, slot);
        const pool = poolOf(hero.id, slot);
        expect(offered.every((e) => e.pool === pool)).toBe(true);
        expect(offered).toEqual(effectsInPool(pool));
      }
    }
  });

  /**
   * The martial pools are reachable from **3 slots each on the whole roster** —
   * 3 champions × 1 primary slot — because melee champions always take a magic
   * secondary. The design calls this out as under-use by design, not a defect, so
   * it is pinned rather than left to be rediscovered as a bug.
   */
  it('reaches each martial pool from exactly three slots', () => {
    for (const melee of ['slash', 'pierce', 'crush'] as const) {
      const slots = getAllHeroes().flatMap((hero) =>
        RUNE_SLOTS.filter((slot) => poolOf(hero.id, slot) === melee),
      );
      expect(slots, `${melee} is reachable from 3 slots`).toHaveLength(3);
    }
  });
});
