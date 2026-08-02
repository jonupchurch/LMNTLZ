/**
 * The icon manifests (017 T038, T041).
 *
 * Two suites with **very different standing**, and the second one says so
 * loudly on purpose.
 *
 * - `HERO_ICONS` is genuinely guarded: 27 heroes, 27 distinct icons, checked
 *   positively. A test that only asserted "did not crash" would pass on an
 *   empty map, which is the failure this file is written against.
 * - `STATUS_ICONS` is **not** guarded in any meaningful way today, because
 *   nothing produces a status. The guard below is designed to start failing
 *   the moment that changes.
 *
 * @see src/components/icons/README.md
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAMAGE_TYPES, getAllHeroes, HERO_IDS } from '@lmntlz/content';
import { describe, expect, it } from 'vitest';
import {
  HERO_ICONS,
  STATUS_ICONS,
  STATUS_ICON_KEYS,
} from '../../src/components/icons/icons.generated.js';
import {
  MAPPED_STATUS_KINDS,
  dotPipFor,
  statPipFor,
  statusIconFor,
} from '../../src/components/icons/statusIcons.js';

describe('every hero has a face', () => {
  /** The positive case. `toHaveLength(27)` on an empty map fails; "no crash" would not. */
  it('resolves an icon for all 27 heroes', () => {
    expect(HERO_IDS).toHaveLength(27);
    for (const id of HERO_IDS) {
      expect(HERO_ICONS[id], `hero ${id} has no icon`).toBeTruthy();
    }
  });

  it('maps every hero in the roster, with no id drift between the two', () => {
    const roster = getAllHeroes().map((h) => h.id);
    expect(roster.sort()).toEqual([...HERO_IDS].sort());
  });

  /**
   * Two heroes sharing an icon is the signature of a bad slug mapping — the
   * kind of bug where every Fire champion renders as the same emblem and it
   * looks deliberate.
   */
  it('gives no two heroes the same icon', () => {
    const used = Object.values(HERO_ICONS);
    expect(new Set(used).size, 'two heroes resolve to the same icon file').toBe(used.length);
  });

  it('points at real asset paths, not empty strings', () => {
    for (const [id, src] of Object.entries(HERO_ICONS)) {
      expect(String(src), `hero ${id} resolves to an empty icon`).not.toBe('');
    }
  });
});

describe('the status registry', () => {
  it('has 71 keys and an entry for each', () => {
    expect(STATUS_ICON_KEYS).toHaveLength(71);
    for (const key of STATUS_ICON_KEYS) {
      expect(STATUS_ICONS[key], `status icon ${key} is missing`).toBeTruthy();
    }
  });

  it('carries the overlays StatusPip composes with', () => {
    expect(STATUS_ICONS['overlay-sealed']).toBeTruthy();
    expect(STATUS_ICONS['overlay-stack']).toBeTruthy();
  });
});

/**
 * **The caller assertion** (T042).
 *
 * A generated manifest and a component that reads it are worth nothing if no
 * screen renders them — that is this project's single most repeated defect, and
 * it is invisible: everything compiles, every test passes, and the roster is
 * just a list of names.
 *
 * `gallery.test.tsx` proves `HeroCard` renders an emblem against a real DOM.
 * This scans for the other caller, because `RosterView` needs a squad payload
 * to render and a source assertion is honest about being a weaker check.
 */
describe('the icons have callers', () => {
  const SRC = join(import.meta.dirname, '../../src');

  /* `RosterView` used to be on this list and is not any more: the emblem moved
     into `HeroMarks`, which both the picker and the board seats render. The
     guard follows the caller rather than the screen — the thing it protects
     against is an emblem nobody draws, and a component one hop away is still
     drawn. */
  it.each([
    ['components/hero/HeroCard.tsx', 'HeroCard'],
    ['components/hero/HeroMarks.tsx', 'HeroMarks'],
  ])('%s renders HeroIcon', (file, name) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source, `${name} imports HeroIcon but never renders one`).toMatch(/<HeroIcon\b/);
  });

  /**
   * **And the hop itself, or the guard above just moved the hole.**
   *
   * Pointing the emblem assertion at `HeroMarks` proves an emblem is drawn
   * *somewhere in that component* and nothing more. If no screen renders
   * `HeroMarks`, the manifest is unreachable again and every test still passes —
   * which is the exact defect this whole block exists to catch, one level down.
   */
  it.each([
    ['features/squads/RosterView.tsx', 'the picker'],
    ['features/squads/SquadBuilder.tsx', 'the formation board'],
  ])('%s renders HeroMarks', (file, where) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source, `${where} imports HeroMarks but never renders one`).toMatch(/<HeroMarks\b/);
  });

  /**
   * `StatusPip` is the deliberate exception. It has no producer, so it must
   * stay uncalled — wiring it would invent data. **If this fails, something
   * started rendering statuses**, and `README.md` plus the vacuity guard below
   * both need revisiting rather than this test being deleted.
   */
  it('StatusPip is deliberately NOT wired', () => {
    const rendered = [
      'components/hero/HeroCard.tsx',
      'components/hero/PowerSlot.tsx',
      'features/squads/RosterView.tsx',
      'features/gallery/GalleryScreen.tsx',
    ].filter((f) => /<StatusPip\b/.test(readFileSync(join(SRC, f), 'utf8')));

    expect(
      rendered,
      'StatusPip now has a caller. There is no data for it — see icons/README.md.',
    ).toEqual([]);
  });
});

/**
 * ✅ **THE ANTI-VACUITY GUARD, NOW REAL** (017 T041 → 020 US2).
 *
 * It used to assert the *preconditions of a vacuum*: `StatusInstance.kind` was
 * an open `string` and nothing produced a status, so "every status has an icon"
 * was an assertion over an empty set. Two tripwires stood in for it, with one
 * instruction — *"when a vocabulary is authored, do not relax these; write the
 * real cross-check."*
 *
 * 020 authored it. **The tripwire fired and this is the cross-check**, reading
 * the engine's own `StatusKind` union rather than a list restated here — which
 * is the whole difference between a guard that moves when the code moves and a
 * guard that has to be remembered.
 *
 * **The reverse direction is deliberately not asserted.** Seventy-one icons
 * against twelve kinds is by design: the registry draws a pip per Force and per
 * stat and direction, information the *power* carries and the status does not.
 * "Every icon is claimed by some kind" would fail on a correct registry, so
 * `statusIcons.ts` documents the asymmetry instead of the test pretending to it.
 */
describe('✅ every status the engine can produce resolves to an icon', () => {
  const REPO = join(import.meta.dirname, '../../../..');

  /**
   * The union is read off the source, so a thirteenth kind added to the engine
   * fails here rather than rendering as a blank square in a battle.
   */
  const engineKinds = (): readonly string[] => {
    const status = readFileSync(join(REPO, 'packages/sim/rules/status.ts'), 'utf8');
    const union = /export type StatusKind =\s*([^;]+);/s.exec(status);
    expect(union, 'StatusKind no longer parses — this guard has stopped applying').not.toBeNull();
    return [...union![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
  };

  it('maps every kind the engine declares, with none invented', () => {
    const declared = [...engineKinds()].sort();
    expect(declared.length).toBeGreaterThan(0);
    expect([...MAPPED_STATUS_KINDS].sort()).toEqual(declared);
  });

  it('resolves each one to a key the registry actually holds', () => {
    for (const kind of MAPPED_STATUS_KINDS) {
      const key = statusIconFor({ kind, stat: null });
      expect(STATUS_ICON_KEYS, `${kind} resolves to "${key}", which is not a registry key`).toContain(
        key,
      );
    }
  });

  /**
   * A stat buff must not fall back to the generic pip. Ten stats, both
   * directions, all twenty keys present — the check the registry could never
   * make against itself.
   */
  it('resolves every stat, in both directions, for a stat modifier', () => {
    const stats = [
      'might',
      'perception',
      'agility',
      'toughness',
      'armor',
      'penetration',
      'magicResist',
      'speed',
      'resolve',
      'luck',
    ] as const;

    for (const stat of stats) {
      const neutral = statusIconFor({ kind: 'buff', stat });
      expect(STATUS_ICON_KEYS, `buff of ${stat} resolves to "${neutral}"`).toContain(neutral);
      expect(neutral, `buff of ${stat} fell back to the generic icon`).not.toBe('status-renewed');

      for (const direction of ['up', 'down'] as const) {
        expect(STATUS_ICON_KEYS).toContain(statPipFor(stat, direction));
      }
    }
  });

  it('resolves a damage-over-time pip for all nine Forces', () => {
    for (const force of DAMAGE_TYPES) {
      expect(STATUS_ICON_KEYS, `no dot pip for ${force}`).toContain(dotPipFor(force));
    }
  });

  /*
   * **`StatusPip` still has no caller, and that is still deliberate** — rendering
   * the row is US4. There is no test for it *here*, because the suite above
   * already asserts it and a second, weaker restatement is how a guard rots. The
   * first draft of this block scanned `statusIcons.ts` for `/<[A-Z]/` to prove it
   * was "not a component"; that matches `Record<StatusKind` and was a worse
   * version of a check that already existed.
   */
});
