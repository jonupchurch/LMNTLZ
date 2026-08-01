/**
 * **The destroy warning comes first, says what is lost, and is not the default
 * action** (018 T011 · FR-003).
 *
 * ### TL;DR
 *
 * Replacing a finished rune destroys it and refunds nothing. The confirmation
 * has to appear before anything happens, say so in words, and not be the button
 * a stray keypress lands on.
 *
 * ### The three claims are separate, and only the third is usually forgotten
 *
 * A dialog that appears and explains itself is the easy part. The one that gets
 * lost in a refactor is **which control has focus** — and it is the one that
 * matters most here, because the sequence that destroys a rune is: press Enter
 * to open the dialog, dialog opens with the destructive button focused, the
 * keyup lands on it. A full rune is 650 shards, roughly 1.7 days of typical
 * income, and there is no undo anywhere in this system.
 *
 * `409 needs_confirmation` on the server is the same rule where it cannot be
 * skipped; none of that helps if the client sends `confirmed: true` because the
 * player never saw a choice.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { DestroyConfirm } from '../../src/features/forge/DestroyConfirm.js';
import { ForgeScreen } from '../../src/features/forge/ForgeScreen.js';
import { FULL_RUNE_COST, RUNES_WITH, SHARDS, requested, stubForge } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const HERO = getAllHeroes()[0]!;

/** A complete rune, which is the only state a rebuild is offered from. */
const complete = () =>
  RUNES_WITH(HERO.id, 4, { might: 20, speed: 10, luck: 5 }, 'steady-hand');

const openForge = async () => {
  const user = userEvent.setup();
  stubForge({ '/me/runes': complete(), '/me/shards': SHARDS, '/heroes/': { ok: true } });

  render(<ForgeScreen onUnauthenticated={() => {}} />);
  await screen.findByRole('radio', { name: /all 27/i });
  await user.click(screen.getByRole('button', { name: new RegExp(HERO.name, 'i') }));
  return user;
};

describe('the warning appears before anything is committed', () => {
  it('is not shown until the player asks to rebuild', async () => {
    await openForge();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opening it sends nothing', async () => {
    const user = await openForge();
    const before = requested().length;

    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(requested(), 'opening the confirmation reached the network').toHaveLength(before);
  });
});

describe('it names the consequence', () => {
  it('says the rune is destroyed, in those words', async () => {
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/destroys it/i);
    expect(dialog.textContent).toMatch(/not refunded/i);
  });

  it('says the rebuild starts again at stage one, and what that costs', async () => {
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    const dialog = screen.getByRole('alertdialog');
    /* The part players get wrong: a rebuild is a new rune, not a re-allocation
       of the one that is there. */
    expect(dialog.textContent).toMatch(/starts again at stage one/i);
    /**
     * **From `config.fullRuneCost`, never typed.** The fixture serves the real
     * 650, and the same rule took four hardcoded 650s out of the guild screens
     * in 017 T057.
     */
    expect(dialog.textContent).toContain(String(FULL_RUNE_COST));
  });
});

describe('it is not the default action', () => {
  it('focus lands on keeping the rune', async () => {
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    /**
     * The sequence this prevents: Enter opens the dialog, the dialog mounts
     * with the destructive control focused, and the keyup destroys 650 shards
     * of rune. Asserted on `document.activeElement` rather than on DOM order,
     * because order alone does not decide focus.
     */
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /keep the rune/i }),
    );
  });

  it('pressing Enter immediately keeps the rune', async () => {
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    const before = requested().length;
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('alertdialog'), 'the dialog is still open').toBeNull();
    expect(requested(), 'Enter destroyed the rune').toHaveLength(before);
  });

  it('Escape closes it without committing', async () => {
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));

    const before = requested().length;
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(requested()).toHaveLength(before);
  });

  it('and the destructive control does work when it is actually chosen', async () => {
    /**
     * The companion that must pass. Without it every assertion above would be
     * satisfied by a dialog whose confirm button does nothing at all, which is
     * a different bug wearing the same green tick.
     */
    const user = await openForge();
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));
    await user.click(screen.getByRole('button', { name: /destroy and rebuild/i }));

    await vi.waitFor(() => {
      const posts = requested().filter((r) => r.startsWith('POST'));
      expect(posts).toHaveLength(1);
      expect(posts[0]).toContain(`/heroes/${HERO.id}/runes/primary`);
    });
  });
});

/**
 * **It shows what is going, rather than what it cost** (019).
 *
 * The dialog used to say *"◈ 450 has gone into it"* and stop there. That is the
 * wrong unit for the decision: nobody is attached to 450 shards, they are
 * attached to `+20 Might`, and a player who cannot see the allocation cannot
 * tell whether this is the rune they meant to rebuild. It is the one
 * irreversible spend in the game and there is no undo anywhere in the system.
 *
 * Nothing below is written down — every expectation is built from the same
 * fixture the screen is served, so a manifest showing a *different* rune's
 * contents fails just as loudly as one showing none.
 */
describe('it shows what is destroyed with it', () => {
  const ALLOCATED = { might: 20, speed: 10, luck: 5 } as const;
  const UTILITY = 'steady-hand';

  const openConfirm = async () => {
    const user = userEvent.setup();
    stubForge({
      '/me/runes': RUNES_WITH(HERO.id, 4, { ...ALLOCATED }, UTILITY),
      '/me/shards': SHARDS,
      '/heroes/': { ok: true },
    });
    render(<ForgeScreen onUnauthenticated={() => {}} />);
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(HERO.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /rebuild this rune/i }));
    return user;
  };

  it('lists every stat on the rune, with the amount it grants', async () => {
    await openConfirm();

    for (const [stat, amount] of Object.entries(ALLOCATED)) {
      const line = document.querySelector(`[data-forfeit="${stat}"]`);
      expect(line, `${stat} is not named among the losses`).not.toBeNull();
      expect(line?.textContent).toContain(`+${amount}`);
      expect(line?.textContent?.toLowerCase()).toContain(stat);
    }
  });

  it('names the utility effect, which is the part that is not a number', async () => {
    await openConfirm();

    const line = document.querySelector('[data-forfeit="utility"]');
    expect(line, 'the utility effect is destroyed silently').not.toBeNull();
    expect(line?.textContent).toContain(UTILITY);
  });

  /**
   * One line per thing, and no extras. A manifest that quietly dropped a line
   * would still satisfy every `toContain` above.
   */
  it('lists exactly what is on the rune and nothing else', async () => {
    await openConfirm();

    const lines = [...document.querySelectorAll('[data-forfeit]')];
    expect(lines).toHaveLength(Object.keys(ALLOCATED).length + 1);
  });

  /**
   * **The treatment is the message.** The export draws these dashed in danger
   * because the dash is the same mark an empty slot carries — which is exactly
   * what each of these lines is about to become.
   */
  it('draws each loss in the forfeit treatment', async () => {
    await openConfirm();

    for (const line of document.querySelectorAll('[data-forfeit]')) {
      expect(line.className, `${line.getAttribute('data-forfeit')} is not drawn as a loss`).toContain(
        'lz-forfeit',
      );
    }
  });

  /**
   * The component's own contract, exercised directly: the screen only offers a
   * rebuild on a complete rune, so this input never arrives from `ForgeScreen`.
   * It is still the honest answer to "nothing is on it" — a heading over an
   * empty list would imply a loss that is not happening.
   */
  it('says nothing at all when there is nothing on the rune', () => {
    render(
      <DestroyConfirm
        heroName={HERO.name}
        slotLabel="Primary"
        currentStage={0}
        fullRuneCost={FULL_RUNE_COST}
        spent={0}
        allocations={{}}
        utility={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(document.querySelectorAll('[data-forfeit]')).toHaveLength(0);
    expect(screen.queryByText(/destroyed with it/i)).toBeNull();
  });
});
