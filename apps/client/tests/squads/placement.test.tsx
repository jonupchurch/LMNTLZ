/**
 * A champion can actually be moved onto a seat — in either order (019 US2).
 *
 * ### What this exists to catch
 *
 * The board's instruction read *"Click a seat, then a champion"* and the code
 * required the champion **first**: `seatActivate` opened with
 * `if (!selected) return`, so following the printed instruction did nothing at
 * all. Every existing test happened to drive the working order, so the whole
 * suite was green while the reported symptom was *"you can't change any
 * heroes"*.
 *
 * That is the shape worth guarding: **a suite that only ever exercises the path
 * the author had in mind cannot see the path a player takes.** So both orders
 * are driven here, plus the two ways out — putting a champion down, and taking
 * one off a seat.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SquadsScreen } from '../../src/features/squads/SquadsScreen.js';
import { IDS, nameOf, roster } from './fixtures.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('preview-move')) {
        return json(200, { heroId: '', evicts: [], poolAfter: {}, streakAtRisk: 0 });
      }
      if (path.includes('/roster')) return json(200, roster());
      /* The header reads the shard balance and the gear score on every navigation
         (useAccountSummary). Answered blank here: this file is not about the header,
         and a strict stub that throws would fail on a request the screen under test
         never makes itself. An empty body leaves both numbers undefined, which is
         exactly what the header draws nothing for. */
      if (path.includes('/me/shards') || path.includes('/me/standing')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unstubbed request: ${path}`);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Render, and wait for the **seeded** board rather than the loaded roster.
 *
 * `useAllocation` seeds its seats from the fetched roster in an effect, so the
 * screen has a paint where the champions exist and all six seats read *empty*.
 * Waiting on `Champion roster` alone lands in that gap **sometimes** — this
 * file passed once and failed on the next run, which is the signature of a
 * test that races the code rather than one that tests it.
 *
 * Waiting on the state every assertion here actually depends on makes the
 * whole file deterministic, and does it once instead of at each call site.
 */
async function ready() {
  render(<SquadsScreen />);
  await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
  await waitFor(() =>
    expect(
      [...document.querySelectorAll('[data-seat]')].some(
        (s) => !s.getAttribute('aria-label')?.includes('empty'),
      ),
      'the board never seeded from the fetched roster',
    ).toBe(true),
  );
}

/** A champion on nobody's squad in the fixture — 12 defend, so 12+ is free. */
const FREE = IDS[20]!;

const seat = (name: RegExp) => screen.getByRole('button', { name });
const card = (heroId: string) =>
  within(screen.getByLabelText('Champion roster')).getByRole('button', {
    name: new RegExp(nameOf(heroId)),
  });

describe('placing a champion works in both directions', () => {
  it('seat first, then the champion — the order the board tells you to use', async () => {
    await ready();

    /* Nothing in hand: this arms the seat rather than silently doing nothing,
       which is the entire defect. */
    await userEvent.click(seat(/Front seat 1/));
    expect(seat(/Front seat 1/)).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(card(FREE));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(FREE)}`) }),
      ).toBeInTheDocument(),
    );
  });

  it('champion first, then the seat — the order that already worked', async () => {
    await ready();

    await userEvent.click(card(FREE));
    await userEvent.click(seat(/Front seat 2/));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: new RegExp(`Front seat 2: ${nameOf(FREE)}`) }),
      ).toBeInTheDocument(),
    );
  });

  /**
   * **Both selections toggle off.** Without it there is no way to cancel, and a
   * stray click leaves every later click placing somebody the player has
   * forgotten they were holding — which reads as the screen acting on its own.
   */
  it('puts down an armed seat, and a champion in hand', async () => {
    await ready();

    await userEvent.click(seat(/Front seat 1/));
    expect(seat(/Front seat 1/)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(seat(/Front seat 1/));
    expect(seat(/Front seat 1/)).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(card(FREE));
    expect(card(FREE)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(card(FREE));
    expect(card(FREE)).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * **The only single-seat removal in the app.** `CLEAR` empties all six, and
   * before this the sole way to get one champion off a squad was to cover her
   * with another — so a player who wanted five and a gap could not have one.
   */
  it('takes a champion off an armed seat, and offers Remove nowhere else', async () => {
    await ready();

    // The fixture seats IDS[0..5] on the Visible zone, which opens first.
    const seated = nameOf(IDS[0]!);
    expect(screen.queryByRole('button', { name: /^Remove$/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Front seat 1: ${seated}`) }));
    await userEvent.click(screen.getByRole('button', { name: /^Remove$/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Front seat 1, empty/ })).toBeInTheDocument(),
    );
    /* And it goes away again, because an empty seat has nobody to remove. */
    expect(screen.queryByRole('button', { name: /^Remove$/ })).toBeNull();
  });
});
