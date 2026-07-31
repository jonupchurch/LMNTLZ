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
import { getAllHeroes, HERO_IDS } from '@lmntlz/content';
import { describe, expect, it } from 'vitest';
import {
  HERO_ICONS,
  STATUS_ICONS,
  STATUS_ICON_KEYS,
} from '../../src/components/icons/icons.generated.js';

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

  it.each([
    ['components/hero/HeroCard.tsx', 'HeroCard'],
    ['features/squads/RosterView.tsx', 'RosterView'],
  ])('%s renders HeroIcon', (file, name) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source, `${name} imports HeroIcon but never renders one`).toMatch(/<HeroIcon\b/);
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
 * ⚠️ **THE ANTI-VACUITY GUARD** (T041).
 *
 * The suite above checks the registry against *itself*. It cannot check that
 * the engine's statuses have icons, because **the engine emits no statuses** —
 * `StatusInstance.kind` is an open `string` and `board.ts` hardcodes
 * `statuses: []`. So "every status has an icon" is an assertion over an empty
 * set: it passes, and it means nothing.
 *
 * These two tests exist so that it cannot go on meaning nothing quietly. They
 * assert the *preconditions of the vacuum*. When a status vocabulary is
 * authored — a union on `kind`, or a real producer — one of them goes red.
 *
 * **When that happens, do not relax these.** Their failure is the signal to
 * write the real cross-check: every authored status kind resolves to an icon,
 * and every icon is claimed by some kind.
 */
describe('⚠️ the status guard is vacuous, and must fail when it stops being', () => {
  const REPO = join(import.meta.dirname, '../../../..');

  it('StatusInstance.kind is still an open string — no vocabulary exists yet', () => {
    const state = readFileSync(join(REPO, 'packages/sim/rules/state.ts'), 'utf8');
    const kind = /export interface StatusInstance \{[^}]*?readonly kind:\s*([^;]+);/s.exec(state);

    expect(kind, 'StatusInstance no longer parses — check this guard still applies').not.toBeNull();
    expect(
      kind![1]!.trim(),
      'StatusInstance.kind is no longer `string`, so a status vocabulary now exists. ' +
        'The registry check above is no longer vacuous and must be replaced with a real ' +
        'cross-check against the authored kinds. See src/components/icons/README.md.',
    ).toBe('string');
  });

  it('the engine still produces no statuses', () => {
    const board = readFileSync(join(REPO, 'apps/api/src/battle/board.ts'), 'utf8');
    expect(
      /statuses:\s*\[\s*\]/.test(board),
      'board.ts no longer hardcodes `statuses: []`, so something now produces statuses. ' +
        'StatusPip has a producer and needs wiring, and the icon guard needs to become real.',
    ).toBe(true);
  });
});
