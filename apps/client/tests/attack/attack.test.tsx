/**
 * Choosing an opponent and starting a battle (006 T065–T068).
 *
 * ### Three routes, no callers, for up to three features
 *
 * `GET /v1/matchmaking/candidates` (009), `GET /v1/players/:targetId/scout` (006)
 * and `POST /v1/battles` (007) were each shipped with tests and **none of them was
 * ever called by the client**. The consequence was not a bug report: it was that
 * the game could not be played. `ResumeBattle.tsx` recorded the reason — *"there is
 * no 'attack' button yet: choosing an opponent needs the candidate set, which is
 * feature 009"* — and 009 shipped.
 *
 * ### What is asserted, and why each one is a rule rather than a preference
 *
 * | Claim | Why it matters |
 * |---|---|
 * | the whole candidate list is rendered | there is no slate and no rotation; restricting *who* you may attack restricts the playing |
 * | no `zone` is sent | the server reads it from the attack streak; a client that sent one would be ignored |
 * | the ambush chance is displayed, never computed | it is served precisely so a tuning change is not a Steam update |
 * | only a complete, valid squad may attack | a squad our eviction rule emptied would otherwise lose a battle the game caused |
 * | the Hidden squad is never rendered | the scout payload has no seats for it, and an empty list still leaks the shape |
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DAMAGE_TYPES, getAllHeroes } from '@lmntlz/content';
import { AttackScreen } from '../../src/features/attack/AttackScreen.js';

const HEROES = getAllHeroes();

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[];
let candidateList: unknown;
let standing: unknown;
let offense: unknown;
let scoutResponse: { status: number; body: unknown };
let startResponse: { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const candidate = (i: number, over: Record<string, unknown> = {}) => ({
  playerId: `acc_${i}`,
  username: `Player${i}`,
  isBot: false,
  rating: 1200 - i * 10,
  visibleHoldStreak: i,
  hiddenHoldStreak: i * 2,
  ...over,
});

/** A scout payload built from real champions, so Bane and Fault are the real ones. */
const scoutOf = (username: string, ids: readonly string[]) => ({
  playerId: 'acc_1',
  username,
  league: 'bronze',
  visible: {
    holdStreak: 4,
    canDefend: true,
    seats: ids.map((id, i) => {
      const hero = HEROES.find((h) => h.id === id)!;
      return {
        row: i < 2 ? 'front' : i < 5 ? 'middle' : 'back',
        index: i < 2 ? i : i < 5 ? i - 2 : 0,
        hero: {
          id: hero.id,
          name: hero.name,
          primary: hero.primary,
          secondary: hero.secondary,
          bane: hero.bane,
          fault: hero.fault,
          role: hero.role,
          reach: hero.reach,
        },
        runes: [
          { element: hero.primary, stages: 0 },
          { element: hero.secondary, stages: 0 },
          { element: 'common', stages: 0 },
        ],
      };
    }),
  },
  // The streak and nothing else. No seats key, deliberately.
  hidden: { holdStreak: 9 },
});

const SIX = HEROES.slice(0, 6).map((h) => h.id);

beforeEach(() => {
  calls = [];
  candidateList = {
    league: 'bronze',
    positionInLeague: 0.4,
    gearScore: 1500,
    widened: false,
    candidates: [candidate(1), candidate(2), candidate(3, { isBot: true })],
    ambushChance: 14,
    consecutiveWins: 7,
  };
  standing = {
    league: 'bronze',
    gearScore: 1500,
    positionInLeague: 0.4,
    rating: 1000,
    ratedBattles: 3,
    band: 'provisional',
    ambushChance: 14,
    consecutiveWins: 7,
    starter: { active: false, reason: 'time' },
  };
  offense = [
    { slot: 0, name: 'Vanguard', seats: [], complete: true, valid: true },
    { slot: 1, name: 'Second Wind', seats: [], complete: true, valid: true },
    { slot: 2, name: null, seats: [], complete: false, valid: true },
  ];
  scoutResponse = { status: 200, body: scoutOf('Player1', SIX) };
  startResponse = {
    status: 201,
    body: {
      battleId: 'b_1',
      zone: 'visible',
      ambushed: false,
      sequence: 0,
      packet: { events: [], state: { squads: [] }, conclusion: null },
    },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (path.includes('/matchmaking/candidates')) return json(200, candidateList);
      if (path.includes('/me/standing')) return json(200, standing);
      if (path.includes('/roster')) return json(200, { assignments: { offense } });
      if (path.includes('/scout')) return json(scoutResponse.status, scoutResponse.body);
      if (method === 'POST' && path.endsWith('/battles')) {
        return json(startResponse.status, startResponse.body);
      }
      throw new Error(`unstubbed request: ${method} ${path}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const starts = () => calls.filter((c) => c.method === 'POST' && c.path.endsWith('/battles'));

async function ready(onStarted = () => {}) {
  render(<AttackScreen onBattleStarted={onStarted} />);
  await waitFor(() => expect(screen.getByLabelText('Opponents')).toBeInTheDocument());
}

describe('the opponent list', () => {
  it('renders every candidate the server sent, whole', async () => {
    /**
     * **No slate, no rotation, no page.** `candidates()` takes one argument on
     * purpose: a rule restricting who you may attack restricts the playing itself,
     * and the economy already bounds what volume pays.
     */
    await ready();

    const list = within(screen.getByLabelText('Opponents'));
    expect(list.getAllByRole('button')).toHaveLength(3);
    expect(list.getByRole('button', { name: /Player1/ })).toBeInTheDocument();
    expect(list.getByRole('button', { name: /Player3/ })).toBeInTheDocument();
  });

  it('says which candidates are bots', async () => {
    // Not a lesser opponent — the starter league is bots and Bronze is padded with
    // them by design. It is disclosed because a hold against a bot and a hold
    // against a person are different facts.
    await ready();
    expect(within(screen.getByLabelText('Opponents')).getByText('bot')).toBeInTheDocument();
  });

  it('shows the ambush chance as served, and does no arithmetic on it', async () => {
    await ready();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText(/7 wins in a row/)).toBeInTheDocument();
  });

  it('discloses a widened match, because it breaks a stated promise', async () => {
    candidateList = { ...(candidateList as object), widened: true };
    await ready();
    expect(screen.getByText(/reaches a band either side/)).toBeInTheDocument();
  });

  it('says so when the league is empty rather than showing nothing', async () => {
    candidateList = { ...(candidateList as object), candidates: [] };
    await ready();
    expect(screen.getByText(/Nobody in your league has a full Visible squad/)).toBeInTheDocument();
  });

  it('names the starter league, since every opponent in it is authored', async () => {
    standing = { ...(standing as object), starter: { active: true, endsAt: '2026-08-05' } };
    await ready();
    expect(screen.getByText(/every opponent here is an authored bot/i)).toBeInTheDocument();
  });
});

describe('scouting an opponent', () => {
  it('fetches the scout view for the player picked, and nobody else', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player2/ }),
    );

    await waitFor(() =>
      expect(calls.filter((c) => c.path.includes('/scout'))).toHaveLength(1),
    );
    expect(calls.find((c) => c.path.includes('/scout'))!.path).toContain('/players/acc_2/scout');
  });

  it('counts what answers the squad, which is the whole point of scouting', async () => {
    /**
     * **The counting is the feature, not the six names.** Bane and Fault are a pure
     * function of two authored types, so a scout could work them out from the Codex
     * — but doing it by eye across six champions and nine types is the sort of
     * arithmetic that makes people not bother, and the game is counter-building.
     */
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const panel = await screen.findByLabelText('Scouting Player1');
    expect(within(panel).getByText(/What answers this squad/)).toBeInTheDocument();

    /**
     * **Compared against a tally computed from the payload, not against literals.**
     * A hard-coded "3 banes of air" would keep passing after the roster's authored
     * types changed and would then be asserting a count nothing produces.
     */
    const banes = new Map<string, number>();
    for (const id of SIX) {
      const hero = HEROES.find((h) => h.id === id)!;
      banes.set(hero.bane, (banes.get(hero.bane) ?? 0) + 1);
    }

    const chips = [
      ...within(panel)
        .getByRole('list', { name: 'What answers this squad' })
        .querySelectorAll('li'),
    ].map((li) => li.textContent ?? '');
    expect(chips.length, 'no answers were offered for a full squad').toBeGreaterThan(0);

    /**
     * ### The version of this that a mutant walked straight through
     *
     * The first draft identified each chip's type by searching **the bane map's own
     * keys** and skipped anything it did not find. This fixture's banes are only
     * `air` and `earth`, so the two fault-only chips were skipped — and a deliberate
     * bug that folded fault counts into the bane tally passed all sixteen tests. The
     * `continue` was the hole: it made the loop silently assert nothing about
     * exactly the chips the bug changed.
     *
     * Identified from **all nine types** instead, so every rendered chip is checked.
     */
    for (const chip of chips) {
      // The type is uppercased in CSS, so the text node itself is lowercase.
      const type = DAMAGE_TYPES.find((t) => chip.startsWith(t));
      expect(type, `a chip named no damage type: "${chip}"`).toBeDefined();

      const baneCount = banes.get(type!) ?? 0;
      if (baneCount === 0) {
        expect(chip, `${type!} has no banes here but the chip claims some`).not.toMatch(/bane/);
      } else {
        expect(chip, `${type!} was tallied wrong`).toContain(
          `${baneCount} bane${baneCount === 1 ? '' : 's'}`,
        );
      }
    }

    // Banes first, because a Bane is the ×1.50 and the only one worth building for.
    const most = Math.max(...banes.values());
    expect(chips[0]).toContain(`${most} bane`);
  });

  it('never renders the Hidden squad, only its streak', async () => {
    /**
     * **The absence of the field is the disclosure rule.** The payload has no seats
     * for the Hidden zone at all — an empty array would still tell a scout the shape
     * of what is missing — so there is nothing here that could render one.
     */
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const panel = await screen.findByLabelText('Scouting Player1');
    expect(within(panel).getByText(/9 hidden/)).toBeInTheDocument();

    // The champions rendered are exactly the six Visible ones, and no more.
    for (const id of SIX) {
      expect(within(panel).getByText(HEROES.find((h) => h.id === id)!.name)).toBeInTheDocument();
    }
    expect(within(panel).queryByText(HEROES[6]!.name)).toBeNull();
  });

  it('keeps the list usable when a scout fails', async () => {
    scoutResponse = { status: 500, body: { error: { code: 'oops', message: 'Scout failed.' } } };
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/Scout failed/);
    expect(screen.getByLabelText('Opponents')).toBeInTheDocument();
  });
});

describe('starting the battle', () => {
  it('POSTs the opponent and the squad slot, and no zone', async () => {
    /**
     * **`zone` is the server's decision and there is no code path that reads one
     * from the body.** A client that sent one would be ignored, which is enforcement
     * by absence — so the absence is what is asserted.
     */
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Attack Player1/ }));

    await waitFor(() => expect(starts()).toHaveLength(1));
    const body = starts()[0]!.body as Record<string, unknown>;

    expect(body['opponentId']).toBe('acc_1');
    expect(body['attackSquadSlot']).toBe(0);
    expect('zone' in body, 'the client tried to choose the zone').toBe(false);
  });

  it('sends the squad the player picked', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Second Wind' }));
    await userEvent.click(screen.getByRole('button', { name: /Attack Player1/ }));

    await waitFor(() => expect(starts()).toHaveLength(1));
    expect((starts()[0]!.body as Record<string, unknown>)['attackSquadSlot']).toBe(1);
  });

  it('offers only squads that are six and valid', async () => {
    /**
     * SC-009. The likeliest reason a squad is short is **our own eviction rule**, so
     * a battle fought five-strong would be a loss the game caused and the player
     * could not see coming.
     */
    offense = [
      { slot: 0, name: 'Vanguard', seats: [], complete: true, valid: true },
      { slot: 1, name: 'Broken', seats: [], complete: false, valid: false },
      { slot: 2, name: 'Short', seats: [], complete: false, valid: true },
    ];
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await screen.findByRole('button', { name: /Attack Player1/ });

    // Exactly one squad is eligible, so no chooser appears at all.
    expect(screen.queryByRole('radio', { name: 'Broken' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Short' })).toBeNull();
  });

  it('refuses to offer an attack at all when no squad is ready', async () => {
    offense = [{ slot: 0, name: 'Broken', seats: [], complete: false, valid: false }];
    await ready();

    expect(screen.getByText(/None of your attack squads is ready/)).toBeInTheDocument();
  });

  it('hands the started battle upward rather than navigating itself', async () => {
    const started = vi.fn();
    await ready(started);
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Attack Player1/ }));

    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
    expect(started.mock.calls[0]![0]).toMatchObject({ battleId: 'b_1', zone: 'visible' });
  });

  it('reports a refused start and keeps the list', async () => {
    startResponse = {
      status: 409,
      body: {
        error: { code: 'battle_already_open', message: 'You are already in a battle.' },
        openBattleId: 'b_0',
      },
    };
    const started = vi.fn();
    await ready(started);
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Attack Player1/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in a battle/);
    expect(started).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Opponents')).toBeInTheDocument();
  });
});
