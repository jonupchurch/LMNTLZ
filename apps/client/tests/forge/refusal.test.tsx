/**
 * **Both refusals happen before any charge, and each names why** (018 T010 ·
 * FR-004).
 *
 * ### TL;DR
 *
 * Two things stop a rune stage: the stat is already at 75, or you cannot afford
 * it. Neither should cost the player a round trip to discover, and neither
 * should say only "no".
 *
 * ### Why "before" is the load-bearing word
 *
 * The server refuses both — `422 cap-exceeded` and `402 insufficient_shards` —
 * and that is the rule (Constitution XII). This file is about the *courtesy in
 * front of it*, and the courtesy is not decoration: the alternative is a player
 * clicking Commit, waiting, and being told that 45 + 20 + 20 is more than 75,
 * which is arithmetic the screen was already holding every number for.
 *
 * ### And each refusal names its own number
 *
 * *"Over the cap"* makes the player do the subtraction. *"5 would be wasted"*
 * and *"140 short"* do it for them. Both are asserted, because a refusal that
 * does not say by how much is the one people file bugs about.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STAT_CAP, getAllHeroes } from '@lmntlz/content';
import { ForgeScreen } from '../../src/features/forge/ForgeScreen.js';
import { BARE_RUNES, BROKE, RUNES_WITH, SHARDS, STAGE_BOOSTS, requested, stubForge } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const forge = () => render(<ForgeScreen onUnauthenticated={() => {}} />);

const HERO = getAllHeroes()[0]!;

/**
 * **No hero in the current roster is natively within a boost of the cap**, and
 * that is worth writing down rather than working around silently.
 *
 * The first version of this file looked for one — `STAT_CAP - stats.might <
 * 20` — and its own vacuity guard failed: the highest stat anywhere on the
 * roster is **45**, so every stat has at least 30 points of headroom before a
 * single rune is placed. That is not a bug, it is `CLAUDE.md`'s *"the values
 * are still a Role-shaped template"* showing up in a test, and it will change
 * when the hero-numbers pass lands.
 *
 * So the near-cap state is built with a **placed rune**, which is the path the
 * cap check actually runs on anyway: the sum that matters is `base + placed +
 * next boost`, and a hero who was born near the cap would only ever exercise
 * two thirds of it.
 */
const leaving = (room: number): Record<string, number> => ({
  might: STAT_CAP - HERO.stats.might - room,
});

describe('the 75 cap refuses before anything is charged', () => {
  it('the fixture actually leaves less room than the next boost', () => {
    /* Without this the "wasted" assertion below could pass on a state with
       plenty of headroom and a coincidental string. */
    const room = 5;
    expect(room).toBeLessThan(STAGE_BOOSTS[1]!);
    expect(leaving(room).might).toBeGreaterThan(0);
  });

  it('names the waste rather than only saying no', async () => {
    const user = userEvent.setup();
    const room = 5;

    /* Stage 1 placed, so the next boost is stage 2's +10 into 5 points of room. */
    stubForge({
      '/me/runes': RUNES_WITH(HERO.id, 1, leaving(room)),
      '/me/shards': SHARDS,
    });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(HERO.name, 'i') }));

    const might = screen.getByRole('button', { name: /^might/i });
    const wasted = STAGE_BOOSTS[1]! - room;

    expect(
      might.textContent,
      'the cap refusal does not say how much of the boost is lost',
    ).toContain(`${wasted} would be wasted`);
  });

  it('marks a stat with no room at all as blocked', async () => {
    const user = userEvent.setup();
    const hero = getAllHeroes()[0]!;

    /* The stat taken exactly to the cap by an existing rune. */
    const filled = STAT_CAP - hero.stats.might;
    stubForge({
      '/me/runes': RUNES_WITH(hero.id, 1, { might: filled }),
      '/me/shards': SHARDS,
    });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(hero.name, 'i') }));

    const might = screen.getByRole('button', { name: /^might/i });
    expect(might).toHaveAttribute('data-blocked', 'true');
    expect(might.textContent).toContain('at the cap');
  });

  it('sends nothing while the refusal is on screen', async () => {
    const user = userEvent.setup();
    const hero = getAllHeroes()[0]!;
    const filled = STAT_CAP - hero.stats.might;
    stubForge({
      '/me/runes': RUNES_WITH(hero.id, 1, { might: filled }),
      '/me/shards': SHARDS,
    });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(hero.name, 'i') }));

    const before = requested().length;
    await user.click(screen.getByRole('button', { name: /^might/i }));

    expect(requested(), 'a capped stat reached the network').toHaveLength(before);
  });
});

describe('the balance refuses before anything is charged', () => {
  it('says how short the player is, next to the price', async () => {
    stubForge({ '/me/runes': BARE_RUNES(), '/me/shards': BROKE });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    const ladder = screen.getByRole('region', { name: 'Stage ladder' });
    const short = SHARDS.config.stageCosts[0]! - BROKE.balance;

    expect(ladder.textContent).toContain(`◈ ${SHARDS.config.stageCosts[0]}`);
    expect(ladder.textContent, 'the shortfall is not stated').toContain(`${short} short`);
  });

  it('disables the commit rather than letting it fail at the server', async () => {
    stubForge({ '/me/runes': BARE_RUNES(), '/me/shards': BROKE });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    expect(screen.getByRole('button', { name: /commit stage 1/i })).toBeDisabled();
  });

  it('a clicked commit with no stat chosen asks for one instead of guessing', async () => {
    const user = userEvent.setup();
    stubForge({ '/me/runes': BARE_RUNES(), '/me/shards': SHARDS });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });

    const before = requested().length;
    await user.click(screen.getByRole('button', { name: /commit stage 1/i }));

    /**
     * **Never a default stat.** Picking one for the player would spend 150
     * shards on a permanent choice they did not make, and a rune is destroyed
     * when it is replaced.
     */
    expect(requested()).toHaveLength(before);
    expect(screen.getByRole('alert').textContent).toMatch(/choose which stat/i);
  });
});

describe('the balance is re-derived after a commit, never patched', () => {
  it('refetches both reads rather than trusting the response', async () => {
    const user = userEvent.setup();
    const hero = getAllHeroes()[0]!;
    stubForge({
      '/me/runes': BARE_RUNES(),
      '/me/shards': SHARDS,
      '/heroes/': { ok: true },
    });

    forge();
    await screen.findByRole('radio', { name: /all 27/i });
    await user.click(screen.getByRole('button', { name: new RegExp(hero.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /^might/i }));
    await user.click(screen.getByRole('button', { name: /commit stage 1/i }));

    /**
     * Two of each: the initial load and the reload. The balance is a ledger
     * *sum* and gear score is recomputed server-side from every placed rune, so
     * a screen applying a delta it computed itself is right until two things
     * change at once and then shows a number that exists nowhere.
     */
    await vi.waitFor(() => {
      expect(requested().filter((u) => u.includes('/me/shards'))).toHaveLength(2);
      expect(requested().filter((u) => u.includes('/me/runes'))).toHaveLength(2);
    });
  });
});
