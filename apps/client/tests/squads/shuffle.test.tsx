/**
 * A half-built defense zone saves, and an incomplete defense grounds you (019).
 *
 * ### The move that could not be started
 *
 * Taking one champion out of a full Visible zone left it at five, five was not a
 * squad, and the save was refused — so reorganising across two zones and three
 * attack squads had to be completed in a single sitting with every replacement
 * already chosen, or abandoned. The rule did not disappear; it moved to the
 * moment a battle starts.
 *
 * ### What this file can prove and what it cannot
 *
 * It proves the *client* offers the save and withholds the attack. It cannot
 * prove either rule, because neither lives here — the server accepts the short
 * save and `createBattle` refuses the short attacker, and
 * `tests/squads/partialDefense.test.ts` in the API is where those are asserted.
 * **A greyed-out button is a courtesy, never an authorization check.**
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SQUAD_SIZE } from '@lmntlz/sim/rules';
import { SquadsScreen } from '../../src/features/squads/SquadsScreen.js';
import { IDS, nameOf, roster, seatsFrom } from './fixtures.js';
import type { RosterResponse } from '../../src/features/squads/types.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[];
let payload: RosterResponse;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  calls = [];
  payload = roster();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (path.includes('preview-move')) {
        return json(200, { heroId: '', evicts: [], poolAfter: {}, streakAtRisk: 0 });
      }
      if (method === 'PUT') {
        return json(200, { holdStreak: 0, streakReset: true, evictedSquadIds: [], warnings: [] });
      }
      if (path.includes('/roster')) return json(200, payload);
      /* The header reads the shard balance and the gear score on every navigation
         (useAccountSummary). Answered blank here: this file is not about the header,
         and a strict stub that throws would fail on a request the screen under test
         never makes itself. An empty body leaves both numbers undefined, which is
         exactly what the header draws nothing for. */
      if (path.includes('/me/shards') || path.includes('/me/standing')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unstubbed request: ${method} ${path}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function ready() {
  render(<SquadsScreen onFindBattle={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
  /* Wait on the seeded board, not on the roster label — `useAllocation` fills
     the seats in an effect, so there is a paint where the champions have
     arrived and all six seats still read empty. */
  await waitFor(() =>
    expect(screen.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(IDS[0]!)}`) }))
      .toBeInTheDocument(),
  );
}

const saves = () => calls.filter((c) => c.method === 'PUT');

/** A zone short of six, as the server would serve it after a partial save. */
const shortVisible = (n: number): RosterResponse => {
  const base = roster();
  return {
    ...base,
    assignments: {
      ...base.assignments,
      defense: {
        ...base.assignments.defense,
        visible: {
          ...base.assignments.defense.visible,
          seats: seatsFrom(IDS.slice(0, 6)).slice(0, n),
          canDefend: false,
          reason: `Your visible zone has ${n} of ${SQUAD_SIZE} champions and cannot defend.`,
        },
      },
    },
  };
};

describe('a defense zone saves half-built', () => {
  it('sends five seats when a champion has been taken out', async () => {
    await ready();

    /* Arm the occupied seat and remove her — the one single-seat removal on the
       screen, and the start of every reorganisation. */
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(IDS[0]!)}`) }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Remove$/ }));

    await userEvent.click(screen.getByRole('button', { name: /Set as defense, Zone I/ }));

    await waitFor(() => expect(saves()).toHaveLength(1));
    const body = saves()[0]!.body as { seats: unknown[] };
    expect(body.seats).toHaveLength(SQUAD_SIZE - 1);
  });

  /**
   * **The button being enabled is not enough.** `SquadsScreen.save` had its own
   * `isComplete` guard, so an enabled button could still return silently — which
   * is the exact shape of the *"you can't change any heroes"* defect. Asserting
   * the request is what tells the two apart.
   */
  it('says short is a stage rather than a fault', async () => {
    await ready();
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(IDS[0]!)}`) }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Remove$/ }));

    expect(screen.getByText(/cannot defend until it is 6/)).toBeInTheDocument();
    /* And not the failure sentence, which would sit beside a live Save button
       and contradict it. */
    expect(screen.queryByText(/A squad is exactly 6 champions/)).toBeNull();
  });

  it('clears a zone completely, which is the other end of the same move', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    await userEvent.click(screen.getByRole('button', { name: /Set as defense, Zone I/ }));

    await waitFor(() => expect(saves()).toHaveLength(1));
    expect((saves()[0]!.body as { seats: unknown[] }).seats).toHaveLength(0);
  });
});

describe('you cannot go looking for a battle while a zone is short', () => {
  it('disables Find battle and prints the standing of both zones', async () => {
    payload = shortVisible(4);
    await ready();

    await userEvent.click(screen.getByRole('tab', { name: 'The Striking Six' }));

    const find = screen.getByRole('button', { name: /Find battle/ });
    expect(find).toBeDisabled();
    expect(screen.getByText(/Both defense zones need six champions/)).toBeInTheDocument();
    /* Both zones, so the player knows which one to go and fix. */
    expect(screen.getByText(/I 4\/6 and II 6\/6/)).toBeInTheDocument();
  });

  /**
   * **The other side of the gate.** A rule that refused everybody would satisfy
   * the test above and break the game.
   */
  it('offers it once both zones are six', async () => {
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: 'The Striking Six' }));

    expect(screen.queryByText(/Both defense zones need six champions/)).toBeNull();
  });

  /**
   * **Read from the stored zones, not the board.** A player who has just dragged
   * a sixth champion in has not saved yet, and the squad the engine would defend
   * with is still short — so the gate must not open until the save lands.
   */
  it('stays shut while the fix is only on screen and not yet saved', async () => {
    payload = shortVisible(5);
    await ready();

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`${nameOf(IDS[26]!)}`) }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Back seat 1/ }));

    await userEvent.click(screen.getByRole('tab', { name: 'The Striking Six' }));
    expect(screen.getByText(/Both defense zones need six champions/)).toBeInTheDocument();
  });
});
