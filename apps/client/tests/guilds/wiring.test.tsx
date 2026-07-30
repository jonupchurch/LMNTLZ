/**
 * **Is it called?** (013 T069)
 *
 * ### TL;DR
 *
 * These tests do not check that the guild screen looks right. They check that it
 * actually *asks the server for anything* — because the defect this whole feature's
 * wiring pass exists to prevent is a screen that is complete, typed, unit-tested
 * and wired to nothing.
 *
 * ### Why a whole file for this
 *
 * Seven times across five features, a component was built and never rendered, or a
 * route registered and never called. **It has never once announced itself** — an
 * uncalled seam does not error, does not log, and does not fail a test. `006` left
 * a squad builder unreachable; `012` left a profile screen that rendered nothing
 * until Phase 7; `009`'s `guildJoined()` sat with no caller for four features.
 *
 * *"Is it called?"* is a testable claim, so it gets tested. Each assertion below
 * was **mutated** — the call deleted, the suite watched failing, the call
 * restored — because a wiring test nobody has seen fail is the same promise that
 * failed seven times.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuildScreen } from '../../src/features/guilds/GuildScreen.js';

/** Every path the screen requests, in order. */
let requested: string[] = [];

const EMPTY = {
  guild: null,
  role: null,
  applications: [],
  invites: [],
  applicationBudget: { used: 0, max: 5 },
};

const IN_A_GUILD = {
  guild: {
    id: 'g-1',
    name: 'The Long Reach',
    emblem: { icon: 3, ink: 2, ground: 5 },
    pitch: 'Counter-builders welcome.',
    motd: null,
    motdSetAt: null,
    foundedAt: '2026-07-01T00:00:00.000Z',
    disbanded: false,
    memberCount: 2,
    capacity: 24,
    members: [
      {
        playerId: 'me',
        username: 'Reyna',
        role: 'master' as const,
        joinedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        playerId: 'other',
        username: 'Kestrel',
        role: 'member' as const,
        joinedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
  },
  role: 'master' as const,
  applications: [],
  invites: [],
  applicationBudget: { used: 0, max: 5 },
};

function stubFetch(bodies: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);

      const key = Object.keys(bodies).find((k) => url.includes(k));
      return Promise.resolve(
        new Response(JSON.stringify(key ? bodies[key] : {}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

beforeEach(() => {
  requested = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the guild screen requests its data', () => {
  it('calls GET /v1/me/guild on mount — without this the screen shows nothing', async () => {
    stubFetch({ '/me/guild': EMPTY });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await waitFor(() => {
      expect(
        requested.some((u) => u.includes('/v1/me/guild')),
        `never requested /v1/me/guild — asked for: ${JSON.stringify(requested)}`,
      ).toBe(true);
    });
  });

  it('BROWSES guilds — the wire that makes applying possible at all', async () => {
    stubFetch({
      '/me/guild': EMPTY,
      '/v1/guilds?q=': {
        guilds: [
          {
            id: 'g-7',
            name: 'The Long Reach',
            emblem: { icon: 4, ink: 2, ground: 6 },
            pitch: 'Counter-builders welcome.',
            memberCount: 9,
            capacity: 24,
            hasRoom: true,
          },
        ],
      },
    });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await waitFor(() => {
      expect(
        requested.some((u) => u.includes('/v1/guilds?q=')),
        `never browsed the directory — asked for: ${JSON.stringify(requested)}`,
      ).toBe(true);
    });

    /**
     * The guild is reachable **by name**, and Apply is on its card. Before this
     * existed the form asked a human to type a UUID nothing ever displayed.
     */
    expect(await screen.findByText('The Long Reach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('renders the budget and the first-acceptance rule where a player applies', async () => {
    stubFetch({ '/me/guild': EMPTY, '/v1/guilds?q=': { guilds: [] } });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    /** FR-008 — the budget as a *number*, not an error discovered by hitting it. */
    expect(await screen.findByTestId('application-budget')).toHaveTextContent('0 of 5 open');

    /** FR-011 — stated where the player applies. */
    expect(
      screen.getByText(/first guild to accept you takes you/i),
      'the first-acceptance contract must be stated at the point of applying',
    ).toBeInTheDocument();
  });

  it('asks a human for no identifiers — no UUID field anywhere', async () => {
    stubFetch({ '/me/guild': EMPTY, '/v1/guilds?q=': { guilds: [] } });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await screen.findByTestId('application-budget');

    /**
     * The regression this guards: every route worked and the feature was
     * unusable, because the only way in was a field labelled *"Guild id"*.
     */
    expect(screen.queryByLabelText(/guild id/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/guild id/i)).toBeNull();
  });

  it('asks for the founding prerequisites — including the starter warning', async () => {
    stubFetch({
      '/me/guild': EMPTY,
      '/v1/guilds?q=': { guilds: [] },
      '/guilds/new': {
        cost: 650,
        capacity: 24,
        palette: { icons: 36, inks: 12, grounds: 12 },
        starterWarning: null,
      },
      '/me/shards': { balance: 900 },
    });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /found a guild/i }));

    await waitFor(() => {
      expect(
        requested.some((u) => u.includes('/v1/guilds/new')),
        'the client must FETCH the warning, never decide for itself whether to warn',
      ).toBe(true);
    });

    /** The shard balance beside the price, as 012 T043 established. */
    await waitFor(() => {
      expect(requested.some((u) => u.includes('/v1/me/shards'))).toBe(true);
    });
  });

  it('renders the emblem designer inside the founding flow', async () => {
    stubFetch({
      '/me/guild': EMPTY,
      '/v1/guilds?q=': { guilds: [] },
      '/guilds/new': {
        cost: 650,
        capacity: 24,
        palette: { icons: 36, inks: 12, grounds: 12 },
        starterWarning: null,
      },
      '/me/shards': { balance: 900 },
    });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /found a guild/i }));

    /** A designer that cannot be reached is a colour picker in a drawer. */
    expect(await screen.findByTestId('emblem-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ground 11' })).toBeInTheDocument();
  });

  it('renders the roster, and each member links to their profile', async () => {
    stubFetch({ '/me/guild': IN_A_GUILD });

    const viewed: string[] = [];
    render(
      <GuildScreen
        accountId="me"
        onViewProfile={(id) => viewed.push(id)}
        onUnauthenticated={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Kestrel' }));

    expect(
      viewed,
      'a roster that does not reach a profile makes the guild badge a dead end',
    ).toEqual(['other']);
  });
});

describe('the starter warning cannot be satisfied by half', () => {
  it('both boxes are required before founding is possible', async () => {
    stubFetch({
      '/me/guild': EMPTY,
      '/v1/guilds?q=': { guilds: [] },
      '/guilds/new': {
        cost: 650,
        capacity: 24,
        palette: { icons: 36, inks: 12, grounds: 12 },
        starterWarning: {
          endsBotOpponents: true,
          endsIncomeMultiplier: true,
          permanent: true,
        },
      },
      '/me/shards': { balance: 900 },
    });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /found a guild/i }));
    await userEvent.type(await screen.findByLabelText('Name'), 'Long Reach');

    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes, 'two losses, two boxes — one tick is not an acknowledgement of two')
      .toHaveLength(2);

    const found = screen.getByRole('button', { name: /found for 650/i });
    expect(found).toBeDisabled();

    await userEvent.click(boxes[0]!);
    expect(found, 'one of two acknowledgements must not be enough').toBeDisabled();

    await userEvent.click(boxes[1]!);
    expect(found).toBeEnabled();
  });

  it('names BOTH losses in words — opponents and income', async () => {
    stubFetch({
      '/me/guild': EMPTY,
      '/v1/guilds?q=': { guilds: [] },
      '/guilds/new': {
        cost: 650,
        capacity: 24,
        palette: { icons: 36, inks: 12, grounds: 12 },
        starterWarning: {
          endsBotOpponents: true,
          endsIncomeMultiplier: true,
          permanent: true,
        },
      },
      '/me/shards': { balance: 900 },
    });

    render(
      <GuildScreen accountId="me" onViewProfile={() => {}} onUnauthenticated={() => {}} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /found a guild/i }));

    /**
     * A player told only *"you'll leave the starter league"* has not been told
     * their income drops. Both, in words, or the warning has been lost a fourth
     * time.
     */
    expect(await screen.findByText(/opponents stop being beginners/i)).toBeInTheDocument();
    expect(screen.getByText(/shard income drops/i)).toBeInTheDocument();
    expect(screen.getByText(/no way back in/i)).toBeInTheDocument();
  });
});
