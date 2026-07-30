/**
 * The defense squad actually persists (006, the wiring nobody had a task for).
 *
 * ### What this exists to catch
 *
 * Every component on the squad screen was built, unit-tested and reachable — and
 * **nothing called `PUT /v1/squads/defense/:zone`**. A player could compose a
 * legal squad, reload, and find it gone. That is invisible to a component suite,
 * which asks whether a button renders rather than whether pressing it reaches the
 * server, and it was found by signing in and using the site.
 *
 * So the assertions here are about the *request*: that it happens, where it goes,
 * what it carries, and what the screen does with each answer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SquadsScreen } from '../../src/features/squads/SquadsScreen.js';
import { IDS, nameOf, roster } from './fixtures.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[];

/** What `PUT /squads/defense/:zone` answers. Overridden per test. */
let saveResponse: { status: number; body: unknown };

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });

      if (path.includes('/squads/defense/') && path.includes('preview-move')) {
        return json(200, { heroId: '', evicts: [], poolAfter: {}, streakAtRisk: 0 });
      }
      if (method === 'PUT' && path.includes('/squads/defense/')) {
        return json(saveResponse.status, saveResponse.body);
      }
      if (path.includes('/roster')) return json(200, roster());

      throw new Error(`unstubbed request: ${method} ${path}`);
    }),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const saves = () => calls.filter((c) => c.method === 'PUT');
const rosterReads = () => calls.filter((c) => c.path.includes('/roster'));

beforeEach(() => {
  calls = [];
  saveResponse = {
    status: 200,
    body: { holdStreak: 0, streakReset: true, evictedSquadIds: [], warnings: [] },
  };
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Rendered and loaded, which every test here needs before it can press anything. */
async function screenReady() {
  render(<SquadsScreen />);
  await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
}

describe('pressing Save reaches the server', () => {
  it('PUTs the composed squad to the zone being edited', async () => {
    await screenReady();

    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    await waitFor(() => expect(saves()).toHaveLength(1));
    const [save] = saves();
    expect(save!.path).toMatch(/\/v1\/squads\/defense\/visible$/);

    // Six seats, and each one carries the placement the server validates.
    const body = save!.body as { seats: { row: string; index: number; heroId: string }[] };
    expect(body.seats).toHaveLength(6);
    expect(body.seats.map((s) => `${s.row}${s.index}`).sort()).toEqual([
      'back0',
      'front0',
      'front1',
      'middle0',
      'middle1',
      'middle2',
    ]);
  });

  it('saves the zone the tab is on, not always the first one', async () => {
    /**
     * **The mistake this catches is a hard-coded `visible`**, which would pass
     * every test above and silently overwrite Zone I whenever a player edited
     * Zone II — losing a squad *and* a hold streak in one press.
     */
    await screenReady();

    await userEvent.click(screen.getByRole('tab', { name: /Zone II/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save Zone II/ }));

    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]!.path).toMatch(/\/v1\/squads\/defense\/hidden$/);
  });

  it('sends each seated champion’s served config back unchanged', async () => {
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    await waitFor(() => expect(saves()).toHaveLength(1));
    const body = saves()[0]!.body as {
      seats: { heroId: string; config?: { targeting: string[]; ranking: number[] } }[];
    };

    for (const seat of body.seats) {
      expect(seat.config, `${seat.heroId} lost its configuration`).toBeDefined();
      expect(seat.config!.targeting).toEqual(['lowest-current-hp', 'nearest']);
      expect(seat.config!.ranking).toEqual([5, 4, 3, 2, 1, 0]);
    }
  });

  it('omits the config for a champion seated in this session', async () => {
    /**
     * ### The one design decision on this screen worth a test of its own
     *
     * The role-default table is **server-only**: shipping it would hand every
     * player the exact ranking the engine plays against them. So a champion the
     * player has just seated has no configuration the client could honestly send,
     * and the field is **left out** rather than filled with a guess — the server
     * resolves her Role default, and the refetch brings back what it chose.
     *
     * A client that invented a config here would be inventing the defense AI's
     * behaviour and attributing it to the player.
     */
    await screenReady();

    // Somebody not on either defense zone — the fixture seats the first twelve.
    const newcomer = IDS[20]!;
    await userEvent.click(screen.getByRole('button', { name: new RegExp(nameOf(newcomer)) }));
    await userEvent.click(screen.getByRole('button', { name: /Front seat 1: / }));

    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));
    await waitFor(() => expect(saves()).toHaveLength(1));

    const body = saves()[0]!.body as { seats: { heroId: string; config?: unknown }[] };
    const seated = body.seats.find((s) => s.heroId === newcomer);

    expect(seated, 'the champion just seated was not in the saved squad').toBeDefined();
    expect(
      'config' in seated!,
      'the client invented a configuration for an unconfigured champion',
    ).toBe(false);

    // And the five it replaced nothing of still carry theirs.
    expect(body.seats.filter((s) => s.config !== undefined)).toHaveLength(5);
  });
});

describe('what the screen says about the save', () => {
  it('reports a reset streak as a cost, not as a success message', async () => {
    saveResponse = {
      status: 200,
      body: { holdStreak: 0, streakReset: true, evictedSquadIds: [], warnings: [] },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    expect(await screen.findByText(/hold streak reset to 0/)).toBeInTheDocument();
  });

  it('says a no-op save cost nothing, because it must', async () => {
    /**
     * **Opening the editor to read a configuration has to be free** — that is why
     * the server compares a hash instead of trusting a dirty flag. A screen that
     * announced a reset either way would teach players not to look.
     */
    saveResponse = {
      status: 200,
      body: { holdStreak: 14, streakReset: false, evictedSquadIds: [], warnings: [] },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    expect(await screen.findByText(/Hold streak 14 is intact/)).toBeInTheDocument();
  });

  it('shows every warning, and none of them blocks', async () => {
    saveResponse = {
      status: 200,
      body: {
        holdStreak: 0,
        streakReset: true,
        evictedSquadIds: [],
        warnings: [
          { code: 'reach-1-back-seat', heroId: 'silka', message: 'Silka has reach 1 in the back seat.' },
          { code: 'power-never-fires', heroId: 'vael', message: 'Vael’s tier 4 and 5 never fire.' },
        ],
      },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    expect(await screen.findByText(/Silka has reach 1/)).toBeInTheDocument();
    expect(screen.getByText(/tier 4 and 5 never fire/)).toBeInTheDocument();
    // Surfaced *after* a save that succeeded — the two must not read as a refusal.
    expect(screen.getByText(/hold streak reset/)).toBeInTheDocument();
  });

  it('names the attack squads an eviction broke', async () => {
    saveResponse = {
      status: 200,
      body: {
        holdStreak: 0,
        streakReset: true,
        evictedSquadIds: ['sq_1', 'sq_2'],
        warnings: [],
      },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    expect(await screen.findByText(/2 attack squads lost champions/)).toBeInTheDocument();
  });

  it('refetches the roster, rather than patching it from the response', async () => {
    /**
     * The response says what the save *cost*. It does not say what the account now
     * looks like: eviction has just changed up to three attack squads and the
     * offense pool is recomputed from the defense rows. Reconstructing that on the
     * client would be a second copy of the server's bookkeeping.
     */
    await screenReady();
    expect(rosterReads()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));
    await waitFor(() => expect(rosterReads()).toHaveLength(2));
  });
});

describe('a refused save', () => {
  it('keeps the builder on screen and shows the server’s own sentence', async () => {
    /**
     * ### Two failure states, and this is why
     *
     * A single `error` state served both "the roster would not load" and "this
     * action failed", and it replaced the whole page — so a rejected save threw
     * away the squad the player had just composed. A `409` here is recoverable in
     * one click, and the server's message names the champion and the zone.
     */
    saveResponse = {
      status: 409,
      body: {
        error: {
          code: 'hero_on_other_zone',
          message: 'Bramwen is already defending your hidden zone.',
        },
      },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already defending your hidden zone/);
    // The screen the player was working on is still there.
    expect(screen.getByLabelText('defense squad formation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Zone I/ })).toBeInTheDocument();
  });

  it('does not refetch, because nothing changed', async () => {
    saveResponse = {
      status: 422,
      body: { error: { code: 'wrong-size', message: 'A squad is exactly six champions.' } },
    };
    await screenReady();
    await userEvent.click(screen.getByRole('button', { name: /Save Zone I/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(rosterReads()).toHaveLength(1);
  });
});
