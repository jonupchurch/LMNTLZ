/**
 * The three attack squads, which had no interface at all (006 T061–T063).
 *
 * ### What was missing
 *
 * `SquadBuilder` has taken a `kind: 'offense'` prop since T019 and **was never
 * rendered with it**. There was no way to reach an attack squad from the running
 * app, which means there was no way to attack — the roster screen could commit
 * twelve champions to defense and nothing else.
 *
 * ### The two rules that make offense different, and both are tested here
 *
 * | Rule | Consequence |
 * |---|---|
 * | the player commands offense | **no per-champion config**, and the server refuses one |
 * | 3 × 6 = 18 seats from 15 champions | **overlap is forced**, so it is never a conflict |
 *
 * The second is why nothing here checks a champion against the other two attack
 * squads. A rule treating that as a collision would make the game unplayable, and
 * it would pass every test written with fewer than three squads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SquadsScreen } from '../../src/features/squads/SquadsScreen.js';
import { IDS, nameOf, roster, seatsFrom } from './fixtures.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[];
let offenseResponse: { status: number; body: unknown };

/** Three overlapping attack squads — the ordinary end state of a full roster. */
const withOffense = () => {
  const free = IDS.slice(12);
  const shared = free[0]!;
  return roster({
    offense: [
      { slot: 0, name: 'Vanguard', seats: seatsFrom([shared, ...free.slice(1, 6)]), complete: true, valid: true },
      { slot: 1, name: 'Second Wind', seats: seatsFrom([shared, ...free.slice(6, 11)]), complete: true, valid: true },
      { slot: 2, name: null, seats: [], complete: false, valid: true },
    ],
  });
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  offenseResponse = { status: 200, body: { slot: 0, name: 'Vanguard', complete: true, valid: true } };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (path.includes('preview-move')) {
        return json(200, { heroId: '', evicts: [], poolAfter: {}, streakAtRisk: 0 });
      }
      if (method === 'PUT' && path.includes('/squads/offense/')) {
        return json(offenseResponse.status, offenseResponse.body);
      }
      if (method === 'PUT' && path.includes('/squads/defense/')) {
        return json(200, { holdStreak: 0, streakReset: true, evictedSquadIds: [], warnings: [] });
      }
      if (path.includes('/roster')) return json(200, withOffense());

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

const puts = () => calls.filter((c) => c.method === 'PUT');

/**
 * Open The Striking Six.
 *
 * **019 US2 put the five squads behind a two-level control** — a mode above
 * numbered chips, which is what the design draws — so an attack slot is one
 * click further away than it was. The state underneath is unchanged: `editing`
 * is still one discriminant and the mode is derived from it, which is exactly
 * what the last test in this block proves.
 */
async function striking(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: /The Striking Six/i }));
}

async function onAttack(slot: 1 | 2 | 3) {
  render(<SquadsScreen />);
  await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
  await striking();
  await userEvent.click(screen.getByRole('tab', { name: new RegExp(`Attack ${slot}`) }));
}

describe('all five squads are reachable from the header', () => {
  it('offers both defense zones and all three attack slots', async () => {
    render(<SquadsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());

    /* Two modes plus the two zones — the standing side is what opens on. */
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    for (const name of [/Zone I,/, /Zone II,/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }

    await striking();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    for (const name of [/Attack 1/, /Attack 2/, /Attack 3/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  /**
   * **The mode is derived, not stored**, which is the claim the two-level
   * control has to earn: selecting an attack slot leaves The Striking Six lit,
   * because "which mode" is read off "which squad" rather than held beside it.
   * A second piece of state would let these two disagree.
   */
  it('lights the mode belonging to the squad that is open', async () => {
    render(<SquadsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());

    expect(screen.getByRole('tab', { name: /The Standing Six/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await striking();
    await userEvent.click(screen.getByRole('tab', { name: /Attack 3/ }));
    expect(screen.getByRole('tab', { name: /The Striking Six/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('says which attack squads are ready and which are short', async () => {
    render(<SquadsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
    await striking();

    expect(screen.getByRole('tab', { name: /Attack 1, Vanguard, ready/ })).toBeInTheDocument();
    // Slot 2 is unnamed and empty in the fixture, which is a stated state.
    expect(screen.getByRole('tab', { name: /Attack 3, empty/ })).toBeInTheDocument();
  });

  it('distinguishes a broken squad from an unfinished one', async () => {
    /**
     * **The distinction is the whole of SC-009.** A squad our own eviction rule
     * emptied a seat in did not get that way through anything the player did, and
     * it cannot attack until it is refilled — reading as "not got round to it yet"
     * would leave them wondering why the battle button refuses.
     */
    const payload = withOffense();
    const broken = {
      ...payload,
      assignments: {
        ...payload.assignments,
        offense: [
          { ...payload.assignments.offense[0]!, complete: false, valid: false, seats: seatsFrom(IDS.slice(12, 18)).slice(0, 5) },
          ...payload.assignments.offense.slice(1),
        ],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/roster')
          ? json(200, broken)
          : json(200, { heroId: '', evicts: [], poolAfter: {}, streakAtRisk: 0 }),
      ),
    );

    render(<SquadsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Champion roster')).toBeInTheDocument());
    await striking();

    expect(screen.getByRole('tab', { name: /Attack 1, Vanguard, broken/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Attack 1/ }));
    // By text, not by `getByRole('status')` — the builder's formation-fault line is
    // also a status, and there being two of them is correct.
    expect(screen.getByText(/cannot attack until it is back to six/)).toBeInTheDocument();
  });
});

describe('saving an attack squad', () => {
  it('PUTs to the slot on screen, with a name and no config', async () => {
    await onAttack(1);
    await userEvent.click(screen.getByRole('button', { name: /Save Attack 1/ }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    const [save] = puts();
    expect(save!.path).toMatch(/\/v1\/squads\/offense\/0$/);

    const body = save!.body as { name: string | null; seats: Record<string, unknown>[] };
    expect(body.name).toBe('Vanguard');
    expect(body.seats).toHaveLength(6);

    /**
     * **Not merely absent by accident.** The player commands offense, so there is
     * nothing to configure — and the route rejects a config on an offense seat
     * rather than accepting and ignoring one, because a player who sent one would
     * believe it applied.
     */
    for (const seat of body.seats) {
      expect('config' in seat, 'an attack seat carried a defense configuration').toBe(false);
    }
  });

  /**
   * **Twenty seconds, declared per test rather than in the config.**
   *
   * This is the longest test in the client suite by some way: it fills six
   * empty seats, which is twelve `userEvent` clicks, each re-rendering a
   * 27-champion roster. It finishes in about two seconds on its own and blows
   * the 5s default under the **root** runner, where 169 files across two
   * packages compete for workers — so it passed `pnpm test` and failed
   * `vitest run` from the repo root, which is the worst possible split.
   *
   * A `testTimeout` in `vitest.config.ts` would not fix it: the root config
   * declares `projects: ['apps/*']`, so **this package's nested `projects`
   * array is dropped entirely** and every option inside it goes with it. That
   * has now cost `fileParallelism` and `testTimeout` in `apps/api` for the same
   * reason. A per-test timeout is honoured by both runners.
   */
  it('saves the slot the tab is on, not always the first', async () => {
    await onAttack(3);
    // Slot 2 is empty in the fixture, so fill it before the save is enabled.
    for (const [i, seat] of (
      [
        [12, /Front seat 1, empty/],
        [13, /Front seat 2, empty/],
        [14, /Middle seat 1, empty/],
        [15, /Middle seat 2, empty/],
        [16, /Middle seat 3, empty/],
        [17, /Back seat 1, empty/],
      ] as const
    ).entries()) {
      void i;
      await userEvent.click(screen.getByRole('button', { name: new RegExp(nameOf(IDS[seat[0]]!)) }));
      await userEvent.click(screen.getByRole('button', { name: seat[1] }));
    }

    await userEvent.click(screen.getByRole('button', { name: /Save Attack 3/ }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]!.path).toMatch(/\/v1\/squads\/offense\/2$/);
  }, 20_000);

  it('sends null rather than an empty name', async () => {
    // The server stores `null` for "unnamed"; an empty string would be a name
    // that renders as nothing and reads as a bug.
    await onAttack(3);
    expect((screen.getByLabelText('Squad name') as HTMLInputElement).value).toBe('');
  });

  it('keeps the name the squad already had, rather than blanking it', async () => {
    /**
     * A name is part of the squad. If opening the tab cleared the box, the next
     * Save would silently rename `Vanguard` to nothing.
     */
    await onAttack(1);
    expect((screen.getByLabelText('Squad name') as HTMLInputElement).value).toBe('Vanguard');
  });

  it('reports what the save produced', async () => {
    offenseResponse = {
      status: 200,
      body: { slot: 0, name: 'Vanguard', complete: true, valid: true },
    };
    await onAttack(1);
    await userEvent.click(screen.getByRole('button', { name: /Save Attack 1/ }));

    expect(await screen.findByText(/Vanguard is ready to attack/)).toBeInTheDocument();
  });
});

describe('a defending champion cannot be seated on an attack squad', () => {
  it('refuses locally and names the zone she is defending', async () => {
    /**
     * **Refused here rather than by the server's `409`.** The roster already says
     * which zone she is in, and a player who has to press Save to find out has
     * already composed a squad around somebody who cannot be in it.
     */
    await onAttack(3);

    const defender = IDS[0]!; // seated in the Visible zone by the fixture
    await userEvent.click(screen.getByRole('button', { name: new RegExp(nameOf(defender)) }));
    await userEvent.click(screen.getByRole('button', { name: /Front seat 1, empty/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/defending your Zone I and cannot attack/);
    // And she is not on the squad.
    expect(screen.queryByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(defender)}`) })).toBeNull();
    expect(puts()).toHaveLength(0);
  });

  it('permits a champion already on another attack squad, because overlap is forced', async () => {
    // 3 × 6 = 18 seats from 15 champions. A rule against this makes the game
    // unplayable, and it would pass every test written with fewer than 3 squads.
    await onAttack(3);

    const shared = IDS[12]!; // on both Attack 1 and Attack 2 in the fixture
    await userEvent.click(screen.getByRole('button', { name: new RegExp(nameOf(shared)) }));
    await userEvent.click(screen.getByRole('button', { name: /Front seat 1, empty/ }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('button', { name: new RegExp(`Front seat 1: ${nameOf(shared)}`) }),
    ).toBeInTheDocument();
  });
});

describe('there is nothing to configure on an attack squad', () => {
  it('offers no defense controls for a champion seated on one', async () => {
    await onAttack(1);

    /**
     * Selected from the **roster panel** specifically. A champion who is seated
     * appears twice by name — once as a roster card and once as the seat holding
     * her — so an unscoped query finds two buttons and fails on the ambiguity.
     */
    const seated = IDS[12]!;
    await userEvent.click(
      within(screen.getByLabelText('Champion roster')).getByRole('button', {
        name: new RegExp(nameOf(seated)),
      }),
    );

    // The panel appears for defense; here it must not, and neither must the
    // stand-in sentence that replaces it for an unconfigured champion.
    expect(screen.queryByText(/Primary target/)).toBeNull();
    expect(screen.queryByText(/playing her Role/)).toBeNull();
  });
});
