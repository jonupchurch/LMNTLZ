/**
 * The running account of the battle (Jon, 2026-08-01).
 *
 * > *"make the area in the rectangle a place to display the results of each attack, one
 * > by one."*
 *
 * ### What is worth testing here, and what jsdom cannot see
 *
 * The strip's two hard requirements are **a reserved height** and **never clearing**,
 * and only one of them is observable here. jsdom performs no layout, so "the panel does
 * not resize the board" cannot be asserted — it is enforced by the fixed
 * `h-(--lz-log-h)` on the scroller, and this file checks that the class is actually on
 * the element rather than that the pixels came out right. **Tailwind v4 syntax** — this
 * repo is on v4, where `h-(--x)` is the canonical form and the v3 `h-[var(--x)]` spelling
 * is what a scan written for the wrong major version would go looking for.
 *
 * The ordering and the never-clearing behaviour *are* observable, and they are the two
 * that a future edit is most likely to break.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BattleLog } from '../../src/features/battle/BattleLog.js';
import type { TurnEvent } from '../../src/features/battle/types.js';

const hit = (actor: string, target: string, damage: number): TurnEvent => ({
  actorInstanceId: actor,
  powerId: 'strike',
  targetInstanceId: target,
  source: 'player',
  outcome: {
    hit: true,
    crit: false,
    damage,
    healing: 0,
    overheal: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
  },
});

/** Stands in for `describeEvent` bound to a roster — the prose is tested separately. */
const describeStub = (event: TurnEvent): string =>
  `${event.actorInstanceId} attacks ${event.targetInstanceId}. Hits for ${event.outcome.damage} damage.`;

describe('the battle log', () => {
  it('renders one line per event, oldest first', () => {
    render(
      <BattleLog
        events={[hit('Corvane', 'Marisel', 250), hit('Marisel', 'Corvane', 90)]}
        describe={describeStub}
      />,
    );

    const items = within(screen.getByTestId('battle-log')).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Corvane attacks Marisel. Hits for 250 damage.');
    expect(items[1]).toHaveTextContent('Marisel attacks Corvane. Hits for 90 damage.');
  });

  /**
   * **Newest last is the whole reading direction.** A combat log read upward would put
   * the line the player is waiting for above three they have already read.
   */
  it('appends rather than prepends, so the newest line is at the bottom', () => {
    const { rerender } = render(<BattleLog events={[hit('a', 'b', 1)]} describe={describeStub} />);

    rerender(<BattleLog events={[hit('a', 'b', 1), hit('c', 'd', 2)]} describe={describeStub} />);

    const items = within(screen.getByTestId('battle-log')).getAllByRole('listitem');
    expect(items.at(-1)).toHaveTextContent('Hits for 2 damage');
  });

  /**
   * ⚠️ **The height is reserved, not fitted.** A panel that sizes to its content pushes
   * everything below it down on every turn — the board flinching once per blow. jsdom
   * cannot measure it, so the class that enforces it is what gets asserted.
   */
  it('holds a fixed height so the board below it never moves', () => {
    const { container } = render(
      <BattleLog events={[hit('a', 'b', 1)]} describe={describeStub} />,
    );

    const scroller = container.querySelector('ol');
    expect(scroller?.className, 'the log grows with its content').toContain('h-(--lz-log-h)');
    expect(scroller?.className, 'a fixed height with no scroll hides the oldest lines').toContain(
      'overflow-y-auto',
    );
  });

  it('reserves the same height before the first blow lands', () => {
    /* Otherwise the strip is short at the start of the battle and jumps to full height
       on the first event — the same flinch, just once instead of every turn. */
    const { container } = render(<BattleLog events={[]} describe={describeStub} />);

    expect(container.querySelector('p')?.className).toContain('h-(--lz-log-h)');
    expect(screen.getByTestId('battle-log')).toHaveTextContent('The first blow has not landed yet.');
  });

  it('announces new lines without stealing focus', () => {
    render(<BattleLog events={[hit('a', 'b', 1)]} describe={describeStub} />);

    expect(
      within(screen.getByTestId('battle-log')).getByRole('list'),
    ).toHaveAttribute('aria-live', 'polite');
  });
});
