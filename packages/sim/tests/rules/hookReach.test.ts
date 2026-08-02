/**
 * 🔴 **One lookup, or rune effects silently do not exist for some readers.**
 *
 * `passives.ts` contains twenty-two registry lookups. Twenty-one reach the
 * registry through `hooksOf(hero)`, which is what let 021 turn on thirty-three
 * rune effects across the damage path, the stat path, the targeting path and the
 * turn loop by widening **one function** instead of editing twenty-one call sites.
 *
 * Exactly one bypassed it — `targetingFor` called `hooksFor(...heroId)` directly —
 * and that one decided `ignoresFade` and `immuneToTaunt` for the *acting* hero. So
 * a rune granting fade-piercing was read for every champion on the board except
 * the one actually taking a turn: an effect that works for everybody but its
 * owner. Nothing failed, because the loop above it already used `hooksOf` and the
 * scan looked complete.
 *
 * **This guard scans rather than lists.** A hand-written list of today's readers
 * is exactly how 020's anti-vacuity check went stale the moment US3 added eleven
 * hooks and fourteen passives read as inert.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUNE_EFFECTS, UnknownRuneEffectError, runeHooksFor } from '../../rules/runeEffects.js';

const SOURCE = readFileSync(new URL('../../rules/passives.ts', import.meta.url), 'utf8');

/**
 * Paragraph blocks, which this file's style makes a reliable unit: every function
 * and every constant is separated by a blank line. Splitting on `;` or `}` would
 * break on the first multi-line ternary — which `hooksOf` now is.
 */
const BLOCKS = SOURCE.split(/\n\s*\n/);

describe('every hook reader goes through hooksOf', () => {
  it('has exactly one definition of each lookup', () => {
    const definitions = BLOCKS.filter((b) => /export function hooksFor\(/.test(b));
    const composers = BLOCKS.filter((b) => /const hooksOf =/.test(b));

    expect(definitions, 'hooksFor is defined once').toHaveLength(1);
    expect(composers, 'hooksOf is defined once').toHaveLength(1);
  });

  /**
   * 🔴 **The guard itself.** Restoring the `targetingFor` bypass turns this red.
   */
  it('names hooksFor nowhere but its own definition and hooksOf', () => {
    const offenders = BLOCKS.filter(
      (b) =>
        b.includes('hooksFor(') &&
        !/export function hooksFor\(/.test(b) &&
        !/const hooksOf =/.test(b),
    ).map((b) => b.split('\n').find((l) => l.includes('hooksFor('))?.trim() ?? b.slice(0, 90));

    expect(
      offenders,
      'a reader that calls hooksFor directly sees passives but not rune effects',
    ).toEqual([]);
  });

  /**
   * The positive half: readers exist and they use the composed lookup. Without
   * this, deleting every reader would pass the test above.
   */
  it('has readers, and they all use hooksOf', () => {
    const readers = BLOCKS.filter((b) => b.includes('hooksOf(')).length;

    expect(readers, 'hooksOf is defined and consumed').toBeGreaterThan(15);
  });

  /**
   * `hooksOf` must compose **both** sources. A version that returned only
   * `hooksFor(...)` would pass every check above — the bypass fixed one call site,
   * this pins the composition itself.
   */
  it('composes passives and rune effects rather than choosing one', () => {
    const block = BLOCKS.find((b) => /const hooksOf =/.test(b)) ?? '';

    expect(block).toContain('hooksFor(');
    expect(block, 'hooksOf must read the instance rune effects too').toContain('runeHooksFor(');
    expect(block, 'keyed off the instance, never the heroId').toContain('hero.runeEffects');
  });
});

describe('runeHooksFor', () => {
  it('returns nothing for a champion carrying no runes', () => {
    expect(runeHooksFor([])).toEqual([]);
  });

  /**
   * 🔴 **Unknown ids throw rather than resolving to an inert battle.**
   *
   * The opposite of `hooksFor`, which skips a passive it does not implement —
   * correctly, because nineteen were still unwritten when it shipped and a battle
   * must not fail over a name. Every id in this catalog has an implementation by
   * construction, so an unknown one is corruption. A player who paid 200 shards
   * and silently received nothing is the failure this whole feature exists to end.
   */
  it('throws on an id the catalog does not know', () => {
    expect(() => runeHooksFor(['no-such-effect'])).toThrow(UnknownRuneEffectError);
  });

  it('resolves every id the catalog does know', () => {
    const ids = Object.keys(RUNE_EFFECTS);

    expect(() => runeHooksFor(ids)).not.toThrow();
    expect(runeHooksFor(ids)).toHaveLength(ids.length);
  });
});
