/**
 * **Every font family the design system declares is actually loaded** (017 T012).
 *
 * ### The defect this exists to prevent has already happened once, for six features
 *
 * `styles/base.css` declared `--font-display: 'Chakra Petch'`, `--font-sans:
 * 'Barlow'` and `--font-mono: 'JetBrains Mono'` from the Tailwind setup onwards, and
 * **nothing ever loaded a font file**. Every screen LMNTLZ shipped rendered in
 * `system-ui`. Nothing errored, nothing logged, no test failed — the fallback chain
 * is clean, so the token resolved to *something* and the interface looked fine.
 *
 * That is the same silence as a component nothing renders and a route nothing
 * calls. **The declaration and the loading are two different acts, and only the
 * first one was written down.**
 *
 * ### Why this test reads source rather than a rendered style
 *
 * `getComputedStyle` in jsdom cannot resolve `@font-face` — it neither fetches nor
 * parses font files — so an assertion that a heading *renders* in Chakra Petch would
 * pass in this environment no matter what, which is worse than no test at all.
 * **The real rendering check belongs in a browser and lives in `e2e/fonts.spec.ts`**,
 * where the network is blocked and the computed family is read for real.
 *
 * What can be checked here, and is worth checking, is the **wiring**: for every
 * family the design system declares, at least one face is imported. That is exactly
 * the link that was missing, and it fails the moment someone adds a family and
 * forgets the import — or deletes an import and leaves the token behind.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const BASE_CSS = read('../../src/styles/base.css');
const MAIN_TSX = read('../../src/main.tsx');

/**
 * The families `@theme` declares, as `--font-x: 'Family', fallback…`.
 *
 * Only the **first** quoted name matters: the rest of the stack is the fallback,
 * which is supposed to be unloadable.
 */
function declaredFamilies(css: string): string[] {
  return [...css.matchAll(/--font-[a-z-]+:\s*'([^']+)'/g)].map((match) => match[1]!);
}

/** `@fontsource/<slug>/latin-<weight>.css` → the slug and the weight. */
function importedFaces(source: string): { slug: string; weight: string }[] {
  return [...source.matchAll(/@fontsource\/([a-z0-9-]+)\/latin-(\d+)\.css/g)].map((match) => ({
    slug: match[1]!,
    weight: match[2]!,
  }));
}

/** `Chakra Petch` → `chakra-petch`, which is the npm package slug. */
const slugOf = (family: string): string => family.toLowerCase().replace(/\s+/g, '-');

describe('the declared type stack', () => {
  /**
   * **Anti-vacuity.** Every assertion below is over a list parsed out of a file, and
   * a parse that silently returns nothing would make all of them pass. This has
   * bitten the repo more than once, so the lists are proved non-empty first.
   */
  it('parses both files and finds something in each', () => {
    expect(BASE_CSS.length, 'base.css is empty or unreadable').toBeGreaterThan(500);
    expect(declaredFamilies(BASE_CSS), 'no --font-* token found').not.toHaveLength(0);
    expect(importedFaces(MAIN_TSX), 'no @fontsource import found').not.toHaveLength(0);
  });

  it('declares exactly the three families the design system specifies', () => {
    expect(declaredFamilies(BASE_CSS)).toEqual(['Chakra Petch', 'Barlow', 'JetBrains Mono']);
  });

  /** The assertion that would have failed for six features. */
  it('loads at least one face for every family it declares', () => {
    const loaded = new Set(importedFaces(MAIN_TSX).map((face) => face.slug));

    for (const family of declaredFamilies(BASE_CSS)) {
      expect(
        loaded.has(slugOf(family)),
        `'${family}' is declared in base.css and no face is imported in main.tsx — ` +
          `it will silently render in the fallback stack`,
      ).toBe(true);
    }
  });

  it('loads the nine faces the exports use, and no more', () => {
    const faces = importedFaces(MAIN_TSX).map((face) => `${face.slug}-${face.weight}`);

    expect(faces.sort()).toEqual(
      [
        'barlow-400',
        'barlow-500',
        'barlow-600',
        'barlow-700',
        'chakra-petch-500',
        'chakra-petch-600',
        'chakra-petch-700',
        'jetbrains-mono-400',
        'jetbrains-mono-500',
        'jetbrains-mono-700',
      ].sort(),
    );
  });

  /**
   * The **`latin-`** prefix is the subset, and dropping it pulls latin-extended as
   * well — roughly double the bytes for glyphs a desktop-only English interface
   * never draws. A bare `@fontsource/barlow` import is worse still: nine weights.
   */
  it('imports the latin subset only, never a bare family', () => {
    const bare = [...MAIN_TSX.matchAll(/@fontsource\/([a-z0-9-]+)(?:\/index\.css)?['"]/g)];
    expect(bare, 'a bare @fontsource import pulls every weight and subset').toHaveLength(0);
    expect(MAIN_TSX).not.toMatch(/@fontsource\/[a-z0-9-]+\/\d+\.css/);
  });

  /**
   * **No third party at runtime.** The Steam build loads from disk and may have no
   * network; a linked webfont would fail there and reflow the interface.
   * Constitution XIX. `e2e/fonts.spec.ts` proves it against a real browser.
   */
  it('never reaches Google Fonts', () => {
    for (const source of [BASE_CSS, MAIN_TSX, read('../../index.html')]) {
      expect(source).not.toMatch(/fonts\.(googleapis|gstatic)\.com\/[a-z]/i);
    }
  });
});
