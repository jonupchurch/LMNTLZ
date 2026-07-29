import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentVersion } from '../src/version.js';

const WORKBOOK = fileURLToPath(
  new URL('../../../resources/characters/hero-stats.xlsx', import.meta.url),
);
const GENERATED = fileURLToPath(new URL('../src/heroes.generated.ts', import.meta.url));

/**
 * T033 — the stamp tracks the authored SOURCE, not the emitted output (FR-020).
 *
 * The distinction is the whole test. Hashing the output would move the stamp
 * whenever the emitter's formatting changed — a cosmetic edit to a template
 * string would look like a content change on every battle record written after
 * it — and hold it still if the emitter ever dropped a field, which is when you
 * most need it to move.
 */
describe('contentVersion', () => {
  it('is "c" plus twelve hex characters', () => {
    expect(contentVersion()).toMatch(/^c[0-9a-f]{12}$/);
  });

  it('is exactly sha256 of the workbook bytes, truncated', () => {
    const expected = `c${createHash('sha256')
      .update(readFileSync(WORKBOOK))
      .digest('hex')
      .slice(0, 12)}`;

    expect(contentVersion()).toBe(expected);
  });

  it('is NOT a hash of the emitted roster', () => {
    const ofOutput = `c${createHash('sha256')
      .update(readFileSync(GENERATED))
      .digest('hex')
      .slice(0, 12)}`;

    expect(contentVersion()).not.toBe(ofOutput);
  });

  it('carries the "c" prefix that distinguishes it from an engine version', () => {
    // Constitution XVI: the battle record cannot be backfilled, so a swapped
    // engineVersion/contentVersion pair is unfixable after the fact. The prefix
    // makes the swap visible on sight rather than six months later.
    expect(contentVersion().startsWith('c')).toBe(true);
  });

  it('is stable across calls', () => {
    expect(contentVersion()).toBe(contentVersion());
  });
});
