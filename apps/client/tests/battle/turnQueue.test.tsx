/**
 * The turn queue projects locally (007 T029, FR-006).
 *
 * **The assertion is the absence of a request, not the order of the names.**
 * The order is `turnQueue`'s job and `packages/sim` tests it against the
 * engine's own `nextActor` for twenty consecutive turns. What this file exists
 * to catch is the regression where somebody adds `GET /battles/:id/queue` —
 * because that is a round trip *per turn*, to compute something from a board the
 * client is already holding, and it would arrive after the player had been asked
 * to choose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getHero } from '@lmntlz/content';
import { turnQueue } from '@lmntlz/sim/rules';
import { TurnQueue } from '../../src/features/battle/TurnQueue.js';
import { board } from './fixtures.js';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Any call at all is the failure — not a specific URL, because the point is
  // that nothing leaves the process.
  fetchSpy = vi.fn(() => Promise.reject(new Error('the turn queue made a request')));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const name = (heroId: string) => getHero(heroId).name;

describe('the projected queue', () => {
  it('renders without any network call', () => {
    render(<TurnQueue state={board()} heroName={name} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Turn order' })).toBeTruthy();
  });

  it('shows the same order the shared rule produces', () => {
    const state = board();
    const expected = turnQueue(state, 8);

    render(<TurnQueue state={state} heroName={name} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

    expect(items).toHaveLength(expected.length);
    for (const [i, instanceId] of expected.entries()) {
      const hero = state.heroes.find((h) => h.instanceId === instanceId)!;
      expect(items[i], `position ${i}`).toContain(name(hero.heroId));
    }
  });

  it('marks each entry as the player’s or the enemy’s', () => {
    const state = board();
    render(<TurnQueue state={state} heroName={name} />);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    for (const [i, instanceId] of turnQueue(state, 8).entries()) {
      expect(items[i]).toContain(instanceId.startsWith('a-') ? 'yours' : 'enemy');
    }
  });

  it('survives a hero appearing twice in one projection', () => {
    /**
     * **A fast champion genuinely acts twice inside eight turns**, so the list
     * key cannot be the instance id. Rendering with a duplicate key does not
     * throw — React warns and reuses a node — so the check is that the number of
     * rows still matches the projection rather than collapsing to the distinct
     * ones.
     */
    const state = board();
    const projected = turnQueue(state, 8);
    const distinct = new Set(projected).size;

    render(<TurnQueue state={state} lookahead={8} heroName={name} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(projected.length);

    // The fixture must actually contain a repeat, or this proves nothing.
    expect(distinct).toBeLessThan(projected.length);
  });

  it('says so plainly when nothing is standing', () => {
    const empty = { ...board(), heroes: [] };
    render(<TurnQueue state={empty} heroName={name} />);
    expect(screen.getByText(/no standing champions/i)).toBeTruthy();
  });
});

/**
 * **No accumulator reaches the screen** (017 T051 · Constitution XIII).
 *
 * The Turn Sequence export draws the order as connected nodes down a rail and
 * numbers each node `{{ f.tick }}`. The rail was worth porting; the tick was
 * not. `CLAUDE.md` settles it — *"a tick is internal — the player sees a
 * projected turn queue"* — and the risk is not that somebody argues with that,
 * it is that somebody ports the export faithfully and the accumulator arrives
 * as a side effect of good intentions.
 *
 * So the discs are asserted to carry **1..n**, which is the position, and the
 * fixture is built so the two cannot be confused: its first attacker starts at
 * accumulator 99 while everyone else is at 0, so any tick-derived number would
 * be a large one and none of them would be a clean `1, 2, 3`.
 */
describe('the queue never surfaces the accumulator', () => {
  it('numbers the rail by position, starting at 1', () => {
    const state = board();
    const projected = turnQueue(state, 8);

    render(<TurnQueue state={state} heroName={name} />);
    const items = screen.getAllByRole('listitem');

    const discs = items.map((li) => li.querySelector('span')?.textContent?.trim() ?? '');
    expect(discs).toEqual(projected.map((_, i) => String(i + 1)));
  });

  it('shows no accumulator value anywhere in the region', () => {
    const state = board();
    render(<TurnQueue state={state} heroName={name} />);

    const text = screen.getByRole('region', { name: 'Turn order' }).textContent ?? '';

    /**
     * The fixture's one non-zero accumulator. Asserting on *this* number rather
     * than on the word "tick" is what makes the test bite: a port that printed
     * `{{ f.tick }}` would render the value, not the label.
     */
    const accumulators = state.heroes.map((h) => h.accumulator).filter((a) => a > 0);
    expect(accumulators.length, 'the fixture has no accumulator to leak').toBeGreaterThan(0);

    for (const value of accumulators) {
      expect(text, `the accumulator ${value} is on screen`).not.toContain(String(value));
    }

    // And the words themselves, for the version that labels it.
    expect(text.toLowerCase()).not.toContain('tick');
    expect(text.toLowerCase()).not.toContain('accumulator');
  });
});
