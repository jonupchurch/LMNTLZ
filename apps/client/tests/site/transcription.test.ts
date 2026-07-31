/**
 * **No progression number is written down in a screen** (018 T042 · SC-002).
 *
 * ### TL;DR
 *
 * Prices, costs and caps must come from the server or from the rules package.
 * A screen that types one out is a second place the rule lives, and the day
 * they disagree the player reads one number and is charged another.
 *
 * ### Why this is a directory scan and not another render assertion
 *
 * A render assertion proves the *fixture's* number reached the screen. It
 * cannot tell that apart from a screen that hardcoded the same number — which
 * is exactly what `LMNTLZ Store.dc.html` and `LMNTLZ Rune Forge.dc.html` both
 * do in their own scripts, and exactly what a faithful port carries over.
 *
 * ### It found one, and the finding is the reason for the shape
 *
 * `StageLadder.tsx` rendered **`75`** as literal copy — *"once the 75 cap has
 * absorbed what the boosts can give"* — in a paragraph explaining why the
 * fourth stage is worth buying. Every other number on that screen already came
 * from `config.*`; this one hid **inside prose**, which is where a scan aimed
 * at assignments and props does not look. Same shape as the guild founding cost
 * that read `650` in four sentences (017 T057).
 *
 * ### What this scan would miss, stated so nobody trusts it too far
 *
 * - **A number split across expressions.** `stage * 50` is invisible here.
 * - **A number in a Tailwind class**, deliberately: class contents are stripped,
 *   because `gap-5` and `w-20` are layout and there are hundreds of them.
 * - **5, 10 and 20 in ordinary arithmetic.** They are watched anyway, and any
 *   legitimate use has to be justified in `ALLOWED` below rather than waved
 *   through — which is the point of keeping them on the list.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FEATURES = join(import.meta.dirname, '../../src/features');
const DIRS = ['forge', 'store', 'replays'] as const;

/**
 * Every progression constant a screen might be tempted to type.
 *
 * Rune stage costs (150, 200) · the stat cap (75) · the stage boosts (20, 10,
 * 5) · the guild founding cost (650) · the shard cap and rename price (6500,
 * 325) · all seven pass prices.
 */
const WATCHED = [
  150, 200, 650, 75, 20, 10, 5, 6_500, 325, 500, 1_000, 1_500, 2_000, 5_000, 9_000, 16_000,
] as const;

/**
 * Numbers that are genuinely this screen's own, with the reason.
 *
 * **Deliberately tiny.** An entry here is a claim that a literal is not a game
 * rule; anything about money, stages or caps can never qualify.
 */
const ALLOWED: Readonly<Record<string, readonly number[]>> = {
  /* Nothing yet. The list exists so a future exception has to be argued in
     writing rather than added by loosening the regex. */
};

const sources = (): { readonly path: string; readonly rel: string }[] =>
  DIRS.flatMap((dir) =>
    readdirSync(join(FEATURES, dir))
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map((name) => ({ path: join(FEATURES, dir, name), rel: `${dir}/${name}` })),
  );

/**
 * The file as *code*: comments gone, Tailwind class contents gone.
 *
 * **Both strips are checked.** A regex that ate the file would make every
 * assertion below vacuously true, which is the failure mode of a source scan
 * and the one that leaves no trace. This project has shipped that mistake, so
 * the check is not optional.
 */
function codeOf(path: string, rel: string): string {
  let code = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  expect(
    /\b(import|export|const|function)\b/.test(code),
    `stripping comments emptied ${rel} — every assertion on it would pass on nothing`,
  ).toBe(true);

  code = code
    .replace(/className=\{\[[\s\S]*?\]\s*\.join\([^)]*\)\}/g, 'className={C}')
    .replace(/className=\{?["'`][^"'`]*["'`]\}?/g, 'className=C')
    .replace(/className=\{[^{}]*\}/g, 'className=C');

  expect(
    /\b(import|export|const|function)\b/.test(code),
    `stripping class names emptied ${rel}`,
  ).toBe(true);

  return code;
}

/** Bare numeric literals — not `text-h3`, not `1.4.0`, not `foo2`. */
const literalsIn = (code: string): number[] =>
  [...code.matchAll(/(?<![\w.\-])(\d[\d_]*)(?![\w.])/g)].map((m) =>
    Number(m[1]!.replace(/_/g, '')),
  );

describe('the 018 screens transcribe no progression number', () => {
  it('scans a non-empty set of files', () => {
    /* A path typo would otherwise make every case below pass on nothing. */
    expect(sources().length).toBeGreaterThan(8);
  });

  it.each(sources())('$rel', ({ path, rel }) => {
    const allowed = new Set(ALLOWED[rel] ?? []);
    const found = literalsIn(codeOf(path, rel)).filter(
      (n) => (WATCHED as readonly number[]).includes(n) && !allowed.has(n),
    );

    expect(
      [...new Set(found)],
      `${rel} writes a progression number down. It must come from config.*, STAT_CAP or the served catalog`,
    ).toEqual([]);
  });

  it('and the scan can see a planted one', () => {
    /**
     * **The companion that must fail.** Without it, a regex that matched
     * nothing would satisfy every case above — a broken scan and a clean
     * codebase are the same green tick.
     */
    const planted = 'const cost = 150;\nconst cap = 75;';
    expect(literalsIn(planted)).toContain(150);
    expect(literalsIn(planted)).toContain(75);
  });

  it('and does not see a version string or a suffixed identifier', () => {
    /* The false positives that would make this test too noisy to keep. */
    expect(literalsIn('const v = "1.4.0";')).toEqual([]);
    expect(literalsIn('const h = hero75;')).toEqual([]);
  });
});
