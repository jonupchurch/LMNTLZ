/**
 * The status row (020 US4, T047).
 *
 * ### The trap here is the type, not the layout
 *
 * `StatusInstance.turnsRemaining` is typed `number`, and **on this side of the
 * wire it is not**. Two unrelated causes send `null`:
 *
 * - `PERMANENT` is `Infinity`, and `JSON.stringify(Infinity)` is `null` — so
 *   every `Wears Through` shred and every passive mark has arrived that way since
 *   US1, with nothing reading the field to notice;
 * - the server withholds an enemy's self-applied duration under the visibility
 *   rule (`disclose.ts`).
 *
 * A row written against the declared type renders a permanent shred as `0` and a
 * withheld one as `NaN`, both of which look like game rules rather than bugs. So
 * the cases below assert the *absence* of a numeral, not merely a different one.
 *
 * ### And the second trap is over-collapsing
 *
 * Grouping is on the **icon**, so `+Might` and `+Agility` must stay two pips
 * while four burns become one with a count. A test that only checked "three burns
 * make one pip" would pass against an implementation that collapsed the whole row
 * into a single icon.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PERMANENT } from '@lmntlz/sim/rules';
import { StatusRow } from '../../src/features/battle/StatusRow.js';
import { RUNE_EFFECTS, runeSource } from '@lmntlz/sim/rules';
import { durationOf, statusGroups, type WireStatus } from '../../src/features/battle/statusPips.js';

const status = (patch: Partial<WireStatus> & Pick<WireStatus, 'kind'>): WireStatus => ({
  stat: null,
  magnitude: 10,
  turnsRemaining: 3,
  sourceInstanceId: 'a',
  sourcePowerId: 'p',
  escalation: 0,
  ticksDealt: 0,
  cleansable: true,
  ...patch,
});

const pips = (): readonly HTMLElement[] =>
  Array.from(document.querySelectorAll('[data-status-pip]'));

const show = (statuses: readonly WireStatus[]): void => {
  render(<StatusRow statuses={statuses} scale="board" heroName="Bramwen" />);
};

describe('durationOf — three shapes, one answer', () => {
  it('reports a timed effect’s turns', () => {
    expect(durationOf(status({ kind: 'burn', turnsRemaining: 2 }))).toBe(2);
  });

  /** 🔴 The permanent case, which the declared type says cannot happen. */
  it('reports no numeral for a permanent effect', () => {
    expect(durationOf(status({ kind: 'shred', turnsRemaining: PERMANENT }))).toBeNull();
  });

  /** 🔴 The same effect after a JSON round trip — how it actually arrives. */
  it('reports no numeral once Infinity has been through JSON', () => {
    const wired = JSON.parse(
      JSON.stringify(status({ kind: 'shred', turnsRemaining: PERMANENT })),
    ) as WireStatus;

    expect(wired.turnsRemaining).toBeNull();
    expect(durationOf(wired)).toBeNull();
  });

  /** 🔴 And the withheld case, which is indistinguishable on purpose. */
  it('reports no numeral for a duration the server withheld', () => {
    expect(durationOf(status({ kind: 'buff', turnsRemaining: null }))).toBeNull();
  });
});

describe('grouping', () => {
  it('collapses same-icon effects into one pip with a count', () => {
    const groups = statusGroups([
      status({ kind: 'burn', sourceInstanceId: 'x' }),
      status({ kind: 'burn', sourceInstanceId: 'y' }),
      status({ kind: 'burn', sourceInstanceId: 'z' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.stacks).toBe(3);
  });

  /** 🔴 The control the collapsing test needs: different stats stay apart. */
  it('keeps two different stat changes as two pips', () => {
    const groups = statusGroups([
      status({ kind: 'buff', stat: 'might' }),
      status({ kind: 'buff', stat: 'agility' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.stacks === 1)).toBe(true);
  });

  it('takes the longest duration of the group', () => {
    const groups = statusGroups([
      status({ kind: 'burn', sourceInstanceId: 'x', turnsRemaining: 1 }),
      status({ kind: 'burn', sourceInstanceId: 'y', turnsRemaining: 4 }),
    ]);

    expect(groups[0]!.duration).toBe(4);
  });

  /**
   * 🔴 **One withheld member makes the whole group numberless.** Reporting the
   * largest *known* duration would promise the effect ends then, which is exactly
   * the fact the server declined to disclose.
   */
  it('shows no numeral when any member of the group is withheld', () => {
    const groups = statusGroups([
      status({ kind: 'burn', sourceInstanceId: 'x', turnsRemaining: 2 }),
      status({ kind: 'burn', sourceInstanceId: 'y', turnsRemaining: null }),
    ]);

    expect(groups[0]!.duration).toBeNull();
  });

  it('seals the pip when any member cannot be cleansed', () => {
    const groups = statusGroups([
      status({ kind: 'burn', sourceInstanceId: 'x' }),
      status({ kind: 'burn', sourceInstanceId: 'y', cleansable: false }),
    ]);

    expect(groups[0]!.sealed).toBe(true);
  });

  /**
   * ⚠️ **A mark is bookkeeping and draws nothing.** Four passives leave one on
   * every target they touch, so by mid-battle most champions carry several — a
   * row that showed them would bury the stun.
   */
  it('draws no pip for a mark', () => {
    expect(statusGroups([status({ kind: 'mark', magnitude: 3 })])).toEqual([]);
  });

  /**
   * 🔴 **A merged pip must not claim to be one of its members.**
   *
   * `burn`, `bleed` and `poison` all draw `status-dot` — `StatusInstance`
   * snapshots a magnitude and deliberately not a Force, so the pip cannot know
   * which it is. Naming the merged pip `burn` because a burn happened to arrive
   * first would be a plain untruth on a champion that is bleeding.
   */
  it('names a merged pip for the family rather than for whichever came first', () => {
    const [merged] = statusGroups([
      status({ kind: 'burn', sourceInstanceId: 'x' }),
      status({ kind: 'bleed', sourceInstanceId: 'y' }),
    ]);

    expect(merged!.stacks).toBe(2);
    expect(merged!.label).toBe('damage over time');
  });

  it('keeps its own name when nothing merged', () => {
    expect(statusGroups([status({ kind: 'burn' })])[0]!.label).toBe('burn');
  });

  /** Crowd control reads first; it is the fact that changes what you can do. */
  it('puts control ahead of damage over time, and both ahead of a stat change', () => {
    const groups = statusGroups([
      status({ kind: 'buff', stat: 'might' }),
      status({ kind: 'burn' }),
      status({ kind: 'stun' }),
    ]);

    expect(groups.map((g) => g.kind)).toEqual(['stun', 'burn', 'buff']);
  });
});

describe('the row', () => {
  it('draws a numeral for a disclosed duration', () => {
    show([status({ kind: 'burn', turnsRemaining: 2 })]);
    expect(pips()[0]).toHaveAttribute('data-duration', '2');
  });

  /** 🔴 The withheld case, asserted as *absence* rather than as another number. */
  it('draws no numeral at all for a withheld duration', () => {
    show([status({ kind: 'buff', stat: 'might', turnsRemaining: null })]);

    expect(pips()[0]).not.toHaveAttribute('data-duration');
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  /**
   * 🔴 **The height is reserved when the row is empty**, or every effect that
   * lands or expires moves the card under it — and effects land and expire
   * constantly.
   */
  it('occupies the same height with nothing on it', () => {
    const { container } = render(
      <StatusRow statuses={[]} scale="board" heroName="Bramwen" />,
    );
    const row = container.querySelector('[data-status-row]')!;

    expect(row.className).toContain('h-6');
    expect(pips()).toHaveLength(0);
  });

  /**
   * A board card is 135px and a pip is 24px, so a champion carrying more than
   * four effects spills. **Reported rather than dropped** — silently losing the
   * fifth is how a player misses the one that mattered.
   */
  it('spills past its limit rather than dropping effects silently', () => {
    show([
      status({ kind: 'stun' }),
      status({ kind: 'burn' }),
      status({ kind: 'shield' }),
      status({ kind: 'fade' }),
      status({ kind: 'buff', stat: 'might' }),
      status({ kind: 'debuff', stat: 'speed' }),
    ]);

    expect(pips()).toHaveLength(4);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('says how many effects there are, for a reader who cannot see pips', () => {
    show([status({ kind: 'burn' }), status({ kind: 'stun' })]);
    expect(screen.getByLabelText('Bramwen, 2 effects')).toBeInTheDocument();
  });

  it('says so plainly when there are none', () => {
    show([]);
    expect(screen.getByLabelText('Bramwen, no effects')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The rune behind a pip (021 US4, T058)
// ---------------------------------------------------------------------------

/**
 * 🔴 **A rune effect places an ordinary status, which is exactly the problem.**
 *
 * `Cornered`'s +20 Might draws the same pip as a +20 Might from any power's rider,
 * so a player looking straight at their 200-shard purchase working could not tell
 * it from something the enemy did to them. These assert the row can now say whose
 * it is — and, with a control, that it does not say so when no rune is involved.
 */
describe('a pip names the rune behind it', () => {
  /** The real id and the real display name, read from the catalog rather than typed. */
  const CORNERED = RUNE_EFFECTS['cornered']!;

  const fromRune = (id: string, patch: Partial<WireStatus> = {}): WireStatus =>
    status({ kind: 'buff', stat: 'might', sourcePowerId: runeSource(id), ...patch });

  it('🔴 names it, using the catalog’s own display name', () => {
    const groups = statusGroups([fromRune('cornered')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.runes).toEqual([CORNERED.name]);
  });

  /**
   * 🔴 **The control.** An identical effect from a power must name nothing — or
   * the row would label every buff in the game as a rune.
   */
  it('🔴 names nothing for an identical effect that came from a power', () => {
    const groups = statusGroups([status({ kind: 'buff', stat: 'might', sourcePowerId: 'Cornered' })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.runes, 'a power id that merely looks like one').toEqual([]);
  });

  /** A passive is the champion, not a purchase, so it is not named here either. */
  it('names nothing for a passive', () => {
    const groups = statusGroups([
      status({ kind: 'buff', stat: 'might', sourcePowerId: 'passive:Room to Swing' }),
    ]);

    expect(groups[0]!.runes).toEqual([]);
  });

  /**
   * Two runes under one icon are both named; the same rune twice is named once.
   *
   * **`Cornered` and `It Spreads` both grant `Might`**, which is what puts them on
   * one icon — pips group by icon, and a Might buff and a Penetration buff are two
   * different pips however they arrived. Picked from the catalog for that reason
   * rather than for convenience.
   */
  it('names each distinct rune once', () => {
    const groups = statusGroups([
      fromRune('cornered'),
      fromRune('cornered', { sourceInstanceId: 'b' }),
      fromRune('it-spreads'),
    ]);

    expect(groups, 'both grant Might, so one icon').toHaveLength(1);
    expect(groups[0]!.stacks).toBe(3);
    expect(groups[0]!.runes).toEqual([CORNERED.name, RUNE_EFFECTS['it-spreads']!.name]);
  });

  /**
   * 🔴 **It reaches the DOM**, which is the half a unit test on `statusGroups`
   * cannot see. `StatusPip` takes no arbitrary attributes, so a `data-rune` passed
   * by spread would have been dropped silently and every selector below would
   * match nothing — a green suite over an indicator that does not exist.
   */
  it('🔴 renders the rune name onto the pip', () => {
    show([fromRune('cornered')]);

    const rendered = pips();
    expect(rendered, 'count before indexing').toHaveLength(1);
    expect(rendered[0]!.getAttribute('data-rune')).toBe(CORNERED.name);
    expect(rendered[0]!.getAttribute('title')).toContain(CORNERED.name);
  });

  it('🔴 leaves the attribute off entirely when no rune is involved', () => {
    show([status({ kind: 'burn' })]);

    const rendered = pips();
    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.hasAttribute('data-rune')).toBe(false);
  });
});
