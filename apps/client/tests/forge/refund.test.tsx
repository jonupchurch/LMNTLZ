/**
 * Melting a champion's runes down, from the screen (2026-08-01).
 *
 * ### The assertion that matters is that the client does no arithmetic
 *
 * `invested`, `refund` and `rate` are the ladder's arithmetic and they live on
 * the server. A client that computed `floor(invested × rate)` for the dialog
 * would be a second implementation, and the two would disagree **quietly** the
 * first time the rate moved: the player is shown one number and paid another,
 * nothing throws, no test fails.
 *
 * So the central test feeds a quote whose `refund` **does not** equal
 * `invested × rate` and requires the screen to print the server's number. That
 * is the one assertion a screen doing its own sums cannot satisfy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { ForgeScreen } from '../../src/features/forge/ForgeScreen.js';
import {
  BARE_RUNES,
  FULL_RUNE_COST,
  QUOTE,
  RUNES_WITH,
  SHARDS,
  requested,
  stubForge,
} from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const HERO = getAllHeroes()[0]!;

/** One complete rune, which is what makes the control appear at all. */
const runed = () => RUNES_WITH(HERO.id, 4, { might: 20, speed: 10, luck: 5 }, 'steady-hand');

const open = async (
  runes: unknown = runed(),
  quote: unknown = QUOTE(HERO.id, [{ slot: 'primary', stage: 4, value: FULL_RUNE_COST }], 520),
) => {
  const user = userEvent.setup();
  stubForge({
    '/me/runes': runes,
    '/me/shards': SHARDS,
    /* Matched by substring, and `/me/runes` is checked first, so this only
       catches the per-hero collection read. */
    [`/heroes/${HERO.id}/runes`]: quote,
  });

  render(<ForgeScreen onUnauthenticated={() => {}} />);
  await screen.findByRole('radio', { name: /all 27/i });
  await user.click(screen.getByRole('button', { name: new RegExp(HERO.name, 'i') }));
  return user;
};

describe('the control', () => {
  it('is offered on a champion that has runes', async () => {
    await open();
    expect(screen.getByRole('button', { name: /melt all runes/i })).toBeTruthy();
  });

  /** A disabled button on a bare champion invites a click that can only be refused. */
  it('is absent on a champion with nothing placed', async () => {
    await open(BARE_RUNES());
    expect(screen.queryByRole('button', { name: /melt all runes/i })).toBeNull();
  });

  it('says what the rate is, from the served config', async () => {
    await open();
    const rate = `${Math.round(SHARDS.config.refundRate * 100)}%`;
    expect(document.body.textContent).toContain(rate);
  });
});

describe('the confirmation', () => {
  it('opening it reads the quote and writes nothing', async () => {
    const user = await open();
    const before = requested().length;

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    const after = requested().slice(before);
    expect(after.every((c) => c.startsWith('GET')), `a melt dialog wrote: ${after.join(', ')}`).toBe(
      true,
    );
  });

  /**
   * **The one a screen doing its own arithmetic cannot pass.** `invested` is 650
   * and the rate 0.8, so a client computing the refund would print 520. The
   * server says 999. The screen must say 999.
   */
  it('prints the server’s refund, never one it computed', async () => {
    const user = await open(
      runed(),
      QUOTE(HERO.id, [{ slot: 'primary', stage: 4, value: FULL_RUNE_COST }], 999),
    );

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('999');
    expect(dialog.textContent, 'the screen recomputed the refund').not.toContain('520');
  });

  it('names every rune it is about to destroy', async () => {
    const user = await open(
      runed(),
      QUOTE(
        HERO.id,
        [
          { slot: 'primary', stage: 4, value: 650, utility: 'steady-hand' },
          { slot: 'common', stage: 1, value: 150 },
        ],
        640,
      ),
    );

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    expect(document.querySelector('[data-refund-slot="primary"]')?.textContent).toContain(
      'steady-hand',
    );
    expect(document.querySelector('[data-refund-slot="common"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-refund-slot]')).toHaveLength(2);
  });

  it('shows what is lost as well as what is returned', async () => {
    const user = await open(
      runed(),
      QUOTE(HERO.id, [{ slot: 'primary', stage: 4, value: 650 }], 520),
    );

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('650');
    expect(dialog.textContent).toContain('520');
    expect(dialog.textContent, 'the 20% given up is not stated').toContain('130');
  });

  it('focus lands on keeping them', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /keep the runes/i }),
    );
  });

  it('cancelling sends nothing', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    const before = requested().length;
    await user.click(screen.getByRole('button', { name: /keep the runes/i }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(requested()).toHaveLength(before);
  });

  it('Escape closes it without sending', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    const before = requested().length;
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(requested()).toHaveLength(before);
  });
});

describe('confirming', () => {
  it('DELETEs the collection with confirmed=true, and refetches', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /melt all runes/i }));

    const before = requested().length;
    await user.click(screen.getByRole('button', { name: /melt for/i }));

    await vi.waitFor(() => {
      const sent = requested().slice(before);
      const del = sent.filter((c) => c.startsWith('DELETE'));
      expect(del, 'no DELETE was sent').toHaveLength(1);
      expect(del[0]).toContain(`/heroes/${HERO.id}/runes`);
      expect(del[0], 'the melt was not confirmed').toContain('confirmed=true');
      /* Refetch, never patch — the balance, the runes and gear score all moved. */
      expect(sent.some((c) => c.includes('/me/runes'))).toBe(true);
      expect(sent.some((c) => c.includes('/me/shards'))).toBe(true);
    });
  });
});

/**
 * **The one-rune wording, which is the common early case.**
 *
 * The plural sentence renders as *"All 1 of Bramwen's runes are destroyed …
 * there is no way to melt only one"* — ungrammatical, and the caveat describes a
 * choice the player does not have. Found by looking at the dialog rather than by
 * a test, so here is the test.
 */
describe('the wording', () => {
  it('does not say “All 1 of” when a champion has one rune', async () => {
    const user = await open(
      runed(),
      QUOTE(HERO.id, [{ slot: 'primary', stage: 4, value: 650 }], 520),
    );

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));
    const dialog = screen.getByRole('alertdialog');

    expect(dialog.textContent).not.toMatch(/All 1 of/i);
    expect(dialog.textContent, 'it offers a choice that does not exist').not.toMatch(
      /no way to melt only one/i,
    );
    expect(dialog.textContent).toMatch(/only rune/i);
  });

  it('does count them when there is more than one', async () => {
    const user = await open(
      runed(),
      QUOTE(
        HERO.id,
        [
          { slot: 'primary', stage: 4, value: 650 },
          { slot: 'common', stage: 2, value: 300 },
        ],
        760,
      ),
    );

    await user.click(screen.getByRole('button', { name: /melt all runes/i }));
    const dialog = screen.getByRole('alertdialog');

    expect(dialog.textContent).toMatch(/All 2 of/i);
    expect(dialog.textContent).toMatch(/no way to melt only one/i);
  });
});
