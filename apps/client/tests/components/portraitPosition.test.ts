/**
 * `HeroPortrait` owns its `position`, and no caller may fight it (019 US2).
 *
 * ### The bug this exists to prevent, which shipped
 *
 * The portrait's root needs a `position` of its own — the House wash and the
 * scrim are `absolute inset-0` against it. It set `relative`, and both call
 * sites passed `className="absolute inset-0 h-full w-full"` intending to
 * override that.
 *
 * **The override silently lost.** Tailwind emits `.absolute` before
 * `.relative`, and CSS breaks a specificity tie by stylesheet order, not by the
 * order of names in a `class` attribute. So every card rendered its portrait in
 * normal flow at full card height and pushed the name, the reach, the Force and
 * the Bane below the card, where `overflow-hidden` clipped them away.
 *
 * Every label was in the DOM the whole time, correctly. **That is why no unit
 * test caught it and no unit test could:** jsdom does no layout, so a query for
 * the champion's name passes whether it is on the card or a thousand pixels
 * under it. It was found by a person looking at the screen.
 *
 * The remedy is the `fill` prop — one `position` class, chosen inside the
 * component. This test makes the old spelling impossible to reintroduce, and
 * `e2e/squads.spec.ts` asserts the stronger, layout-aware claim: the name is
 * inside the card's box.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', '..', 'src');

/** Every `position` utility Tailwind can emit. */
const POSITION = /\b(?:absolute|relative|fixed|sticky|static)\b/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('no caller sets a position utility on HeroPortrait', () => {
  const files = tsxFiles(SRC);

  it('finds the source tree at all', () => {
    // A path that resolved to nothing would make every assertion below
    // vacuously true — the failure mode this repo has hit repeatedly.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('HeroPortrait.tsx'))).toBe(true);
  });

  it('never passes absolute, relative, fixed or sticky in className', () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('HeroPortrait.tsx')) continue; // the component itself
      const code = readFileSync(file, 'utf8');

      /* Each `<HeroPortrait ... />` element, non-greedy to the first `/>`. */
      for (const match of code.matchAll(/<HeroPortrait\b[\s\S]*?\/>/g)) {
        const element = match[0];
        const className = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(element);
        if (className && POSITION.test(className[1] ?? className[2] ?? '')) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${className[0]}`);
        }
      }
    }

    expect(
      offenders,
      'HeroPortrait owns its position — use the `fill` prop. A position class ' +
        'here loses to the one inside the component and clips the card label.',
    ).toEqual([]);
  });

  it('would catch the spelling that shipped', () => {
    /* The guard is only worth having if it fires. This is the exact string the
       two call sites carried, run through the same matcher. */
    const shipped = '<HeroPortrait heroId={x} force={y} className="absolute inset-0 h-full w-full" />';
    const className = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(shipped);
    expect(POSITION.test(className![1]!)).toBe(true);
  });
});
