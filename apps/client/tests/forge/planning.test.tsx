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
