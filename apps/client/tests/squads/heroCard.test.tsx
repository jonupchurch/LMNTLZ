/**
 * The hero card's face: the corner marks, the commitment badge and the title
 * card (019 US2).
 *
 * ### What this file can and cannot see
 *
 * jsdom does no layout, so nothing here proves anything about *where* a mark
 * lands — that is `e2e/squads.spec.ts`'s job, and it exists because a `relative`
 * that should have been `absolute` once shipped every card with its labels
 * clipped off-screen while 767 unit tests stayed green.
 *
 * What this file proves is the part jsdom is genuinely good at: that the right
 * facts are present, that they are the champion's own, and that they come from
 * the served payload rather than from a default that would look identical on a
 * screenshot.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { RosterView } from '../../src/features/squads/RosterView.js';
import { SquadBuilder } from '../../src/features/squads/SquadBuilder.js';
import { useAllocation } from '../../src/features/squads/hooks/useAllocation.js';
import { renderHook } from '@testing-library/react';
import { IDS, HEROES, roster, runeStages } from './fixtures.js';

const pick = () =>
  render(<RosterView roster={roster()} selectedHeroId={null} onSelect={() => {}} />);

describe('the corner marks name the champion and both Forces', () => {
  it('draws one mark cluster per card, keyed to that champion', () => {
    const { container } = pick();

    const marks = container.querySelectorAll('[data-hero-marks]');
    expect(marks.length).toBe(27);

    /* The id on the cluster is the id on the card it sits in — not merely 27
       clusters somewhere on the page. A cluster on the wrong card would give
       every player the same wrong Force at a glance. */
    for (const card of container.querySelectorAll('[data-hero]')) {
      const id = card.getAttribute('data-hero');
      expect(card.querySelector(`[data-hero-marks="${id}"]`), `card ${id}`).toBeTruthy();
    }
  });

  /**
   * **Both authored Forces, from `strengths`.**
   *
   * The expectation is computed from `@lmntlz/content`, never typed out. A card
   * drawing only `primary` would hide half of what a champion deals on the one
   * screen where that decides the pick — and it would disagree with the Force
   * filter beside it, which matches on either.
   */
  it('draws the secondary Force as well as the primary', () => {
    const { container } = pick();

    const mixed = HEROES.filter((h) => h.primary !== h.secondary);
    expect(mixed.length, 'every champion has two distinct Forces').toBe(27);

    for (const hero of mixed) {
      const cluster = container.querySelector(`[data-hero-marks="${hero.id}"]`)!;
      const badges = [...cluster.querySelectorAll('[data-variant="badge"]')].map((n) =>
        n.getAttribute('data-type-icon'),
      );
      expect(badges, `${hero.name}`).toEqual([hero.primary, hero.secondary]);
    }
  });

  it('names both Forces to a screen reader in one sentence, not three', () => {
    const hero = getAllHeroes()[0]!;
    pick();
    expect(
      screen.getByLabelText(`${hero.primary} primary, ${hero.secondary} secondary`),
    ).toBeTruthy();
  });
});

describe('the commitment badge names the squad', () => {
  it('distinguishes the two defense zones rather than reporting "busy"', () => {
    const { container } = pick();

    const labels = [...container.querySelectorAll('[data-commitment="defense"]')].map(
      (n) => n.textContent,
    );
    expect(labels.filter((l) => l === 'In defense 1').length).toBe(6);
    expect(labels.filter((l) => l === 'In defense 2').length).toBe(6);
  });

  /**
   * **Overlap is the normal state and the badge has to survive it.** Three
   * squads of six drawn from fifteen champions means at least three are on two
   * squads; a badge that named only the first would be wrong for exactly the
   * champions a player is most likely to be reasoning about.
   */
  it('lists every attack squad a champion is on, not the first', () => {
    const shared = IDS[12]!;
    const free = IDS.slice(12);
    const squad = (slot: number, ids: readonly string[]) => ({
      slot,
      name: null,
      seats: [
        { row: 'front' as const, index: 0, heroId: ids[0]! },
        { row: 'front' as const, index: 1, heroId: ids[1]! },
        { row: 'middle' as const, index: 0, heroId: ids[2]! },
        { row: 'middle' as const, index: 1, heroId: ids[3]! },
        { row: 'middle' as const, index: 2, heroId: ids[4]! },
        { row: 'back' as const, index: 0, heroId: ids[5]! },
      ],
      complete: true,
      valid: true,
    });

    const { container } = render(
      <RosterView
        roster={roster({
          offense: [
            squad(0, [shared, ...free.slice(1, 6)]),
            squad(1, [shared, ...free.slice(6, 11)]),
          ],
        })}
        selectedHeroId={null}
        onSelect={() => {}}
      />,
    );

    const badge = container
      .querySelector(`[data-hero="${shared}"]`)!
      .querySelector('[data-commitment]')!;
    expect(badge.textContent).toBe('Striking I,II');
  });
});

describe('the rune pips read the served stages', () => {
  /**
   * **Three tracks per card, always three.** The empty slots are the
   * information — two runes and three runes must not differ in *layout*, or a
   * player reads a gap as a rendering fault.
   */
  it('draws three slots on every card regardless of what is in them', () => {
    const { container } = pick();
    for (const card of container.querySelectorAll('[data-hero]')) {
      expect(card.querySelectorAll('[data-rune-slot]').length).toBe(3);
    }
  });

  /**
   * **The stage on screen is the stage the server sent.**
   *
   * This is the assertion that would have caught the scout serialiser shipping
   * `stages: 0` for every opponent since 006 — a range check (`0 <= stage <= 4`)
   * cannot tell a real value from a placeholder that happens to sit inside the
   * range. So the expectation is the fixture's own arithmetic, hero by hero.
   */
  it('renders each champion her own stages, in slot order', () => {
    const { container } = pick();
    const expected = new Map(runeStages().map((r) => [r.heroId, r.stages]));

    for (const card of container.querySelectorAll('[data-hero]')) {
      const id = card.getAttribute('data-hero')!;
      const drawn = [...card.querySelectorAll('[data-rune-stage]')].map((n) =>
        Number(n.getAttribute('data-rune-stage')),
      );
      expect(drawn, `${id}`).toEqual([...expected.get(id)!]);
    }
  });

  /**
   * The fixture has to contain the disagreement for the test above to mean
   * anything: if all 27 carried the same three stages, a component that ignored
   * its props entirely would pass. Asserted rather than assumed.
   */
  it('is tested against a fixture that actually varies', () => {
    const shapes = new Set(runeStages().map((r) => r.stages.join(',')));
    expect(shapes.size).toBeGreaterThan(3);
    expect([...shapes]).toContain('0,0,4');
  });
});

/**
 * The two chip rows.
 *
 * **Every expectation is computed from `@lmntlz/content`.** A hand-picked
 * champion name would pass today and stop meaning anything the next time the
 * roster is tuned — and `bane`/`fault` are derived from `primary`/`secondary`
 * by a bijection, so writing one out by hand is transcribing a table the
 * project forbids transcribing.
 */
describe('the Force row matches both Forces and ranks the House first', () => {
  const ids = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-hero]')].map((el) => el.getAttribute('data-hero')!);

  it('keeps a champion whose Fire is only a secondary', async () => {
    const { container } = pick();
    await userEvent.click(screen.getByRole('button', { name: /^fire$/i }));

    const shown = ids(container);
    const expected = HEROES.filter((h) => h.strengths.includes('fire')).map((h) => h.id);
    expect(new Set(shown)).toEqual(new Set(expected));
    expect(shown.length).toBeGreaterThan(3);
  });

  /**
   * **The ordering is the new part.** The filter already matched both fields;
   * a flat match buried the three Fire Houses among the Fire-secondaries, so
   * the obvious answers were not the first ones on screen.
   */
  it('puts every primary ahead of every secondary', async () => {
    const { container } = pick();
    await userEvent.click(screen.getByRole('button', { name: /^fire$/i }));

    const shown = ids(container);
    const isPrimary = (id: string) => HEROES.find((h) => h.id === id)!.primary === 'fire';
    const flags = shown.map(isPrimary);
    const primaries = flags.filter(Boolean).length;

    /* Every `true` is contiguous at the front — which is the claim, and is
       stronger than "the first card is a primary". */
    expect(flags.lastIndexOf(true)).toBe(primaries - 1);
    /* And the roster actually contains both kinds, or the assertion above is
       vacuously true: three Houses per Force, plus whoever took Fire second. */
    expect(primaries).toBe(3);
    expect(flags.length).toBeGreaterThan(primaries);
  });
});

describe('the Bane row filters on the weaknesses, ranking Bane above Fault', () => {
  const ids = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-hero]')].map((el) => el.getAttribute('data-hero')!);

  /** The chips are icon-only, so the accessible name is the only handle. */
  const clickBane = (type: string) =>
    userEvent.click(screen.getByRole('button', { name: `Weak to ${type}` }));

  it('shows the champions who bleed to it, by Bane or by Fault', async () => {
    const { container } = pick();
    await clickBane('fire');

    const expected = HEROES.filter((h) => h.bane === 'fire' || h.fault === 'fire').map((h) => h.id);
    expect(new Set(ids(container))).toEqual(new Set(expected));
    expect(expected.length).toBeGreaterThan(3);
  });

  /**
   * ×1.50 before ×1.25. A Bane is the difference between a champion who should
   * not be in this squad and one who would rather not be.
   */
  it('puts every Bane ahead of every Fault', async () => {
    const { container } = pick();
    await clickBane('fire');

    const shown = ids(container);
    const flags = shown.map((id) => HEROES.find((h) => h.id === id)!.bane === 'fire');
    const banes = flags.filter(Boolean).length;

    expect(flags.lastIndexOf(true)).toBe(banes - 1);
    expect(banes).toBeGreaterThan(0);
    expect(flags.length).toBeGreaterThan(banes);
  });

  /**
   * **The two rows narrow together.** They are different questions about the
   * same champion — what she deals, what she bleeds to — so a player using both
   * is asking for the intersection, not the union.
   */
  it('intersects with the Force row rather than widening it', async () => {
    const { container } = pick();
    await userEvent.click(screen.getByRole('button', { name: /^fire$/i }));
    await clickBane('air');

    const shown = ids(container);
    for (const id of shown) {
      const hero = HEROES.find((h) => h.id === id)!;
      expect(hero.strengths, `${hero.name} deals no fire`).toContain('fire');
      expect([hero.bane, hero.fault], `${hero.name} does not bleed to air`).toContain('air');
    }

    const expected = HEROES.filter(
      (h) => h.strengths.includes('fire') && (h.bane === 'air' || h.fault === 'air'),
    );
    expect(shown.length).toBe(expected.length);
  });

  it('is a toggle, and clearing it restores all 27', async () => {
    const { container } = pick();
    await clickBane('fire');
    expect(ids(container).length).toBeLessThan(27);
    await clickBane('fire');
    expect(ids(container).length).toBe(27);
  });
});

describe('the board seats carry the same marks as the picker', () => {
  it('draws a mark cluster on a seated champion', () => {
    /* The visible zone is seeded from the fixture, so this renders the board in
       the state a player actually opens it in rather than an empty one. */
    const { result } = renderHook(() => useAllocation(roster(), 'visible'));

    const { container } = render(
      <SquadBuilder
        allocation={result.current}
        heroName={(id) => HEROES.find((h) => h.id === id)?.name ?? id}
        kind="defense"
        selectedHeroId={null}
        onSeatActivate={() => {}}
        heroById={(id) => HEROES.find((h) => h.id === id)}
      />,
    );

    expect(container.querySelector(`[data-hero-marks="${IDS[0]!}"]`)).toBeTruthy();
  });
});
