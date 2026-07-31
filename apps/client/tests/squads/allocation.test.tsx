/**
 * The builder's local half (T018–T020).
 *
 * **The thing under test is that the client mirrors and never decides.** Local
 * shape validation is feedback; eviction and the streak reset belong to the
 * server. A client that computed either would be computing it about state it
 * may not have — and would under-report, which is how a player discovers the
 * third attack squad mid-battle.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, renderHook } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import { useAllocation } from '../../src/features/squads/hooks/useAllocation.js';
import { RosterView } from '../../src/features/squads/RosterView.js';
import { SquadBuilder } from '../../src/features/squads/SquadBuilder.js';
import { IDS, nameOf, roster } from './fixtures.js';

describe('the roster shows all 27, always', () => {
  it('renders every champion with no locked or unrecruited state', () => {
    const { container } = render(
      <RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />,
    );

    /**
     * **By `data-hero`, not by counting every button.** 019 US2 gave the picker
     * a search box, nine House chips and nine covers-bane swatches, so "every
     * button on screen is a champion" stopped being true — and it was never the
     * claim worth making. The claim is that all 27 are listed, unfiltered.
     */
    expect(container.querySelectorAll('[data-hero]')).toHaveLength(27);

    // A greyed-out card would be the first pixel of a collection system.
    for (const word of [/locked/i, /recruit/i, /unlock/i, /owned/i]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('names the zone a defender is committed to, not merely that she is busy', () => {
    const { container } = render(
      <RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />,
    );
    expect(screen.getAllByText('In defense 1').length).toBe(6);
    expect(screen.getAllByText('In defense 2').length).toBe(6);

    /**
     * **And the fifteen free ones carry no badge at all.**
     *
     * This replaced an `UNASSIGNED` label on every free card. The reasoning for
     * that label was that an absent tag is indistinguishable from a tag that
     * failed to render — true while the badge was the only thing in that
     * corner, and no longer true now the card also draws marks, a name, rune
     * pips and a reach.
     *
     * Counting the badges rather than searching for absent text is what keeps
     * this honest: it proves fifteen cards *have no badge*, where
     * `queryByText('Unassigned')` returning null would also be satisfied by a
     * picker that rendered nothing whatsoever.
     */
    expect(container.querySelectorAll('[data-commitment]').length).toBe(12);
    expect(container.querySelectorAll('[data-hero]').length).toBe(27);
  });

  /**
   * **A Force filter matches a champion who carries that Force at all.**
   *
   * The first version matched `primary` only, so an Earth champion with a Fire
   * secondary — who deals Fire, and whose Fire is half of what `coverage()`
   * counts — was hidden from a player filtering for Fire. That is the picker
   * lying about the roster to the one player who needs the answer.
   *
   * The fixture is not hand-picked: the champion is *found* by asking the
   * content package for one whose secondary is Fire and whose primary is not.
   * A hardcoded name would pass here and stop meaning anything the next time
   * the roster is tuned.
   */
  it('filters on both authored forces, not only the House', async () => {
    const payload = roster();
    const crossover = payload.heroes.find((h) => h.secondary === 'fire' && h.primary !== 'fire');
    expect(crossover, 'no champion has Fire as a secondary — the fixture changed').toBeDefined();

    const { container } = render(
      <RosterView roster={payload} selectedHeroId={null} onSelect={() => {}} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^fire$/i }));

    const shown = [...container.querySelectorAll('[data-hero]')].map((el) =>
      el.getAttribute('data-hero'),
    );
    expect(shown).toContain(crossover!.id);
    for (const id of shown) {
      const hero = payload.heroes.find((h) => h.id === id)!;
      expect(hero.strengths).toContain('fire');
    }
  });

  it('states the pool, which is why overlap keeps happening', () => {
    render(<RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />);
    expect(screen.getByText(/12 \/ 12 on defense · 15 left for 3 squads of 6/)).toBeInTheDocument();
  });

  it('always shows the ambush chance, from the server (FR-015)', () => {
    // Not on hover and not behind a tooltip. It is the odds of somebody
    // reaching your Hidden squad, it rises with every attack win you take, and
    // a player who cannot see it cannot decide whether to keep pushing.
    render(<RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />);

    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText(/\+2% per win, up to 90%/)).toBeInTheDocument();
  });

  it('says so at the cap rather than showing a number that stopped moving', () => {
    const atCap = { ...roster(), ambush: { chance: 90, perWin: 2, cap: 90, capAt: 45 } };
    render(<RosterView roster={atCap} selectedHeroId={null} onSelect={() => {}} />);
    expect(screen.getByText(/at cap/)).toBeInTheDocument();
  });
});

describe('placement mirrors the server rule, from the same module', () => {
  it('reports a fault while the squad is under construction, without blocking', () => {
    const { result } = renderHook(() => useAllocation(roster(), 'visible'));

    act(() => result.current.remove(IDS[0]!));
    expect(result.current.fault?.code).toBe('wrong-size');
    expect(result.current.isComplete).toBe(false);

    // Still placeable — an incomplete squad is the normal state of the screen.
    act(() => result.current.place(IDS[20]!, 'front', 0));
    expect(result.current.fault).toBeNull();
    expect(result.current.isComplete).toBe(true);
  });

  it('SWAPS two seated heroes rather than dropping one out', () => {
    // **Reordering a formation is the most common thing on this screen**, and
    // the naive "remove whoever was there" turns a full squad into five every
    // single time.
    const { result } = renderHook(() => useAllocation(roster(), 'visible'));
    const displaced = IDS[4]!; // holds middle:2

    act(() => result.current.place(IDS[0]!, 'middle', 2));

    expect(result.current.seats).toHaveLength(SQUAD_SIZE);
    expect(result.current.fault).toBeNull();
    expect(result.current.seats.find((s) => s.heroId === IDS[0])).toEqual({
      row: 'middle',
      index: 2,
      heroId: IDS[0],
    });
    // The other hero took the vacated seat rather than leaving the squad.
    expect(result.current.seats.find((s) => s.heroId === displaced)).toEqual({
      row: 'front',
      index: 0,
      heroId: displaced,
    });
    expect(new Set(result.current.seats.map((s) => s.heroId)).size).toBe(SQUAD_SIZE);
  });

  it('REPLACES when the hero comes from the bench, and the squad stays six', () => {
    const { result } = renderHook(() => useAllocation(roster(), 'visible'));
    const bench = IDS[20]!;

    act(() => result.current.place(bench, 'middle', 2));
    expect(result.current.seats).toHaveLength(SQUAD_SIZE);
    expect(result.current.seats.some((s) => s.heroId === IDS[4])).toBe(false);
  });

  it('treats the edited zone as in-progress, not as stored', () => {
    // Removing a hero locally must free her immediately — otherwise the roster
    // still shows her committed to the zone the player is editing.
    const { result } = renderHook(() => useAllocation(roster(), 'visible'));
    expect(result.current.defending.has(IDS[0]!)).toBe(true);

    act(() => result.current.remove(IDS[0]!));
    expect(result.current.defending.has(IDS[0]!)).toBe(false);
    expect(result.current.poolForOffense).toBe(27 - 11);
  });
});

describe('the formation grid is reachable without a mouse', () => {
  it('exposes all six seats as buttons with position labels', async () => {
    const user = userEvent.setup();
    const activated: string[] = [];

    function Harness() {
      const allocation = useAllocation(roster(), 'visible');
      return (
        <SquadBuilder
          allocation={allocation}
          heroName={nameOf}
          kind="defense"
          selectedHeroId={null}
          onSeatActivate={(row, index) => activated.push(`${row}:${index}`)}
        />
      );
    }

    render(<Harness />);
    const seats = screen.getAllByRole('button');
    expect(seats).toHaveLength(SQUAD_SIZE);

    // Keyboard is a first-class input here — there is no touch fallback.
    await user.tab();
    await user.keyboard('{Enter}');
    /**
     * **Back first, and that is the re-layout, not a regression** (017 T049).
     *
     * The Design System's applied builder row draws the formation as three
     * columns labelled `ROW 1 · BACK`, `ROW 2 · MID`, `ROW 3 · FRONT` with
     * `ENEMY ROWS 4–6` immediately to their right — so left to right *is* the
     * shared 1–6 reach axis. DOM order follows it, which means tab order does
     * too, and the first seat a keyboard reaches is row 1.
     *
     * This assertion used to read `front:0`, from a vertical stack that drew
     * front at the top and put the axis nowhere on screen.
     */
    expect(activated).toEqual(['back:0']);
  });

  /**
   * The stronger claim, and the one worth keeping: **tabbing walks the axis in
   * order**, 1 → 2 → 3. A future layout that reorders the columns for looks
   * would still pass the assertion above and fail this one.
   */
  it('tabs through the seats along the shared 1-6 axis', async () => {
    const user = userEvent.setup();
    const activated: string[] = [];

    function Harness() {
      const allocation = useAllocation(roster(), 'visible');
      return (
        <SquadBuilder
          allocation={allocation}
          heroName={nameOf}
          kind="defense"
          selectedHeroId={null}
          onSeatActivate={(row, index) => activated.push(`${row}:${index}`)}
        />
      );
    }

    render(<Harness />);
    for (let i = 0; i < SQUAD_SIZE; i += 1) {
      await user.tab();
      await user.keyboard('{Enter}');
    }

    expect(activated).toEqual([
      'back:0',
      'middle:0',
      'middle:1',
      'middle:2',
      'front:0',
      'front:1',
    ]);
  });
});

describe('the client never decides eviction or the streak (SC — server authority)', () => {
  const dir = join(import.meta.dirname, '../../src/features/squads');

  const sources = (function walk(d: string): string[] {
    return readdirSync(d).flatMap((entry) => {
      const full = join(d, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });
  })(dir);

  /**
   * The file with its comments removed.
   *
   * **Both scans below use this, and the second one did not, and that was a
   * defect in the test rather than in the code.** These files explain *why* the
   * client may not reach the defense AI — and a scan that reads prose flags the
   * explanation, so the only way to make it pass is to delete the reason. The
   * whole point of a comment is that it is not code; a scan for code must not
   * read it.
   *
   * **The strip is checked, because a bad regex that ate the file would make
   * every assertion below vacuously true** — which is the failure mode of a
   * comment-stripping scan and the one that leaves no trace.
   */
  const codeOf = (path: string): string => {
    const stripped = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(
      /\b(import|export|const|function)\b/.test(stripped),
      `stripping comments emptied ${path} — the scan below would pass on nothing`,
    ).toBe(true);

    return stripped;
  };

  it('scans a non-empty feature tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('computes no streak and no eviction locally', () => {
    // **Structural, because behaviour cannot prove an absence.** A local
    // eviction calculation would be right most of the time and silently short
    // by one squad exactly when a third squad exists.
    const FORBIDDEN = [/streakResets/, /canonicalHash/, /canonicalForm/, /evictionImpact/];

    for (const path of sources) {
      const source = codeOf(path);
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${path} computes ${String(pattern)} locally`).toBe(false);
      }
    }
  });

  it('imports nothing from the resolver or the defense AI', () => {
    // eslint blocks a direct import and purity.test.ts walks the graph; this is
    // the third layer, and the cheap one to read.
    for (const path of sources) {
      const source = codeOf(path);
      for (const forbidden of ['@lmntlz/sim/resolver', '@lmntlz/sim/ai']) {
        expect(source.includes(forbidden), `${path} imports ${forbidden}`).toBe(false);
      }
    }
  });
});
