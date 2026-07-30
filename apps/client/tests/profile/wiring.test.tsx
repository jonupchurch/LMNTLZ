/**
 * **The wires** (012 T044).
 *
 * ### TL;DR
 *
 * Feature 012 built a profile, an export and an avatar picker, and the API
 * routes behind all three. This file asserts the one thing no task list ever
 * writes down: **that something actually calls them.**
 *
 * ### Why a whole file for it
 *
 * Six times in this project something has been built, unit-tested, committed and
 * never invoked — and not once did it announce itself. The receipt email in
 * feature 011 could not have sent a single message; feature 006's squad save was
 * never called, so a player arranged a squad, reloaded, and it was gone. Every
 * gate was green each time, because *"is it called?"* was not a claim anybody had
 * written down as testable.
 *
 * It is testable. Each assertion here dies when its wire is cut, and each one was
 * checked that way rather than assumed.
 *
 * | Wire | Cut it by |
 * |---|---|
 * | the profile fetch | deleting the `api()` call in `ProfileScreen` |
 * | the shard balance | dropping `/me/shards` from `loadOwn` |
 * | the avatar state | dropping `/me/avatar` from `loadOwn` |
 * | the export | removing the `apiText` call in `ExportPanel` |
 * | the rename | removing the `PUT /me/username` in `RenamePanel` |
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllHeroes } from '@lmntlz/content';
import { ProfileScreen } from '../../src/features/profile/ProfileScreen.js';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SELF = 'acc_self';

const profileBody = {
  playerId: SELF,
  username: 'Reyna',
  avatar: { kind: 'curated', value: 'fire' },
  accountAgeDays: 214,
  league: 'gold',
  rating: 1412,
  gearScore: 4180,
  holdStreaks: { visible: 14, hidden: 3 },
  guild: null,
  recentBattles: [
    {
      battleId: 'btl_1',
      concludedOn: '2026-07-27',
      role: 'attacker',
      opponent: 'Opponent Zed',
      opponentWasBot: false,
      outcome: 'win',
      turnCount: 96,
    },
  ],
};

const shardsBody = {
  balance: 4321,
  lifetimeEarned: 9000,
  rating: 1412,
  cap: { shards: 6500, runes: 10 },
};

const avatarBody = {
  curated: ['earth', 'air', 'fire', 'water'],
  current: { kind: 'curated', value: 'fire' },
  customPrice: { shards: 1350, cents: 500 },
  customAvailable: false,
};

beforeEach(() => {
  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (path.includes('/profile')) return json(200, profileBody);
      if (path.includes('/me/shards')) return json(200, shardsBody);
      if (path.includes('/me/export')) {
        return new Response('battleId,concludedAt\r\nbtl_1,2026-07-27T00:00:00.000Z', {
          status: 200,
          headers: { 'content-type': 'text/csv' },
        });
      }
      if (path.includes('/me/avatar')) {
        return json(200, method === 'PUT' ? { current: { kind: 'curated', value: 'air' } } : avatarBody);
      }
      if (path.includes('/me/username')) {
        return json(200, { username: 'Nyx', shardsCharged: 325, changesRemaining: 1 });
      }
      throw new Error(`unstubbed request: ${method} ${path}`);
    }),
  );

  // jsdom has no object URLs and no real downloads.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:stub'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const requested = (fragment: string): Call[] => calls.filter((c) => c.path.includes(fragment));

/**
 * **The fixture must not name a real hero, and this is why it says so out loud.**
 *
 * The opponent in `profileBody` was originally "Vantric", which is champion
 * `h22`. The roster scan below duly failed — correctly — and the failure read as
 * *"a hero is rendered on a profile"* when the truth was *"the fixture picked a
 * hero's name for a player"*. Ten minutes to diagnose the second time would be
 * ten minutes wasted, so it is checked here instead.
 */
describe('the fixture itself', () => {
  it('uses no real hero name, so the roster scan means what it says', () => {
    const heroNames = new Set(getAllHeroes().map((h) => h.name));

    for (const name of [profileBody.username, profileBody.recentBattles[0]!.opponent]) {
      expect(heroNames.has(name), `fixture name "${name}" is a real champion`).toBe(false);
    }
  });
});

describe('the profile screen calls the API (T039, T043)', () => {
  it('requests the profile — without this the route has no client caller at all', async () => {
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await screen.findByRole('heading', { name: 'Reyna' });

    expect(
      requested(`/players/${SELF}/profile`),
      'ProfileScreen must request GET /v1/players/:targetId/profile. Zero ' +
        'calls means the screen renders whatever it was handed and the route ' +
        'is dead code.',
    ).toHaveLength(1);
  });

  it('requests the shard balance — the first client call to any progression route', async () => {
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await waitFor(() => expect(requested('/me/shards')).toHaveLength(1));
    expect(await screen.findByText('4,321')).toBeInTheDocument();
  });

  it('requests the avatar state and renders the curated set', async () => {
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await waitFor(() => expect(requested('/me/avatar')).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'Fire' })).toBeInTheDocument();
  });

  it('renders the battle record it was given', async () => {
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    expect(await screen.findByText('Opponent Zed')).toBeInTheDocument();
    expect(screen.getByText('2026-07-27')).toBeInTheDocument();
  });

  it("shows no own-account controls on somebody else's profile", async () => {
    render(<ProfileScreen targetId="acc_other" isSelf={false} onUnauthenticated={() => {}} />);

    await screen.findByRole('heading', { name: 'Reyna' });

    expect(screen.queryByRole('button', { name: /export my data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change name/i })).not.toBeInTheDocument();
    expect(requested('/me/shards')).toHaveLength(0);
  });
});

describe('the export is reachable (T041)', () => {
  it('requests the CSV when the button is pressed', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /export my data/i }));

    await waitFor(() =>
      expect(
        requested('/me/export'),
        'A download nobody can trigger is not an export.',
      ).toHaveLength(1),
    );
  });
});

describe('the identity controls are reachable (T042)', () => {
  it('sends a rename', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await user.type(await screen.findByRole('textbox'), 'Nyx');
    await user.click(screen.getByRole('button', { name: /change name/i }));

    await waitFor(() => expect(requested('/me/username')).toHaveLength(1));
    expect(requested('/me/username')[0]).toMatchObject({
      method: 'PUT',
      body: { username: 'Nyx' },
    });
  });

  it('sends an avatar choice', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Air' }));

    await waitFor(() =>
      expect(requested('/me/avatar').filter((c) => c.method === 'PUT')).toHaveLength(1),
    );
  });

  it('offers no custom upload while the review queue does not exist', async () => {
    render(<ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />);

    const custom = await screen.findByRole('button', { name: /custom images/i });
    expect(custom).toBeDisabled();
  });
});

describe('the disclosure rules survive the client (SC-001)', () => {
  /**
   * **Asserted against data, not against prose.**
   *
   * The first version of this searched the rendered text for the words `squad`,
   * `seat`, `front`, `middle` and `back` — and failed, because `ExportPanel`'s
   * own copy reads *"No squad compositions — not yours, not anyone's"*. A scan
   * that matches the sentence explaining the rule can never distinguish the
   * explanation from a violation, and softening it to pass would have left it
   * asserting nothing.
   *
   * So the claim is made where it is falsifiable: **no hero appears**, by id or
   * by name, across the whole roster.
   */
  it('renders no hero from the roster — no composition reaches this screen', async () => {
    const { container } = render(
      <ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />,
    );

    await screen.findByRole('heading', { name: 'Reyna' });
    const text = container.textContent ?? '';

    for (const hero of getAllHeroes()) {
      expect(text, `hero "${hero.name}" is rendered on a profile`).not.toContain(hero.name);
      expect(text, `hero id "${hero.id}" is rendered on a profile`).not.toContain(hero.id);
    }
  });

  it('mentions the Hidden zone only as a hold streak', async () => {
    const { container } = render(
      <ProfileScreen targetId={SELF} isSelf onUnauthenticated={() => {}} />,
    );

    await screen.findByRole('heading', { name: 'Reyna' });
    const text = container.textContent ?? '';

    // The one permitted mention, and it is a count of holds.
    expect(text).toContain('Hidden hold');
    expect(text).not.toMatch(/hidden battle|hidden squad/i);
  });
});
