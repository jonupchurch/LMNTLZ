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
import { getAllHeroes } from '@lmntlz/content';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import { useAllocation } from '../../src/features/squads/hooks/useAllocation.js';
import { RosterView } from '../../src/features/squads/RosterView.js';
import { SquadBuilder } from '../../src/features/squads/SquadBuilder.js';
import type { RosterResponse } from '../../src/features/squads/types.js';

const HEROES = getAllHeroes();
const IDS = HEROES.map((h) => h.id);
const nameOf = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id;

const seatsFrom = (ids: readonly string[]) => [
  { row: 'front' as const, index: 0, heroId: ids[0]! },
  { row: 'front' as const, index: 1, heroId: ids[1]! },
  { row: 'middle' as const, index: 0, heroId: ids[2]! },
  { row: 'middle' as const, index: 1, heroId: ids[3]! },
  { row: 'middle' as const, index: 2, heroId: ids[4]! },
  { row: 'back' as const, index: 0, heroId: ids[5]! },
];

const roster = (over: Partial<RosterResponse['assignments']> = {}): RosterResponse => ({
  heroes: HEROES,
  assignments: {
    defense: {
      visible: { seats: seatsFrom(IDS.slice(0, 6)), holdStreak: 14, editedAt: null, canDefend: true },
      hidden: { seats: seatsFrom(IDS.slice(6, 12)), holdStreak: 3, editedAt: null, canDefend: true },
    },
    offense: [],
    ...over,
  },
  streaks: { attack: 7, hold: { visible: 14, hidden: 3 } },
  ambush: { chance: 14, perWin: 2, cap: 90, capAt: 45 },
  available: { forDefense: IDS, forOffense: IDS.slice(12) },
});

describe('the roster shows all 27, always', () => {
  it('renders every champion with no locked or unrecruited state', () => {
    render(<RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />);

    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(27);

    // A greyed-out card would be the first pixel of a collection system.
    for (const word of [/locked/i, /recruit/i, /unlock/i, /owned/i]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('names the zone a defender is committed to, not merely that she is busy', () => {
    render(<RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />);
    expect(screen.getAllByText(/Defending · visible/).length).toBe(6);
    expect(screen.getAllByText(/Defending · hidden/).length).toBe(6);
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
    expect(activated).toEqual(['front:0']);
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

  it('scans a non-empty feature tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('computes no streak and no eviction locally', () => {
    // **Structural, because behaviour cannot prove an absence.** A local
    // eviction calculation would be right most of the time and silently short
    // by one squad exactly when a third squad exists.
    const FORBIDDEN = [/streakResets/, /canonicalHash/, /canonicalForm/, /evictionImpact/];

    for (const path of sources) {
      const source = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${path} computes ${String(pattern)} locally`).toBe(false);
      }
    }
  });

  it('imports nothing from the resolver or the defense AI', () => {
    // eslint blocks a direct import and purity.test.ts walks the graph; this is
    // the third layer, and the cheap one to read.
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toContain('@lmntlz/sim/resolver');
      expect(source).not.toContain('@lmntlz/sim/ai');
    }
  });
});
