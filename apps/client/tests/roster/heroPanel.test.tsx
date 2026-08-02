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
import { STAT_CAP, STAT_KEYS, getAllHeroes, getPassive } from '@lmntlz/content';
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

/** A rune reply covering several champions, each at the stages given. */
const runesFor = (byHero: Record<string, readonly number[]>) => ({
  heroes: Object.entries(byHero).map(([heroId, stages]) => ({
    heroId,
    slots: (['primary', 'secondary', 'common'] as const).map((slot, i) => ({
      slot,
      element: null,
      stage: stages[i] ?? 0,
      allocations: {},
      utility: null,
      spent: 0,
    })),
  })),
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
    const named = within(panel)
      .getAllByRole('button')
      .map((b) => b.textContent);

    expect(named).toEqual([...hero.passives]);
  });
});

/**
 * The passive flyout — *"I do want the same hover treatment that the powers have for
 * the passives"* (Jon, 2026-08-01).
 *
 * The passives were names on a list with nothing behind them, because a hero carries
 * three bare strings and the meanings had never left `03-powers.md`. `getPassive` is
 * the catalog that fixes that; this is the reading of it.
 */
describe('the passive flyout', () => {
  const roleOf = (h: typeof hero) => h.passives[0];

  it('opens on hover, the way the power rows do', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    expect(within(drawer).queryByRole('tooltip')).toBeNull();

    await userEvent.hover(within(drawer).getByText(roleOf(hero)));

    const flyout = await within(drawer).findByRole('tooltip');
    expect(flyout).toHaveTextContent(roleOf(hero));
    expect(flyout, 'the scope is what makes forty passives learnable').toHaveTextContent(/role/i);
  });

  /**
   * **A flyout reachable only by pointer is one a keyboard player cannot open**, which
   * is the reason the power rows are buttons rather than bare list items. The passives
   * inherit that or they inherit half the treatment.
   */
  it('opens on keyboard focus too', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    within(drawer).getByText(roleOf(hero)).focus();

    expect(await within(drawer).findByRole('tooltip')).toHaveTextContent(roleOf(hero));
  });

  it('shows the authored effect where the design has written one', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    /* Every hero's slots 0 and 1 are a role and a house passive, and all thirteen of
       those have authored effects — so this holds for any champion the fixture picks. */
    await userEvent.hover(within(drawer).getByText(roleOf(hero)));

    const flyout = await within(drawer).findByRole('tooltip');
    expect(flyout).toHaveTextContent(getPassive(roleOf(hero))!.effect!);
    expect(flyout).not.toHaveTextContent(/not yet specified/i);
  });

  /**
   * ⭐ **T041 — the flyout shows real text for all 27 uniques.**
   *
   * ⚠️ **This test used to assert the opposite and it was right to.** For most of
   * this project 19 of the 27 uniques had no authored effect, and the panel said
   * *"not yet specified"* rather than inventing one — text written on a screen to
   * fill a space would have made it a second source for unmade design decisions.
   *
   * They were approved and written on 2026-08-01, so the honest claim inverted: the
   * placeholder is now **unreachable on the real roster**, and a champion that
   * reached it would be an authoring gap that shipped.
   *
   * The catalog half is asserted for all 27 cheaply; the render half is asserted
   * through the real drawer for a champion that was unwritten until that date, so
   * the wiring is exercised rather than assumed.
   */
  it('shows an authored effect for every unique, and the placeholder for none', async () => {
    const unwritten = getAllHeroes()
      .map((h) => h.passives[2])
      .filter((name) => getPassive(name)?.effect == null);

    expect(unwritten, 'a champion would reach the flyout with nothing to say').toEqual([]);

    /* Bramwen's The Long Patience — one of the nineteen, authored 2026-08-01. */
    const owner = getAllHeroes().find((h) => h.passives[2] === 'The Long Patience')!;

    serve({ heroes: [] });
    render(<RosterScreen />);

    const cards = await screen.findAllByRole('button', { name: new RegExp(owner.name, 'i') });
    await userEvent.click(cards[0]!);
    const drawer = (await screen.findByLabelText('Passives')).closest('aside')!;

    await userEvent.hover(within(drawer).getByText('The Long Patience'));

    const flyout = await within(drawer).findByRole('tooltip');
    expect(flyout).toHaveTextContent(getPassive('The Long Patience')!.effect!);
    expect(flyout).not.toHaveTextContent(/not yet specified/i);
  });

  /** Held on hover, cleared on leave — this flyout overlays the champion grid. */
  it('closes when the pointer leaves the list', async () => {
    serve({ heroes: [] });
    render(<RosterScreen />);
    const drawer = await openDrawer();

    const list = within(drawer).getByText(roleOf(hero)).closest('ul')!;
    await userEvent.hover(within(drawer).getByText(roleOf(hero)));
    expect(await within(drawer).findByRole('tooltip')).toBeInTheDocument();

    await userEvent.unhover(list);
    await vi.waitFor(() => expect(within(drawer).queryByRole('tooltip')).toBeNull());
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

/**
 * The gear filter and the card's rune block (Jon, 2026-08-01).
 *
 * > *"add 'Partial Runes' and 'Fully Runed' as filters"* · *"in the upper right of the
 * > hero cards, let's show the rune status block as well"*
 *
 * Both read the same `GET /me/runes` the stat panel does, and both have a state that is
 * easy to get wrong in the same direction: **not knowing must not read as knowing.**
 * Before the request lands there is no build to judge, and a champion whose runes have
 * not loaded is not a bare one.
 */
describe('the gear filter', () => {
  const heroes = getAllHeroes();
  const full = heroes[0]!;
  const partial = heroes[1]!;
  const bare = heroes[2]!;

  const withRunes = () =>
    runesFor({ [full.id]: [4, 4, 4], [partial.id]: [4, 1, 0], [bare.id]: [0, 0, 0] });

  const names = () =>
    screen
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
      .join(' | ');

  const pick = async (label: string) =>
    userEvent.click(await screen.findByRole('radio', { name: label }));

  it('shows only champions with every slot at the cap under Fully runed', async () => {
    serve(withRunes());
    render(<RosterScreen />);
    await pick('Fully runed');

    const shown = names();
    expect(shown).toContain(full.name);
    expect(shown, 'a part-geared champion counted as finished').not.toContain(partial.name);
    expect(shown, 'an ungeared champion counted as finished').not.toContain(bare.name);
  });

  /**
   * **Partial is "something, but not everything"** — the Forge's own definition. A
   * reading of "has any rune" would sweep in the fully-runed champions and make the two
   * filters overlap, which is the mistake that looks right until you count.
   */
  it('excludes both the finished and the untouched under Partial', async () => {
    serve(withRunes());
    render(<RosterScreen />);
    await pick('Partial');

    const shown = names();
    expect(shown).toContain(partial.name);
    expect(shown, 'a fully runed champion is not partial').not.toContain(full.name);
    expect(shown, 'an ungeared champion is not partial').not.toContain(bare.name);
  });

  /**
   * ⚠️ **Offering a filter that can only empty the grid is a dead end.** With no runes
   * read there is nothing for either option to match, so the control is not drawn.
   */
  it('is not offered at all when the account has no runes', async () => {
    serve(null);
    render(<RosterScreen />);
    await screen.findAllByRole('listitem');

    expect(screen.queryByRole('radiogroup', { name: 'Gear' })).toBeNull();
    /* And Reach is still there, so the absence above is about gear and not a rail that
       failed to render. */
    expect(screen.getByRole('radiogroup', { name: 'Reach' })).toBeInTheDocument();
  });

  it('is cleared by Clear filters along with everything else', async () => {
    serve(withRunes());
    render(<RosterScreen />);
    await pick('Fully runed');
    expect(names()).not.toContain(bare.name);

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(names(), 'the gear filter survived a clear').toContain(bare.name);
  });
});

describe('the rune block on a hero card', () => {
  const heroes = getAllHeroes();

  it('draws three pips once the runes are known', async () => {
    serve(runesFor({ [heroes[0]!.id]: [4, 2, 0] }));
    render(<RosterScreen />);

    /* `RunePips` labels itself with the champion, which is how a card's block is told
       from the drawer's content without reaching for a class name. */
    await vi.waitFor(() =>
      expect(screen.getAllByLabelText(new RegExp(heroes[0]!.name, 'i')).length).toBeGreaterThan(0),
    );
  });

  /**
   * The half that matters: **an unread build is not an empty one.** Three hollow pips
   * would state "nothing invested" about a champion nobody has asked the server about.
   */
  it('draws nothing at all when the runes are unknown', async () => {
    serve(null);
    render(<RosterScreen />);
    const cards = await screen.findAllByRole('listitem');

    for (const card of cards) {
      expect(
        within(card).queryByText(/rune/i),
        'a card claimed a build with no rune data loaded',
      ).toBeNull();
    }
  });
});
