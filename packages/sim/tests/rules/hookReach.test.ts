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

/**
 * ⚠️ **Normalised to `\n`, and that is load-bearing rather than tidy.**
 *
 * The working copy is CRLF (`core.autocrlf=true` on Windows), so a scan looking
 * for `\n}\n` never matches a line that really ends `\r\n}\r\n`. The interface
 * parse below silently ran past its own closing brace and latched onto the first
 * block that happened to have been written with bare LF — so it was reading a
 * region nobody chose, and would have started or stopped reading one somewhere
 * else the next time an unrelated edit changed which lines had which endings.
 *
 * A source scan has a **region**, and outside it nothing is guarded. Pinning the
 * region to something the file's bytes cannot move is the whole fix.
 */
const SOURCE = readFileSync(new URL('../../rules/passives.ts', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

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

// ---------------------------------------------------------------------------
// Every declared hook has a collector (021 US2, T047)
// ---------------------------------------------------------------------------

/**
 * 🔴 **A declared hook with nothing reading it is how fourteen passives read as
 * inert for a whole feature.**
 *
 * US2 added nine hooks to `PassiveHooks` at once. Each one is a field an effect
 * can set and a player can pay 200 shards for, and each is worth exactly nothing
 * until some function in this file asks for it — a failure with no error, no
 * failing test and no symptom other than a rune that does not work.
 *
 * **The subject list is parsed out of the interface**, never typed here. 020's
 * anti-vacuity check named its nine hooks by hand and went stale the moment US3
 * added eleven; a guard that lists what it checks stops checking the moment the
 * thing it guards grows.
 */
const HOOK_BLOCK = (() => {
  const start = SOURCE.indexOf('export interface PassiveHooks {');
  expect(start, 'PassiveHooks moved or was renamed').toBeGreaterThan(0);

  /* The first line that closes a block at column 0 ends the interface. */
  const rest = SOURCE.slice(start);
  const end = rest.indexOf('\n}\n');
  expect(end, 'PassiveHooks is not closed at column 0').toBeGreaterThan(0);
  return rest.slice(0, end);
})();

/** Every optional member of the interface, in declaration order. */
const HOOK_NAMES = [...HOOK_BLOCK.matchAll(/^\s*readonly (\w+)\??:/gm)]
  .map((m) => m[1]!)
  .filter((name) => name !== 'name');

describe('every declared hook is collected', () => {
  it('finds the hooks by parsing the interface, not by listing them', () => {
    expect(HOOK_NAMES.length, 'the parse found nothing — the regex or the style moved').
      toBeGreaterThan(15);
    expect(new Set(HOOK_NAMES).size, 'a duplicated member name').toBe(HOOK_NAMES.length);
  });

  /**
   * 🔴 **The region is bounded, which is the half that was silently broken.**
   *
   * A block that runs past the interface's closing brace still parses hook names
   * correctly — the regex only matches `readonly x?:` lines — so the mis-parse
   * left no trace. What it does break is the *other* half: `body` below is
   * `SOURCE` minus this block, so an over-long block deletes real reader code from
   * the text being searched, and a hook whose only reader sat in the deleted
   * region would be reported unread. It read as a strict guard and was a
   * coin flip on line endings.
   */
  it('stops at the interface, not at some later brace', () => {
    expect(HOOK_BLOCK.startsWith('export interface PassiveHooks {')).toBe(true);
    expect(HOOK_BLOCK, 'the block ran past the interface into a function body').not.toMatch(
      /\n(export )?(function|const|interface|type) /,
    );
  });

  /**
   * The read has to be somewhere other than the declaration. `hooks.onStrike` and
   * `h.critImmune` are both reads; the `readonly onStrike?:` line is not.
   */
  it('reads every one of them somewhere outside the interface', () => {
    const body = SOURCE.replace(HOOK_BLOCK, '');
    const unread = HOOK_NAMES.filter((name) => !new RegExp(`\\.${name}\\b`).test(body));

    expect(
      unread,
      'a hook nothing asks for is a field an effect can set and no battle can feel',
    ).toEqual([]);
  });
});
