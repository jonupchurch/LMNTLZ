/**
 * **The client spends the design's tokens, never Tailwind's stock palette**
 * (017 T055–T057 · SC-002).
 *
 * ### What T066's scan could not see
 *
 * Phase 8 already forbids a colour *literal* outside `base.css`, and it passed.
 * It was looking for `#F2C744` and `rgb(...)`, and the guild cluster had
 * neither — it had `text-stone-400`, `bg-amber-700`, `text-red-400`,
 * `border-emerald-800/60`. Those are colours too, and they are worse than a
 * hex: a hex at least stands out as a mistake, while `stone-400` looks
 * deliberate and generates a real colour that is **not in this game's
 * palette**.
 *
 * Eighty-two of them, in eight files, all of them guild screens — every other
 * feature was ported. So the pattern this scan exists to catch is not "somebody
 * pasted a hex", it is *"somebody wrote plausible Tailwind"*, which is what
 * happens by default and is why a review never caught it.
 *
 * ### The mapping is recorded, because it is a design decision
 *
 * `red` → **Slash**, the Open Line, which is `--color-danger`.
 * `amber` → **Crush**, the Falling Weight, which is `--color-warning`.
 * `emerald` → **Earth**, the Rooted Deep, which is `--color-success`.
 * `stone` → the neutral ramp: void · bg · surface · raised · line · faint ·
 * muted · parchment.
 *
 * Gold stays gold: it is `--color-light` and it is the brand.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStripped, sourceFiles } from '../components/support/scan.js';

const SRC = join(import.meta.dirname, '..', '..', 'src');

/** Tailwind's default palette. None of it belongs in this app. */
const STOCK = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

/**
 * `bg-stone-800`, `text-red-400/70`, `hover:border-amber-400` — a utility
 * prefix, one of the stock hues, and a numeric shade. The shade is what makes
 * this precise: `text-air` and `border-line` are ours and share no shape with
 * it, so the scan cannot mistake a token for the palette.
 */
const STOCK_CLASS = new RegExp(
  String.raw`\b(?:bg|text|border|ring|outline|divide|shadow|decoration|accent|caret|fill|stroke|from|via|to)-(?:${STOCK.join(
    '|',
  )})-\d{2,3}\b`,
  'g',
);

describe('no stock Tailwind colour anywhere in the client', () => {
  const files = sourceFiles(SRC).filter((f) => /\.tsx?$/.test(f));

  it('finds files to scan', () => {
    expect(files.length, 'the scan matched nothing — the assertion below is vacuous').toBeGreaterThan(
      30,
    );
  });

  it('and the scan can actually see one', () => {
    /**
     * The companion that must fail. Without it, a regex typo turns this whole
     * suite into a guaranteed pass and nobody finds out.
     */
    expect('className="border-stone-700 text-red-400"'.match(STOCK_CLASS)).toEqual([
      'border-stone-700',
      'text-red-400',
    ]);
    expect('className="border-line text-slash-lit"'.match(STOCK_CLASS)).toBeNull();
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1).replace(/\\/g, '/'), f] as const))(
    '%s',
    (rel, path) => {
      /* Comment-stripped: the block above names every banned hue in prose. */
      const hits = readStripped(path).match(STOCK_CLASS);
      expect(
        hits,
        `${rel} uses Tailwind's stock palette: ${hits?.join(', ')} — the nine Forces and the neutral ramp are the only colours this game has`,
      ).toBeNull();
    },
  );
});
