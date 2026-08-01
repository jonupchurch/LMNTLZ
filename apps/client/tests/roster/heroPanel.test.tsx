/**
 * The roster drawer: passives, and every stat at the value it fights at.
 *
 * > *"I want to see the passives that each hero has on the hero panel. Also, I want ALL
 * > the stats to be listed at the bottom, and they should be the amount including
 * > runes."* — Jon, 2026-08-01
 *
 * ### Why the rune half is the part worth testing
 *
 * Four of the ten stats used to be shown, at their **authored** values. On a screen
 * whose whole job is deciding who counters what, that was silent about Armor and Magic
 * Resist — which decide whether a packet lands hard — and it misreported every geared
 * champion, in a way that looks exactly like a rune that did nothing.
 *
 * The number on screen is `cappedStat(base, runePoints)`, the same function `board.ts`
 * builds a battle with. These tests pin the two readings that can go wrong quietly: the
 * boost is **summed across all three slots** onto whatever stat the player pointed it
 * at, and a stat already at the cap **does not move**.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STAT_CAP, STAT_KEYS, getAllHeroes } from '@lmntlz/content';
import { RosterScreen, STAT_LABEL } from '../../src/features/roster/RosterScreen.js';

/** The champion the drawer is opened on throughout. */
const hero = getAllHeroes()[0]!;

/** `GET /me/runes` for one hero, with the points split over the three slots. */
const runesReply = (allocations: Array<Record<string, number>>) => ({
  heroes: [
    {
      heroId: hero.id,
      slots: allocations.map((a, i) => ({
        slot: (['primary', 'secondary', 'common'] as const)[i]!,
        element: null,
        stage: 3,
        allocations: a,
        utility: null,
        spent: 450,
      })),
    },
  ],
});

const serve = (body: unknown | null) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      body === null
        ? new Response('nope', { status: 401 })
        : new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    ),
  );

/**
 * Open the drawer on `hero` and return the `aside` it lives in.
 *
 * Anchored on the Passives section rather than the champion's name: the drawer renders
 * the name through a CSS `uppercase`, so the DOM still holds the original casing and a
 * `getByText('BRAMWEN')` finds nothing while the screen plainly shows it.
 */
const openDrawer = async () => {
  const cards = await screen.findAllByRole('button', { name: new RegExp(hero.name, 'i') });
  await userEvent.click(cards[0]!);
  const passives = await screen.findByLabelText('Passives');
  return passives.closest('aside') ?? document.body;
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the hero panel', () => {
  it('lists the champion’s three passives by name', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    await openDrawer();

    const panel = screen.getByLabelText('Passives');
    const named = within(panel).getAllByRole('listitem').map((li) => li.textContent);

    expect(named).toEqual([...hero.passives]);
  });

  /**
   * **All ten, not the four that used to be here.** Named individually rather than
   * counted, because a count passes on ten copies of Might.
   */
  it('lists every stat, not the four it used to show', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    for (const key of STAT_KEYS) {
      expect(
        within(drawer).getByText(STAT_LABEL[key]),
        `${key} is missing from the panel`,
      ).toBeInTheDocument();
    }

    /* And the two that motivated the ask are genuinely new to this screen. */
    expect(within(drawer).getByText('Armor')).toBeInTheDocument();
    expect(within(drawer).getByText('Resolve')).toBeInTheDocument();
  });

  it('shows the authored value when the account owns no runes', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    expect(within(drawer).getByText(STAT_LABEL.might).parentElement).toHaveTextContent(
      String(hero.stats.might),
    );
  });

  /**
   * The reported ask, as arithmetic: **points from all three slots land on one stat.**
   * A reading that took only the first slot, or that showed the authored number, both
   * pass every other test in this file.
   */
  it('adds rune points across all three slots', async () => {
    serve(runesReply([{ might: 3 }, { might: 4 }, { might: 5 }]));
    render(<RosterScreen />);
    const drawer = await openDrawer();

    const expected = Math.min(hero.stats.might + 12, STAT_CAP);
    await vi.waitFor(() =>
      expect(within(drawer).getByText(STAT_LABEL.might).parentElement).toHaveTextContent(String(expected)),
    );
  });

  /**
   * ⚠️ **Overcapping is waste, and the panel has to say so.** The cap is what makes
   * gear worth spreading rather than piling; a screen that showed 95 would turn the
   * rule into what looks like a display bug.
   */
  it('clamps at the cap and marks the wasted points', async () => {
    serve(runesReply([{ might: STAT_CAP }, {}, {}]));
    render(<RosterScreen />);
    const drawer = await openDrawer();

    await vi.waitFor(() => expect(within(drawer).getByText('capped')).toBeInTheDocument());
    expect(within(drawer).getByText(STAT_LABEL.might).parentElement).toHaveTextContent(String(STAT_CAP));
  });

  /**
   * The roster teaches counter-building and is bundled content — it must open with no
   * account and no network. A failed rune fetch falls back to the authored numbers,
   * which is exactly what the screen showed before runes were read at all.
   */
  it('still renders the panel when the rune request fails', async () => {
    serve(null);
    render(<RosterScreen />);
    const drawer = await openDrawer();

    expect(within(drawer).getByText(STAT_LABEL.might).parentElement).toHaveTextContent(
      String(hero.stats.might),
    );
    expect(screen.getByLabelText('Passives')).toBeInTheDocument();
  });
});
