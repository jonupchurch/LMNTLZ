/**
 * **The token scan** (017 T006 · FR-003, FR-007, Constitution XV).
 *
 * Two claims, and they fail in opposite directions:
 *
 * 1. `base.css` carries every token the Design System export declares, at the
 *    export's own values. Fails when a token is dropped or mistyped.
 * 2. No component spends a colour literal. Fails when someone inlines a hex
 *    instead of reaching for a token.
 *
 * ### Why the stripper is tested before anything is scanned
 *
 * A scan that forbids `#rrggbb` **matches the comment explaining the ban**, so
 * the source has to be comment-stripped first. That creates the opposite
 * hazard: a stripper that is too greedy eats the file, the scan finds nothing,
 * and the suite reports a clean bill of health forever. Both halves of that
 * have bitten this repo.
 *
 * So `stripComments` gets its own tests with a **companion case that must
 * fail** — a hex in a comment is ignored, a hex in code is caught. An assertion
 * with no failing companion is not evidence.
 *
 * @see resources/designsystem/LMNTLZ Design System.dc.html — § Color tokens,
 *      § Typography, spacing, radius, motion. That file's `--lz-*` block is the
 *      authority; `base.css` is the same values under Tailwind v4 namespaces.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **`import.meta.dirname`, not `new URL(rel, import.meta.url)`** — and the
 * difference is not style.
 *
 * Under `environment: 'jsdom'`, the global `URL` at MODULE-INITIALISATION time
 * is jsdom's, which resolves a relative path against the document base
 * (`http://localhost:3000/`) and quietly ignores the `file://` base handed to
 * it. `fileURLToPath` then dies with *"The URL must be of scheme file"*. The
 * identical call placed inside a function that runs later gets Node's `URL` and
 * works — which is why `tests/site/fonts.test.ts` uses that form and passes,
 * and why this file blew up doing what looked like the same thing.
 *
 * `import.meta.dirname` is a plain string, so there is no resolution step to
 * shadow. Prefer it in any test that reads a file at module scope.
 */
const HERE = import.meta.dirname;
const COMPONENTS_DIR = join(HERE, '../../src/components');
const BASE_CSS = readFileSync(join(HERE, '../../src/styles/base.css'), 'utf8');

/**
 * Remove `/* *\/` and `//` comments.
 *
 * The `//` rule deliberately spares `://`, so a URL in a string survives. That
 * matters for what the scan would otherwise MISS rather than for false alarms:
 * truncating a line at a protocol slash would hide anything after it.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every `.ts`/`.tsx` under `components/`, recursively. */
function componentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return componentFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** `#abc`, `#aabbcc`, `#aabbccdd` — but never a CSS id selector or a hash route. */
const HEX_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
/** `rgb(…)` / `hsl(…)` are colour literals too, and slip past a hex-only scan. */
const FUNCTIONAL_COLOUR = /\b(?:rgba?|hsla?)\s*\(/g;

describe('the comment stripper, before it is trusted', () => {
  it('removes a hex inside a block comment', () => {
    expect(stripComments('/* do not use #E8552B */\nconst a = 1;')).not.toMatch(HEX_LITERAL);
  });

  it('removes a hex inside a line comment', () => {
    expect(stripComments('const a = 1; // was #E8552B')).not.toMatch(HEX_LITERAL);
  });

  /** The companion that must fail if the stripper is too greedy. */
  it('KEEPS a hex that is real code — the case that proves it is not eating the file', () => {
    expect(stripComments('const a = "#E8552B";')).toMatch(HEX_LITERAL);
  });

  it('does not truncate a line at a URL protocol', () => {
    expect(stripComments('const u = "https://lmntlz.com/x";')).toContain('lmntlz.com/x');
  });
});

describe('base.css carries the export token block', () => {
  it('is a real file with real content', () => {
    expect(BASE_CSS.length, 'base.css is empty or unreadable').toBeGreaterThan(2000);
  });

  /**
   * Values, not just names. A present-but-wrong token is the failure a
   * name-only check waves through, and it is the likelier mistake.
   */
  it.each([
    ['--text-display', '56px'],
    ['--text-display--line-height', '0.95'],
    ['--text-h1', '32px'],
    ['--text-h1--line-height', '1.1'],
    ['--text-h2', '22px'],
    ['--text-h2--line-height', '1.2'],
    ['--text-h3', '15px'],
    ['--text-h3--line-height', '1.25'],
    ['--text-body', '15px'],
    ['--text-body--line-height', '1.55'],
    ['--text-caption', '12px'],
    ['--text-caption--line-height', '1.45'],
    ['--text-stat', '20px'],
    ['--spacing', '4px'],
    ['--radius-sm', '4px'],
    ['--radius-md', '8px'],
    ['--radius-lg', '12px'],
    ['--radius-xl', '20px'],
    ['--duration-fast', '90ms'],
    ['--duration-base', '160ms'],
    ['--duration-slow', '320ms'],
    ['--duration-reveal', '520ms'],
    ['--duration-pending-cycle', '1100ms'],
    ['--rail-width', '220px'],
    ['--content-max', '1400px'],
    ['--gutter', '24px'],
    ['--control-sm', '28px'],
    ['--control-md', '38px'],
    ['--control-lg', '48px'],
  ])('%s is %s', (token, value) => {
    const declared = new RegExp(`${token}:\\s*${value.replace('.', '\\.')}\\s*;`);
    expect(stripComments(BASE_CSS)).toMatch(declared);
  });

  it.each([
    '--shadow-glow-1',
    '--shadow-glow-2',
    '--shadow-glow-accent',
    '--ease-out',
    '--ease-in-out',
  ])('%s is declared', (token) => {
    expect(stripComments(BASE_CSS)).toMatch(new RegExp(`${token}:`));
  });

  /**
   * `h3` and `body` are both 15px and differ ONLY in leading. Collapsing them
   * loses a distinction the export makes on purpose — a label and a paragraph
   * at one size — so this asserts they stay two tokens with two leadings.
   */
  it('keeps h3 and body as separate tokens despite sharing a size', () => {
    const css = stripComments(BASE_CSS);
    expect(css).toMatch(/--text-h3--line-height:\s*1\.25/);
    expect(css).toMatch(/--text-body--line-height:\s*1\.55/);
  });

  /**
   * The semantic layer must stay an ALIAS layer. Written as `var()`, a
   * divergence between `danger` and `slash` becomes a deliberate edit rather
   * than a drift nobody notices.
   */
  it.each([
    ['--color-strong', '--color-gold'],
    ['--color-danger', '--color-slash'],
    ['--color-success', '--color-earth'],
    ['--color-warning', '--color-crush'],
    ['--color-info', '--color-pierce'],
    ['--color-border', '--color-raised'],
  ])('%s aliases %s rather than copying its hex', (semantic, force) => {
    expect(stripComments(BASE_CSS)).toMatch(new RegExp(`${semantic}:\\s*var\\(${force}\\)`));
  });
});

/**
 * The focus ring is one colour for the whole app and that colour is Air.
 *
 * Gold is the *same hex* as `--color-light`, so a gold ring vanished on a Light
 * hero card and on every `--color-strong` surface — precisely where focus
 * matters. Guarded because it is a one-line edit away from regressing.
 */
describe('the global focus ring', () => {
  it('is Air cyan, not gold', () => {
    const css = stripComments(BASE_CSS);
    const rule = /:focus-visible\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule, ':focus-visible rule not found').not.toBe('');
    expect(rule).toContain('--color-air');
    expect(rule).not.toContain('--color-gold');
  });

  /**
   * The dark separation ring is what makes ONE ring colour legible on every
   * surface — without it, Air on parchment is the next invisible-ring bug.
   * Asserted separately from the colour because they fail independently.
   */
  it('keeps the void separation ring between the element and the outline', () => {
    const rule = /:focus-visible\s*\{[^}]*\}/.exec(stripComments(BASE_CSS))?.[0] ?? '';
    expect(rule).toMatch(/box-shadow:\s*0 0 0 2px var\(--color-void\)/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });

  /**
   * `outline` is never removed here, and `bootstrap.test.tsx` guards the same
   * thing from the other direction. Restated in this file so a future edit to
   * the ring fails beside the ring rather than in a squad-builder suite.
   */
  it('never removes the outline', () => {
    expect(stripComments(BASE_CSS)).not.toMatch(/outline:\s*none/);
  });
});

describe('no component spends a colour literal', () => {
  const files = componentFiles(COMPONENTS_DIR);

  /** Anti-vacuity: a glob that matches nothing passes forever. */
  it('finds component files to scan', () => {
    expect(files, 'no components found — the scan below proves nothing').not.toHaveLength(0);
  });

  it('strips comments without eating the files', () => {
    const total = files.reduce(
      (sum, file) => sum + stripComments(readFileSync(file, 'utf8')).trim().length,
      0,
    );
    expect(total, 'comment-stripping removed everything — the scan is vacuous').toBeGreaterThan(200);
  });

  it.each(files)('%s contains no hex colour', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    expect(source.match(HEX_LITERAL) ?? []).toEqual([]);
  });

  it.each(files)('%s contains no rgb()/hsl() colour', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    expect(source.match(FUNCTIONAL_COLOUR) ?? []).toEqual([]);
  });
});
