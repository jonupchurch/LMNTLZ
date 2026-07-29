/**
 * **The guard on the one convention fifteen features depend on.**
 *
 * > `accountId` comes from the verified session and never from a request body,
 * > path parameter or query string.
 *
 * This test exists because the violation is **invisible in review and passes
 * every functional test**. A handler reading `body.accountId` behaves
 * identically to one reading `ctx.accountId` for every request the author
 * writes a test for — because the author sends their own id. It only misbehaves
 * when somebody sends *someone else's*, and that is not a case anybody thinks to
 * write.
 *
 * So the check is mechanical, it runs on the whole source tree, and it is cheap
 * now and unbounded later: by feature 016 there are sixteen features of routes
 * and no realistic way to audit them by reading.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Comments may discuss the forbidden shape; code may not contain it. */
function codeOf(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/g, '/'),
  code: codeOf(readFileSync(path, 'utf8')),
}));

/**
 * **One list, used by both the guard and its own self-test.**
 *
 * Written out twice, they drift: somebody tightens a pattern here and the
 * self-test below keeps asserting against the old one, so the guard silently
 * stops catching something while its "would this actually catch it?" test still
 * passes. A guard that reports on a copy of itself reports on nothing.
 */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ['a request body', /\bbody\s*\.\s*accountId\b/],
  ['a path parameter', /\bparams?\s*\.\s*accountId\b/],
  ['a query string', /\bquery\s*\.\s*accountId\b/],
  ["Hono's param helper", /\.param\(\s*['"`]accountId['"`]/],
  ["Hono's query helper", /\.query\(\s*['"`]accountId['"`]/],
  /**
   * **Destructuring, which the dotted patterns above all miss.**
   * `const { accountId } = c.req.body` never contains the string
   * `body.accountId`, so every property-access pattern sails past it — and
   * destructuring is the *more* idiomatic way to write it, so this is the shape
   * the violation is most likely to actually take.
   */
  [
    'a destructured request',
    /\{[^}]*\baccountId\b[^}]*\}\s*=\s*[^;\n]*\b(?:req|body|params?|query|json)\b/,
  ],
];

describe('the accountId convention', () => {
  it('scans a non-empty source tree — an empty scan would pass vacuously', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('never reads accountId from %s', (_source, pattern) => {
    for (const { path, code } of FILES) {
      expect(
        pattern.test(code),
        `${path} reads accountId from client input. It must come from the ` +
          `verified session (src/auth/context.ts). A route acting on another ` +
          `player takes "targetId" instead.`,
      ).toBe(false);
    }
  });

  it('would actually catch the violation it is written to catch', () => {
    // A guard nobody has seen fail is a guard nobody knows works. These are the
    // exact shapes the patterns above must reject.
    const violations = [
      'const { accountId } = c.req.body;',
      'const id = c.req.param.accountId;',
      'const id = c.req.query.accountId;',
      "const id = c.req.param('accountId');",
      "const id = c.req.query('accountId');",
      'const { accountId, name } = await c.req.json();',
    ];
    for (const violation of violations) {
      expect(
        FORBIDDEN.some(([, p]) => p.test(violation)),
        `this guard would NOT catch: ${violation}`,
      ).toBe(true);
    }
  });

  it('leaves `targetId` alone — naming another player is legitimate', () => {
    // The scout view and the public profile genuinely act on somebody else. The
    // point is not that it never happens; it is that it is named differently so
    // the two can never be confused at a glance.
    const legitimate = [
      "const target = asTargetId(c.req.param('targetId'));",
      'const { targetId } = await c.req.json();',
      'const id = ctx.accountId;',
    ];
    for (const line of legitimate) {
      expect(
        FORBIDDEN.some(([, p]) => p.test(line)),
        `false positive on legitimate code: ${line}`,
      ).toBe(false);
    }
  });
});
