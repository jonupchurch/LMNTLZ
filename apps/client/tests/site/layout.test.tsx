/**
 * **The shell owns the page box; a screen owns regions on it** (017 T048–T057).
 *
 * ### What went wrong, and why it was invisible
 *
 * `AppShell` renders a 12-column grid, capped at 1400 and centred above ~2100,
 * and `Panel` places a span on it. Neither was reachable. `App.tsx` wrapped
 * every screen in a single `<Panel span={12}>`, so the grid had exactly one
 * child — and each screen then declared a page box of its own,
 * `mx-auto max-w-[1600px] px-8 py-10`, nine times across six files.
 *
 * Two consequences, both live and neither one an error:
 *
 * - **No screen could place a region.** `CodexScreen` asked for `span={6}`
 *   twice and got two stacked full-width blocks, because its `Panel`s were
 *   grandchildren of the grid rather than children. It looked like a design
 *   choice.
 * - **Two max-widths fought.** 1600 from the screen, `--content-max` from the
 *   shell; whichever was smaller won, so the shell's cap did nothing on any
 *   screen and the export's *"content caps at 1400 and centres, rail stays
 *   pinned left"* was never true.
 *
 * ### Both halves are asserted
 *
 * A rule that only forbids the old thing lets the grid quietly empty out
 * again, so this file also requires the spans to be *there*.
 */

import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from '../../src/components/index.js';
import { readStripped, sourceFiles } from '../components/support/scan.js';

/**
 * `import.meta.dirname`, not `new URL(rel, import.meta.url)` — under jsdom the
 * global `URL` at module scope resolves against the document base and
 * `fileURLToPath` throws. `support/scan.ts` carries the long version.
 */
const SRC = join(import.meta.dirname, '..', '..', 'src');

const featureFiles = (): string[] =>
  sourceFiles(join(SRC, 'features')).filter((path) => path.endsWith('.tsx'));

/**
 * The two screens that render **outside** `AppShell` and therefore legitimately
 * own their own page box: the landing page (signed out, no rail) and the
 * battle screen (full-bleed, the rail is hidden while a battle is open).
 */
const OUTSIDE_THE_SHELL = ['landing/', 'auth/', 'battle/'];

const MAX_WIDTH = /max-w-\[\d+px\]/;

describe('the shell owns the page box', () => {
  const files = featureFiles();

  it('finds files to scan', () => {
    expect(files.length, 'the scan matched nothing — every assertion below is vacuous').toBeGreaterThan(
      10,
    );
  });

  it.each(
    files
      .map((path) => [path.slice(SRC.length + 1).replace(/\\/g, '/'), path] as const)
      .filter(([rel]) => !OUTSIDE_THE_SHELL.some((prefix) => rel.startsWith('features/' + prefix))),
  )('%s declares no page width of its own', (rel, path) => {
    /**
     * Comment-stripped, because this file's own explanation of the rule
     * contains the string the rule forbids — and so do several of the ported
     * screens. A scan that matches the prose banning a pattern is the most
     * repeated false positive in this repo.
     */
    const body = readStripped(path);
    const hit = MAX_WIDTH.exec(body);
    expect(
      hit?.[0],
      `${rel} sets ${hit?.[0]} — the page width belongs to AppShell, and a second one silently wins whenever it is smaller`,
    ).toBeUndefined();
  });
});

describe('the twelve columns are actually used', () => {
  /**
   * `Panel` is the only way onto the grid, so a screen with no `Panel` is a
   * screen back inside a private container. This is the half that fails if
   * somebody "simplifies" a screen by wrapping it in a plain `<div>` again.
   */
  it.each([
    ['features/roster/RosterScreen.tsx'],
    ['features/codex/CodexScreen.tsx'],
    ['features/squads/SquadsScreen.tsx'],
    ['features/attack/AttackScreen.tsx'],
    ['features/profile/ProfileScreen.tsx'],
    ['features/guilds/GuildScreen.tsx'],
  ])('%s places its regions with Panel', (rel) => {
    const body = readStripped(join(SRC, rel));
    expect(body, `${rel} renders no <Panel> — it is not on the shell's grid`).toMatch(/<Panel[\s>]/);
  });

  /**
   * And at least one screen must ask for something other than the full twelve,
   * or the grid is being used as a single column with extra steps. The Roster's
   * filter rail is the export's 264px one; the Codex splits 6/6.
   */
  it('at least one screen splits the row', () => {
    const splitting = [
      'features/roster/RosterScreen.tsx',
      'features/codex/CodexScreen.tsx',
      'features/squads/SquadsScreen.tsx',
    ].filter((rel) => {
      const body = readStripped(join(SRC, rel));
      return /<Panel span=\{(?:[1-9]|1[01])\}/.test(body);
    });

    expect(splitting, 'every screen spans all twelve — nothing is beside anything').not.toHaveLength(
      0,
    );
  });
});

describe('Panel puts a real span on the element', () => {
  /**
   * The scans above read source text, so they cannot tell `span={3}` from a
   * `Panel` that ignores it. This renders one.
   */
  it('emits the column-span class', () => {
    render(
      <Panel span={3}>
        <p>rail</p>
      </Panel>,
    );
    expect(screen.getByText('rail').parentElement).toHaveClass('col-span-3');
  });

  it('defaults to the full twelve', () => {
    render(
      <Panel>
        <p>full</p>
      </Panel>,
    );
    expect(screen.getByText('full').parentElement).toHaveClass('col-span-12');
  });
});
