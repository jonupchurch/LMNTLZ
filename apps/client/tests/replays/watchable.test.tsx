/**
 * **Watchability is the server's word, never a date this client subtracts**
 * (018 T033 · FR-011).
 *
 * ### TL;DR
 *
 * The list shows a WATCH button only where the server said the replay can be
 * watched. It must never work that out from how old the battle is.
 *
 * ### The fixture is deliberately inverted, and that is the whole test
 *
 * The obvious fixture — recent battles watchable, old ones not — is passed by
 * both the correct client *and* a client that quietly computes
 * `concludedAt > now - 7d`. It proves nothing, because in the ordinary case the
 * two agree.
 *
 * So the rows here disagree with the calendar on purpose:
 *
 * | row | age | `watchable` | why this happens in production |
 * |---|---|---|---|
 * | held | **30 days** | `true` | retained for a moderation report |
 * | failed | **2 hours** | `false` | the blob put failed — 008 swallows it |
 *
 * Both rows are real states of `apps/api/src/replays/read.ts`, and a
 * date-computing client gets **both of them wrong** — it would hide a replay
 * that exists and promise one that does not. The second is the worse half: the
 * failure arrives after a click, on a screen that has already promised a video,
 * and it is indistinguishable from a network problem.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BattleListScreen } from '../../src/features/replays/BattleListScreen.js';
import { NOW, entry, hoursAgo, requested, stubReplays } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const HELD = entry({
  battleId: 'btl-held',
  concludedAt: hoursAgo(24 * 30),
  watchable: true,
  outcome: 'loss',
});

const FAILED = entry({
  battleId: 'btl-failed',
  concludedAt: hoursAgo(2),
  watchable: false,
});

const open = async (battles: readonly unknown[]) => {
  stubReplays({ '/me/battles': { battles, total: battles.length } });
  render(
    <BattleListScreen now={NOW} onWatch={() => {}} onUnauthenticated={() => {}} />,
  );
  return screen.findByRole('table', { name: /your battles/i });
};

const row = (battleId: string): HTMLElement =>
  document.querySelector(`[data-battle="${battleId}"]`) as HTMLElement;

describe('the WATCH control follows the flag, not the calendar', () => {
  it('offers WATCH on a thirty-day-old battle the server says is watchable', async () => {
    await open([HELD, FAILED]);

    expect(
      within(row('btl-held')).queryByRole('button', { name: /watch/i }),
      'a replay the server is serving was hidden because the client thought it was too old',
    ).not.toBeNull();
  });

  it('offers none on a two-hour-old battle the server says is not', async () => {
    await open([HELD, FAILED]);

    expect(
      within(row('btl-failed')).queryByRole('button', { name: /watch/i }),
      'a WATCH button for a replay that does not exist — the click ends in a 410 the player reads as a network fault',
    ).toBeNull();
  });

  it('never requests a replay to find out whether there is one', async () => {
    await open([HELD, FAILED]);

    /**
     * FR-011's actual failure mode. Probing `/replays/:id` on render would work,
     * would look fine in development, and would put a request per row on a list
     * of fifty.
     */
    expect(requested().some((r) => r.includes('/replays/'))).toBe(false);
  });

  it('asks for the list exactly once', async () => {
    await open([HELD]);
    expect(requested().filter((r) => r.includes('/me/battles'))).toHaveLength(1);
  });
});

describe('the row carries what the list is for', () => {
  it('shows both sides of the result, the opponent and the length', async () => {
    await open([HELD]);
    const text = row('btl-held').textContent ?? '';

    expect(text).toMatch(/loss/i);
    expect(text).toContain('Reyna_Current');
    expect(text).toContain('96');
    /* The export's age column — presentation, and nothing branches on it. */
    expect(text).toContain('30D');
  });

  it('marks a bot opponent as one', async () => {
    await open([
      entry({ battleId: 'btl-bot', opponent: { id: null, username: 'Ninefold Vigil', isBot: true } }),
    ]);

    expect(row('btl-bot').textContent).toMatch(/bot/i);
  });

  it('says a departed player is departed rather than showing a blank', async () => {
    await open([
      entry({ battleId: 'btl-gone', opponent: { id: null, username: null, isBot: false } }),
    ]);

    /* The record outlives the account; a blank cell reads as a rendering bug. */
    expect(row('btl-gone').textContent).toMatch(/departed/i);
  });

  it('names no champion anywhere', async () => {
    await open([HELD, FAILED]);

    /**
     * **Constitution XVII at the surface that would break it.** The list route
     * carries neither squad on purpose — *"a list is not a scouting surface"* —
     * and the Battle Record export draws a SQUAD SENT column that this screen
     * therefore cannot fill. Asserted so that adding it would fail here rather
     * than ship.
     */
    const body = screen.getByRole('table', { name: /your battles/i }).textContent ?? '';
    for (const champion of ['Bramwen', 'Reyna Two-Rivers', 'Kaellis', 'Nyxara']) {
      expect(body, `${champion} appears in the battle list`).not.toContain(champion);
    }
  });
});

describe('an empty list', () => {
  it('reads as no battles rather than as a failure', async () => {
    stubReplays({ '/me/battles': { battles: [], total: 0 } });
    render(
      <BattleListScreen now={NOW} onWatch={() => {}} onUnauthenticated={() => {}} />,
    );

    expect(await screen.findByText(/have not fought/i)).toBeTruthy();
  });
});
