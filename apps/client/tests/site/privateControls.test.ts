/**
 * **An action button comes from 017's `Button`** (018 T043 · FR-015).
 *
 * ### TL;DR
 *
 * Screens must not style their own buttons. If a control does something —
 * Pay, Commit, Destroy — it is the shared `Button`. Selection tiles are the one
 * exception, and they have to say so in their markup.
 *
 * ### The rule, and why it is drawn where it is
 *
 * `components/index.ts` is blunt about it: *"re-implementing any of these inside
 * a feature is the debt this layer exists to retire."* But a blanket ban on
 * `<button>` would be wrong, because two genuinely different things are spelled
 * with the same tag:
 *
 * | | what it is | markup |
 * |---|---|---|
 * | **action** | Pay · Commit stage · Destroy and rebuild · Watch | `Button` |
 * | **selection tile** | a SKU card, a rune slot, a hero row, a filter | raw, with `aria-pressed` or `role="radio"` |
 *
 * A tile stacks four lines of content, carries `data-sku` or `data-stat`, and
 * announces a *state* rather than an action. Forcing it through `Button` would
 * lose the role, the layout and the hook, and would make the component worse to
 * satisfy a scan. So the scan asks for the marker instead: **a raw `<button>`
 * must be a toggle, and anything else is a private button.**
 *
 * ### What it found
 *
 * Five, all in US1 and US2, all shipped before this ran: `Checkout`'s Pay,
 * `StageLadder`'s Commit, `ForgeScreen`'s Rebuild, and both of
 * `DestroyConfirm`'s. The last one is why `Button` gained a `ref` — the confirm
 * dialog puts focus on Cancel so a stray Enter cannot destroy a rune, and
 * without a handle on the element it had to keep a private control. Widening
 * the shared component is the documented remedy; working around it is the debt.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FEATURES = join(import.meta.dirname, '../../src/features');
const DIRS = ['forge', 'store', 'replays'] as const;

/** A raw `<button …>` opening tag, with everything up to the closing angle. */
const RAW_BUTTON = /<button\b[^>]*>/gs;

/** What makes a raw element a toggle rather than an action. */
const TOGGLE = /aria-pressed|role="radio"|role='radio'/;

const sources = (): { readonly rel: string; readonly path: string }[] =>
  DIRS.flatMap((dir) =>
    readdirSync(join(FEATURES, dir))
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => ({ rel: `${dir}/${name}`, path: join(FEATURES, dir, name) })),
  );

/** Comments gone, and the strip checked — an eaten file would pass on nothing. */
function codeOf(path: string, rel: string): string {
  const stripped = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  expect(
    /\b(import|export|const|function)\b/.test(stripped),
    `stripping comments emptied ${rel}`,
  ).toBe(true);

  return stripped;
}

describe('no screen styles its own action button', () => {
  it('scans a non-empty set of files', () => {
    expect(sources().length).toBeGreaterThan(5);
  });

  it.each(sources())('$rel', ({ rel, path }) => {
    const raw = codeOf(path, rel).match(RAW_BUTTON) ?? [];
    const actions = raw.filter((tag) => !TOGGLE.test(tag));

    expect(
      actions,
      `${rel} styles its own button. Import { Button } from components/index.js — or, if it is a selection tile, give it aria-pressed or role="radio"`,
    ).toEqual([]);
  });

  it('and the scan can tell an action from a toggle', () => {
    /**
     * **The companion that must fail.** A regex that matched nothing, or a
     * `TOGGLE` that matched everything, would make every case above pass — a
     * broken scan and a clean codebase are the same green tick.
     */
    const action = '<button type="button" onClick={pay}>Pay</button>';
    const toggle = '<button type="button" aria-pressed={on} data-sku="x">7 days</button>';

    expect(action.match(RAW_BUTTON)?.filter((t) => !TOGGLE.test(t))).toHaveLength(1);
    expect(toggle.match(RAW_BUTTON)?.filter((t) => !TOGGLE.test(t))).toHaveLength(0);
  });

  it('and the three screens do use the shared one', () => {
    /**
     * The positive half. Without it, a feature that rendered no buttons at all
     * would satisfy every case above — an absence proving an absence.
     */
    const users = sources().filter((s) =>
      /import \{[^}]*\bButton\b[^}]*\} from '\.\.\/\.\.\/components\/index\.js'/.test(
        readFileSync(s.path, 'utf8'),
      ),
    );

    for (const dir of DIRS) {
      expect(
        users.some((u) => u.rel.startsWith(`${dir}/`)),
        `nothing in features/${dir} imports the shared Button`,
      ).toBe(true);
    }
  });
});
