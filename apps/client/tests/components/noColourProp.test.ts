/**
 * **No component accepts a colour** (017 T016 · FR-007, Constitution XV).
 *
 * A `color` prop lets a caller paint Fire with the Water token and nothing
 * catches it — the colour becomes a second source of truth for a rule that
 * lives in `@lmntlz/content`. Components take the *thing* (a `DamageType`, a
 * semantic `tone`) and derive.
 *
 * ### What this scan does NOT claim
 *
 * It reads prop declarations, so it catches the shape of the API, not every
 * possible way a colour could get in. `tone` and `variant` are permitted names
 * and a component could in principle accept `tone: '#E8552B'` — what stops
 * that is the *type* (`MeterTone`, `PillTone`), which the compiler enforces
 * and this file does not duplicate. Stated so a reader does not mistake a
 * green scan for a proof.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENTS_DIR, readStripped, sourceFiles, stripComments } from './support/scan.js';

/**
 * A prop declaration named `color` / `colour` / `tint` / `hex`, with or without
 * `readonly` and in either an interface or a destructured signature.
 */
const BANNED_PROP = /\b(?:readonly\s+)?(colors?|colours?|tint|hex)\s*[?:]/i;

/** The same names arriving as JSX attributes on a component we own. */
const BANNED_ATTR = /\s(colour|tint|hex)=/i;

describe('the comment stripper', () => {
  it('ignores a banned name inside a comment', () => {
    expect(stripComments('/* never add color: string */')).not.toMatch(BANNED_PROP);
  });

  /** The companion that must fail — otherwise the scan proves nothing. */
  it('KEEPS a banned name that is real code', () => {
    expect(stripComments('interface P { color: string }')).toMatch(BANNED_PROP);
  });
});

describe('no component takes a colour', () => {
  const files = sourceFiles(COMPONENTS_DIR);

  it('finds component files to scan', () => {
    expect(files, 'no components found — the scan below is vacuous').not.toHaveLength(0);
  });

  it('strips comments without emptying the files', () => {
    const total = files.reduce((sum, f) => sum + readStripped(f).trim().length, 0);
    expect(total, 'stripping removed everything').toBeGreaterThan(500);
  });

  it.each(files)('%s declares no colour prop', (file) => {
    const offending = readStripped(file)
      .split('\n')
      .filter((line) => BANNED_PROP.test(line));
    expect(offending, `takes a colour instead of deriving it:\n${offending.join('\n')}`).toEqual([]);
  });

  it.each(files)('%s passes no colour attribute', (file) => {
    /* `fill=` and `stroke=` are SVG presentation attributes, not colour props,
       and CooldownRing legitimately sets `fill="none"`. Only the four banned
       names are checked. */
    expect(readStripped(file)).not.toMatch(BANNED_ATTR);
  });
});
