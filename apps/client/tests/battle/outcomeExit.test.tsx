/**
 * **A finished battle has a way out of it.**
 *
 * Reported from real play: the fight ends, the result appears, and there is
 * nothing to click. The shell hides the tab bar for the whole of
 * `kind === 'battle'` — correctly, because the one-at-a-time rule means every
 * other screen would refuse the player anyway — and it never gave the bar back
 * when the battle *ended*. The only exit was reloading the browser.
 *
 * The code even said so. `onConcluded` was deliberately empty, reasoning that
 * *"the next load lands them on the squad screen on its own"*, which is true and
 * is not a way out of the screen you are looking at. **A fallback that requires a
 * page load is not navigation.**
 *
 * ### Why this is a test and not a fixed line of JSX
 *
 * The gap was invisible to every existing test because they all assert what the
 * screen *shows*, and the screen showed the right thing. Nothing asserted that a
 * player could *leave*. That is the same shape as every wiring defect in this
 * project: the thing was built, and nothing called it.
 *
 * So the assertions here are about reachability — a control exists, it is
 * clickable, and it calls back exactly once — and one of them is deliberately
 * negative: **the exit must not fire on its own**, or it would animate away from
 * the outcome the player just fought for.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Conclusion } from '@lmntlz/sim/rules';
import { BattleScreen } from '../../src/features/battle/BattleScreen.js';
import { board, started } from './fixtures.js';

const WON: Conclusion = { winner: 'attacker', reason: 'wipe' };
const LOST: Conclusion = { winner: 'defender', reason: 'wipe' };

/** A battle that is already over, as the shell hands it to the screen. */
const finished = (conclusion: Conclusion) =>
  started({ packet: { events: [], state: board(null), conclusion } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the result screen', () => {
  it('offers a way out after a win', async () => {
    const onLeave = vi.fn();
    render(<BattleScreen started={finished(WON)} onLeave={onLeave} />);

    expect(screen.getByRole('heading', { name: /victory/i })).toBeInTheDocument();

    const exit = screen.getByRole('button', { name: /choose another target/i });
    await userEvent.click(exit);

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('offers the same way out after a loss — losing is the common case', async () => {
    const onLeave = vi.fn();
    render(<BattleScreen started={finished(LOST)} onLeave={onLeave} />);

    expect(screen.getByRole('heading', { name: /defeat/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /choose another target/i }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  /**
   * **The outcome is what the player came for.** Navigating automatically would
   * replace it the instant it appeared — which is why `onConcluded` stayed empty
   * and why the fix is a control rather than a redirect.
   */
  it('does not leave on its own', () => {
    const onLeave = vi.fn();
    render(<BattleScreen started={finished(WON)} onLeave={onLeave} />);

    expect(onLeave).not.toHaveBeenCalled();
  });

  /**
   * Mid-battle the tab bar is hidden on purpose, so an exit here would be a way
   * to abandon a fight by accident — and abandonment is a counted, penalised act
   * in feature 007, not a stray click.
   */
  it('shows no exit while the battle is still running', () => {
    render(<BattleScreen started={started()} onLeave={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /choose another target/i })).toBeNull();
  });
});
