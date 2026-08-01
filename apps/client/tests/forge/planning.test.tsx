/**
 * **Planning is free** (018 T009 · FR-002).
 *
 * ### TL;DR
 *
 * You can move rune points around as much as you like without being charged or
 * committed to anything. This file proves it by planning, leaving, and checking
 * that nothing was sent anywhere.
 *
 * ### Why it needs a test at all
 *
 * Because the feature is an **absence**, and absences rot quietly. Nothing
 * breaks if somebody adds a `PATCH /me/runes/draft` to remember a plan between
 * sessions — it would look like a kindness, every existing test would still
 * pass, and the design would be gone.
 *
 * `06-progression.md` makes deliberation *correct play* precisely because a rune
 * is destroyed when it is replaced. The free half is what makes the permanent
 * half fair: a player who cannot experiment before committing is being asked to
 * gamble 650 shards on arithmetic they were not shown.
 *
 * So the assertion is on the **fetch stub**, not on any rendered state. Only the
 * two loads are allowed; a third call of any shape is the failure, whatever it
 * is called and whatever it does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { ForgeScreen } from '../../src/features/forge/ForgeScreen.js';
import { BARE_RUNES, SHARDS, stubForge, requested } from './fixtures.js';

beforeEach(() => stubForge({ '/me/runes': BARE_RUNES(), '/me/shards': SHARDS }));
afterEach(() => vi.unstubAllGlobals());

const forge = () => render(<ForgeScreen onUnauthenticated={() => {}} />);

describe('planning charges nothing and stores nothing', () => {
  it('loads exactly the two reads, and nothing else', async () => {
    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    expect(requested().filter((u) => u.includes('/me/runes'))).toHaveLength(1);
    expect(requested().filter((u) => u.includes('/me/shards'))).toHaveLength(1);
    expect(requested()).toHaveLength(2);
  });

  it('choosing a stat sends nothing', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    const before = requested().length;
    await user.click(screen.getByRole('button', { name: /^might/i }));

    expect(
      requested(),
      'choosing which stat to raise sent a request — planning must be free',
    ).toHaveLength(before);
  });

  it('changing slot, hero and stat repeatedly still sends nothing', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    const before = requested().length;
    const second = getAllHeroes()[1]!;

    await user.click(screen.getByRole('button', { name: /^might/i }));
    await user.click(screen.getByRole('button', { name: /^secondary slot/i }));
    await user.click(screen.getByRole('button', { name: /^speed/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(second.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /^common slot/i }));
    await user.click(screen.getByRole('button', { name: /^luck/i }));

    expect(requested()).toHaveLength(before);
  });

  it('unmounting mid-plan sends nothing on the way out', async () => {
    const user = userEvent.setup();
    const { unmount } = forge();
    await screen.findByRole('radio', { name: /all 27/i });

    await user.click(screen.getByRole('button', { name: /^might/i }));
    const before = requested().length;

    /* The "save the draft on unmount" reflex, which would be the same defect
       arriving through a cleanup function instead of a button. */
    unmount();
    await waitFor(() => expect(requested()).toHaveLength(before));
  });

  it('a draft does not survive changing hero — it was never stored', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    await user.click(screen.getByRole('button', { name: /^might/i }));
    expect(screen.getByRole('button', { name: /^might/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const second = getAllHeroes()[1]!;
    await user.click(screen.getByRole('button', { name: new RegExp(second.name, 'i') }));

    /**
     * **Cleared rather than carried.** A draft that followed the player to
     * another champion would be a plan they did not make, one click from being
     * committed.
     */
    expect(screen.getByRole('button', { name: /^might/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

/**
 * **Absence is drawn as absence** (019).
 *
 * The export's rule for every line on this screen is `style: placed ? "solid" :
 * "dashed"`, and until 019 the client drew all of them solid. A slot holding
 * nothing had the same border as one holding four stages and a utility effect,
 * so the only thing separating them was the word `empty` in a corner — three
 * slots per champion, twenty-seven champions, and the shape said nothing.
 *
 * These assert the *class*, which is what jsdom can hold an opinion about. That
 * the dash is then visible at the rendered size is a browser question, and the
 * treatment is shared with `lz-empty` precisely so it is answered once.
 */
describe('an empty slot looks empty', () => {
  it('draws every unfilled slot dashed, and a selected one not', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(getAllHeroes()[0]!.name, 'i') }));

    /* `BARE_RUNES` is every slot at stage 0 — so every tile that is not the
       selected one must carry the empty treatment. Derived from the rendered
       stage, never from a list of slot names. */
    const tiles = [...document.querySelectorAll('[data-slot]')];
    expect(tiles.length, 'no slot tiles rendered').toBeGreaterThan(0);

    for (const tile of tiles) {
      const empty = tile.getAttribute('data-stage') === '0';
      const selected = tile.getAttribute('aria-pressed') === 'true';
      if (empty && !selected) {
        expect(
          tile.className,
          `${tile.getAttribute('data-slot')} is empty but drawn as though it holds something`,
        ).toContain('lz-empty');
      }
    }
  });

  /**
   * The companion that stops the above passing on a screen that dashes
   * everything: a slot the player has selected is a slot they are working on,
   * and it gets the gold treatment instead.
   */
  it('does not dash the slot being worked on', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(getAllHeroes()[0]!.name, 'i') }));

    const selected = [...document.querySelectorAll('[data-slot]')].find(
      (t) => t.getAttribute('aria-pressed') === 'true',
    );
    expect(selected, 'nothing is selected, so the contrast is untested').toBeTruthy();
    expect(selected?.className).not.toContain('lz-empty');
    expect(selected?.className).toContain('border-gold');
  });

  /**
   * The stage ladder, same rule. A stage not yet reached is a place a stage
   * will go; `done` and `next` are things that exist.
   */
  it('dashes the stages not yet reached, and only those', async () => {
    const user = userEvent.setup();
    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(getAllHeroes()[0]!.name, 'i') }));

    const rungs = [...document.querySelectorAll('[data-stage][data-state]')];
    expect(rungs.length, 'the stage ladder did not render').toBeGreaterThan(0);

    for (const rung of rungs) {
      const state = rung.getAttribute('data-state');
      const dashed = rung.className.includes('lz-empty');
      expect(dashed, `stage ${rung.getAttribute('data-stage')} (${state}) is dashed: ${dashed}`).toBe(
        state === 'later',
      );
    }
  });
});
