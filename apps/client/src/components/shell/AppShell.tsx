/**
 * `AppShell` — rail, header, and the 12-column content grid (017 T018).
 *
 * Layout, in the export's own numbers: rail fixed at 220px pinned left, gutter
 * 24, content flexing from the 1280 floor and **capping at 1400 and centring
 * above roughly 2100**. It never collapses to one column — below 1280 the page
 * scrolls, because a squad is six heroes in a fixed 2/3/1 formation and the
 * defense screen shows two of them side by side. Compressing that is a
 * different interface, not a smaller one.
 *
 * ### The title bar is a slot this component does not fill
 *
 * The export documents an Electron frame: custom title bar, drag region,
 * window controls. **There is no Electron at 1.0** — the shipping artifacts are
 * a static browser bundle and, later, the same bundle on Steam. So `titleBar`
 * is accepted and rendered if given, and nothing here constructs one.
 *
 * That is the deliberate difference between an unused *seam* and an unused
 * *implementation*. Building the frame now would be code nothing runs, which
 * this project has shipped too many times; leaving no seam at all would mean
 * reshaping the shell later. A prop that is almost always `undefined` costs
 * one line and keeps the Steam path open.
 */

import type { ReactNode } from 'react';

export interface AppShellProps {
  readonly rail: ReactNode;
  /**
   * **Optional, because the app renders its header above the shell** (019 US2).
   *
   * A signed-in player must always have a visible sign-out — this is a
   * shared-computer game with a thirty-day renewal token in storage. If the
   * header lives *inside* the shell, then every state that renders without the
   * shell has no way out: the battle screen, and `ResumeBattle`'s
   * *"Checking for a battle in progress…"*, which is a dead end if
   * `GET /battles/open` never answers.
   *
   * So `App` renders one `Header` above all of them. The slot stays for any
   * shell that wants its own.
   */
  readonly header?: ReactNode;
  readonly children: ReactNode;
  /**
   * Electron's custom title bar and drag region. **Left empty by the browser
   * build, which is every build at 1.0.**
   */
  readonly titleBar?: ReactNode;
}

export function AppShell({ rail, header, children, titleBar }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex h-full min-w-[1280px] flex-col bg-bg text-parchment">
      {titleBar}
      <div className="flex min-h-0 flex-1">
        {rail}
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <main className="min-h-0 flex-1 overflow-y-auto px-(--gutter) py-(--gutter)">
            {/* Capped and centred: above ~2100 the content stops growing and
                the rail stays pinned left rather than drifting with it. */}
            <div className="mx-auto grid w-full max-w-(--content-max) grid-cols-12 gap-(--gutter)">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * A span on the 12-column grid. The export's worked example is `SPAN 8 · squad
 * board` beside `SPAN 4 · inspector`.
 *
 * Written out rather than interpolated because Tailwind scans source text — a
 * template literal would generate no class at all and every panel would
 * silently render full width.
 */
const SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

export interface PanelProps {
  readonly span?: keyof typeof SPAN;
  readonly children: ReactNode;
}

export function Panel({ span = 12, children }: PanelProps): React.JSX.Element {
  return <section className={SPAN[span] ?? SPAN[12]}>{children}</section>;
}
