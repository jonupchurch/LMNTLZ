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
    expect(labels.filter((l) => l === 'In squad I').length).toBe(6);
    expect(labels.filter((l) => l === 'In squad II').length).toBe(6);
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
