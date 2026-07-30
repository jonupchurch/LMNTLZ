/**
 * The clock is injectable, and **nothing in the feature reads the ambient one**
 * (013 T005, T043).
 *
 * Two claims, and they need two different kinds of proof:
 *
 * 1. **No guilds module calls `Date.now()` or argument-less `new Date()`** — a
 *    source scan, because behaviour cannot prove an absence.
 * 2. **Adding one fails lint** — asserted by actually running ESLint on a planted
 *    violation, because a rule nobody has watched fail is a claim rather than a
 *    guard. This one caught a real thing: the selector had to be written against
 *    the AST (`NewExpression[arguments.length=0]`) rather than as text, or
 *    `new Date(someInstant)` would have been banned too.
 *
 * ### The scan strips comments first, and that is not optional here
 *
 * `clock.ts` **explains** the ban at length, so its prose contains both banned
 * strings — and `src/guilds/README.md` will too. A scan that matched the
 * explanation of a rule would be a scan that can never pass, which is the seventh
 * instance of that mistake in this project. `stripComments` also proves the strip
 * did not empty the file, so the assertions cannot pass for the worst reason.
 *
 * **`systemClock` is the one sanctioned reader** and carries an
 * `eslint-disable-next-line` on the line itself. The scan allows exactly that line
 * and nothing else — checked by counting, so a second exception is a failure rather
 * than a widening.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fixedClock, movableClock, systemClock } from '../../src/guilds/clock.js';
import { stripComments } from '../stripComments.js';

const GUILDS_SRC = join(import.meta.dirname, '../../src/guilds');
const REPO_ROOT = join(import.meta.dirname, '../../../..');

const BANNED = [
  { what: 'Date.now()', pattern: /\bDate\s*\.\s*now\s*\(/g },
  { what: 'new Date() with no arguments', pattern: /new\s+Date\s*\(\s*\)/g },
] as const;

function guildSources(): string[] {
  return readdirSync(GUILDS_SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(GUILDS_SRC, f));
}

describe('the clock behaves', () => {
  it('fixedClock never moves, and hands out a copy', () => {
    const clock = fixedClock('2026-08-01T12:00:00.000Z');
    const first = clock.now();
    first.setFullYear(1999); // mutating what we got back must not move the clock
    expect(clock.now().toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('movableClock advances in DAYS, because every timer here is in days', () => {
    const clock = movableClock('2026-08-01T00:00:00.000Z');
    clock.advanceDays(14);
    expect(clock.now().toISOString()).toBe('2026-08-15T00:00:00.000Z');
    clock.advanceDays(7);
    expect(clock.now().toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('daysBetween floors, so "14 days inactive" means fully elapsed', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    expect(daysBetween(from, new Date('2026-08-14T23:59:59.000Z'))).toBe(13);
    expect(daysBetween(from, new Date('2026-08-15T00:00:00.000Z'))).toBe(14);
  });

  it('addDays does not mutate its argument', () => {
    const at = new Date('2026-08-01T00:00:00.000Z');
    addDays(at, 7);
    expect(at.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('systemClock actually reads the wall clock', () => {
    const before = performance.timeOrigin + performance.now();
    const seen = systemClock.now().getTime();
    expect(Math.abs(seen - before)).toBeLessThan(60_000);
  });
});

describe('no guilds module reads the ambient clock', () => {
  it('scans every source file, comments stripped', () => {
    const files = guildSources();
    expect(files.length, 'the scan found no files — it would pass vacuously').toBeGreaterThan(0);

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const code = stripComments(raw, file);

      for (const { what, pattern } of BANNED) {
        const hits = [...code.matchAll(pattern)];

        /**
         * `clock.ts` is allowed **one** `new Date()` — `systemClock`. Counting
         * rather than skipping the file means a second one is a failure, not a
         * silently widened exception.
         */
        const allowed = file.endsWith('clock.ts') && what.startsWith('new Date') ? 1 : 0;

        expect(hits.length, `${file} calls ${what} ${hits.length}× (allowed ${allowed})`).toBe(
          allowed,
        );
      }
    }
  });

  it('and the lint rule genuinely fires — planted, run, removed', () => {
    /**
     * The rule is what stops the *next* one, and it is worth running for real:
     * the AST selector permits `new Date(instant)` while banning `new Date()`,
     * and a text-based rule could not tell them apart. All three lines below are
     * checked, so the permitted form is proved permitted.
     */
    const planted = join(GUILDS_SRC, '_clockGuardFixture.ts');
    writeFileSync(
      planted,
      'export const a = Date.now();\nexport const b = new Date();\nexport const c = new Date(a);\n',
      'utf8',
    );

    let output = '';
    try {
      execFileSync('pnpm', ['exec', 'eslint', '--format', 'json', planted], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        shell: true,
      });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? '');
    } finally {
      unlinkSync(planted);
    }

    expect(output, 'eslint produced no JSON — the rule may not have run at all').toContain(
      'no-restricted-syntax',
    );

    const messages = (
      JSON.parse(output) as ReadonlyArray<{
        readonly messages: ReadonlyArray<{ readonly line: number; readonly ruleId: string | null }>;
      }>
    ).flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-restricted-syntax'));

    /** Lines 1 and 2 banned; line 3 — `new Date(a)` — must be left alone. */
    expect(messages.map((m) => m.line).sort()).toEqual([1, 2]);
  }, 60_000);
});
