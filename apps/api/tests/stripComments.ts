/**
 * Strip comments, and prove the strip did not eat the file. **One copy.**
 *
 * ### TL;DR
 *
 * Several tests read source files and assert something is *absent* from them —
 * no `UPDATE` on the ledger, no vendor name outside `vendor/`, no cached
 * balance. Comments have to be removed first, because a good file explains its
 * own constraint and the explanation contains the banned string.
 *
 * The half that gets skipped is checking the strip left anything behind. A regex
 * that swallowed the file makes every "must not contain" assertion pass for the
 * worst possible reason.
 *
 * ### Why this file exists: there were four copies and they were all wrong
 *
 * Each of `payments/grantPath`, `payments/ceiling`, `progression/ledger` and
 * `matchmaking/inactivity` had its own strip and its own guard — expressed as a
 * **ratio** of surviving characters to original, at 5%, 5%, 10% and 20%
 * respectively. Four thresholds, four different numbers, no reason for any of
 * them.
 *
 * **A ratio answers the wrong question.** It cannot distinguish *"the strip regex
 * over-matched"* — the thing actually being guarded against — from *"this file is
 * unusually well documented"*, which this codebase does deliberately and often.
 * `src/types/fetch.ts` is 145 characters of declaration under a long explanation
 * of a compiler difference that cost two failed deploys: **4.6% code, and
 * entirely correct.** It broke two of the four scans the moment it was added, and
 * the other two only survived because they scan directories it is not in.
 *
 * Requiring a **top-level keyword to survive** answers the real question, needs no
 * threshold, and is strictly stronger: a strip returning `''` fails it regardless
 * of how short the original was. Proved by mutation — replacing the strip with
 * `''` fails on the first file scanned.
 */

import { expect } from 'vitest';

/** Every TypeScript source has at least one of these outside a comment. */
const STRUCTURE = /\b(export|import|const|function|interface|type|class)\b/;

/**
 * Remove block and line comments, then assert the result is still source.
 *
 * `label` names the file in the failure, because a scan that reports *"something
 * was emptied"* without saying which file is a scan somebody has to re-run by
 * hand to use.
 */
export function stripComments(raw: string, label: string): string {
  /**
   * **`(^|[^:])` before the line comment, so `https://` survives.**
   *
   * Three of the four copies used a bare `\/\/[^\n]*`, which truncates every URL
   * literal in the file at the scheme — `'https:'`. That is silent: the scans are
   * all "must not contain", so eating half a line only ever makes them *more*
   * likely to pass. `matchmaking/inactivity.test.ts` had the careful version and
   * it is the one kept here.
   */
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  expect(
    code,
    `comment strip emptied ${label} — every "must not contain" assertion below ` +
      `would pass for the worst possible reason`,
  ).toMatch(STRUCTURE);

  return code;
}
