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
