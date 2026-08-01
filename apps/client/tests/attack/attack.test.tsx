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
import { readWall } from '../../src/features/attack/analysis.js';

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
  /* Real ids, so `TypeSpread` resolves real Forces. Invented ones would be
     skipped and the strip would silently render nothing. */
  visibleHeroIds: getAllHeroes()
    .slice(i, i + 6)
    .map((h) => h.id),
  winDelta: 18,
  lossDelta: -12,
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

/**
 * A real formation, 2 front · 3 middle · 1 back.
 *
 * **The old fixture sent `seats: []` for every attack squad and no `heroes` key
 * at all**, which was fine while the chooser was three text radios and became a
 * lie the moment the dock drew six faces and scored a fit: every new assertion
 * would have run against an empty squad and passed. `/roster` serves both, so
 * the fixture serves both.
 */
const formationOf = (ids: readonly string[]) =>
  ids.map((heroId, i) => ({
    row: i < 2 ? 'front' : i < 5 ? 'middle' : 'back',
    index: i < 2 ? i : i < 5 ? i - 2 : 0,
    heroId,
  }));

const MY_SIX = HEROES.slice(9, 15).map((h) => h.id);
const MY_OTHER_SIX = HEROES.slice(15, 21).map((h) => h.id);

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
    { slot: 0, name: 'Vanguard', seats: formationOf(MY_SIX), complete: true, valid: true },
    {
      slot: 1,
      name: 'Second Wind',
      seats: formationOf(MY_OTHER_SIX),
      complete: true,
      valid: true,
    },
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
      /* Heroes as well as assignments — the dock resolves a seat's `heroId`
         through this list, and a roster without it draws six empty seats. */
      if (path.includes('/roster')) {
        return json(200, { heroes: HEROES, assignments: { offense } });
      }
      if (path.includes('/scout')) return json(scoutResponse.status, scoutResponse.body);
      if (method === 'POST' && path.endsWith('/battles')) {
        return json(startResponse.status, startResponse.body);
      }
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
      ...within(panel).getByRole('list', { name: 'Doors in this wall' }).querySelectorAll('li'),
    ].map((li) => li.textContent ?? '');
    expect(chips.length, 'no doors were offered for a full squad').toBeGreaterThan(0);

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
      const type = DAMAGE_TYPES.find((t) => chip.includes(t));
      expect(type, `a chip named no damage type: "${chip}"`).toBeDefined();

      const baneCount = banes.get(type!) ?? 0;
      if (baneCount === 0) {
        expect(chip, `${type!} has no banes here but the chip claims some`).not.toMatch(/bane/);
      } else {
        expect(chip, `${type!} was tallied wrong`).toContain(`${baneCount}× bane`);
      }
    }

    // Banes first, because a Bane is the ×1.50 and the only one worth building for.
    const most = Math.max(...banes.values());
    expect(chips[0]).toContain(`${most}× bane`);
  });

  /**
   * **The wall is a picture now, not a table.** Six portraits in seat order —
   * the shape of a formation is the thing a player reads here, and it was
   * previously rendered as six rows of prose.
   */
  it('draws the six standing champions as their portraits, in seat order', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const wall = within(await screen.findByLabelText('Standing six'));
    const seats = [...wall.getByRole('list', { name: 'Visible squad' }).querySelectorAll('li')];
    expect(seats).toHaveLength(6);

    // Front, front, middle, middle, middle, back — the fixed 2 · 3 · 1.
    expect(seats.map((li) => li.getAttribute('data-seat'))).toEqual([
      'front-0',
      'front-1',
      'middle-0',
      'middle-1',
      'middle-2',
      'back-0',
    ]);

    for (const id of SIX) {
      expect(
        wall.getByText(HEROES.find((h) => h.id === id)!.name),
        `${id} is not named on the wall`,
      ).toBeInTheDocument();
      expect(
        document.querySelector(`[data-hero-portrait="${id}"]`),
        `${id} has no portrait`,
      ).not.toBeNull();
    }
  });

  /**
   * **The seat says whether you have an answer for it.** A gold ring is one
   * channel; the word changes too, so the mark survives for a player who cannot
   * separate gold from the House colour behind it.
   */
  it('marks exactly the seats the chosen squad Banes', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const wall = await screen.findByLabelText('Standing six');
    const mine = new Set(
      MY_SIX.flatMap((id) => {
        const hero = HEROES.find((h) => h.id === id)!;
        return [hero.primary, hero.secondary];
      }),
    );

    for (const [i, id] of SIX.entries()) {
      const hero = HEROES.find((h) => h.id === id)!;
      const seat = wall.querySelectorAll('li')[i]!;
      const answered = mine.has(hero.bane);

      expect(seat.getAttribute('data-answered'), `${hero.name}`).toBe(String(answered));
      expect(seat.getAttribute('data-bane'), `${hero.name}`).toBe(hero.bane);

      /* The word changes as well as the ring, so the mark survives for a player
         who cannot separate gold from the House colour behind it. */
      expect(seat.textContent, `${hero.name}`).toContain(answered ? 'open' : 'bane');
      expect(seat.textContent, `${hero.name}`).toContain(hero.bane);
    }
  });

  /**
   * The scout route has served real stages since it was fixed, and nothing on
   * the client drew them — commitment was disclosed and thrown away.
   */
  it('draws the rune stages the payload sent, rather than three empty tracks', async () => {
    const staged = scoutOf('Player1', SIX);
    staged.visible.seats[0]!.runes = [
      { element: 'earth', stages: 4 },
      { element: 'fire', stages: 2 },
      { element: 'common', stages: 0 },
    ];
    scoutResponse = { status: 200, body: staged };

    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const wall = await screen.findByLabelText('Standing six');
    const pips = wall.querySelectorAll('li')[0]!.querySelectorAll('[data-rune-slot]');
    expect([...pips].map((p) => p.getAttribute('data-rune-stage'))).toEqual(['4', '2', '0']);
  });

  it('never renders the Hidden squad, only its streak', async () => {
    /**
     * **The absence of the field is the disclosure rule.** `ScoutView.hidden`
     * carries a streak and nothing else — an empty seats array would still tell
     * a scout the shape of what is missing — so there is nothing served here
     * that could render one.
     *
     * ### Six sealed placeholders are not a disclosure
     *
     * They are a **client-side constant**: every squad in the game is six
     * champions in 2 front · 3 middle · 1 back, which is on the squad screen and
     * in every battle the player has fought. What this asserts is the thing that
     * would be a leak — that no champion, from the sealed zone or anywhere else,
     * is named or pictured inside it.
     */
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const panel = await screen.findByLabelText('Scouting Player1');
    const sealed = within(panel).getByLabelText('Hidden six');

    // The streak IS disclosed — it is the one fact the payload carries.
    expect(within(sealed).getByText('×9')).toBeInTheDocument();

    const seats = within(sealed).getByLabelText('Sealed seats').querySelectorAll('li');
    expect(seats).toHaveLength(6);

    /**
     * **Nothing inside the sealed zone identifies anybody.** Checked against
     * all 27 rather than against the six we happen to know, because the leak
     * this guards against is a component reaching for a hero list it should not
     * have — and it would not politely reach for the same six.
     */
    for (const hero of HEROES) {
      expect(within(sealed).queryByText(hero.name), `${hero.name} leaked`).toBeNull();
    }
    expect(sealed.querySelector('[data-hero-portrait]'), 'a portrait leaked').toBeNull();
    expect(sealed.querySelector('[data-hero-marks]'), 'an emblem leaked').toBeNull();
    expect(sealed.querySelector('[data-rune-slot]'), 'a rune stage leaked').toBeNull();

    // And the champions named in the panel are exactly the six Visible ones.
    for (const id of SIX) {
      expect(within(panel).getByText(HEROES.find((h) => h.id === id)!.name)).toBeInTheDocument();
    }
    expect(within(panel).queryByText(HEROES[6]!.name)).toBeNull();
  });

  it('states the ambush odds as served, and never multiplies the streak itself', async () => {
    /**
     * SC-008 greps this app for `2` and `90` as literals for the same reason:
     * the odds are served precisely so a tuning change is not a Steam update.
     * Here the streak is 7 and the chance is 14 — which *is* 7 × 2, so a client
     * doing the arithmetic would look right. Changing the served chance to a
     * number the streak cannot produce is what tells them apart.
     */
    candidateList = { ...(candidateList as object), ambushChance: 37, consecutiveWins: 7 };
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const sealed = within(await screen.findByLabelText('Hidden six'));
    expect(sealed.getAllByText('37%').length).toBeGreaterThan(0);
    expect(sealed.queryByText('14%'), 'the client computed the odds').toBeNull();
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

  /**
   * **The dock draws the squads rather than naming them.** Three attack squads
   * named weeks ago are three strings a player no longer connects to six
   * champions — so the choice was being made blind on the screen where it is
   * the whole decision.
   */
  it('draws each ready squad as its six faces, scored against this wall', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await screen.findByRole('button', { name: /Attack Player1/ });

    const dock = within(screen.getByRole('radiogroup', { name: 'Attack squad' }));
    const vanguard = dock.getByRole('radio', { name: 'Vanguard' });

    // Six thumbs, and they are this squad's six.
    const thumbs = [...vanguard.querySelectorAll('[data-thumb]')].map((t) =>
      t.getAttribute('data-thumb'),
    );
    expect(thumbs).toEqual(MY_SIX);

    /**
     * The fit is computed from the wall on screen, so it must agree with
     * `readWall` — asserted against the function rather than against a word,
     * which would drift the moment either the thresholds or the roster moved.
     */
    const expected = readWall(
      (scoutOf('Player1', SIX).visible.seats as unknown) as Parameters<typeof readWall>[0],
      MY_SIX.map((id) => HEROES.find((h) => h.id === id)!),
    );
    expect(vanguard.querySelector('[data-fit]')?.getAttribute('data-fit')).toBe(expected.verdict);
    expect(vanguard.textContent).toContain(`${expected.unanswered} unanswered`);
  });

  it('draws an empty seat for a squad short of six, rather than five thumbs', async () => {
    /* A squad our own eviction rule emptied is the likeliest short one, and
       "this squad is short" is exactly the fact that decides whether it can
       attack — five thumbs and six thumbs differ only in width otherwise. */
    offense = [
      {
        slot: 0,
        name: 'Vanguard',
        seats: formationOf(MY_SIX.slice(0, 5)),
        complete: true,
        valid: true,
      },
    ];
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await screen.findByRole('button', { name: /Attack Player1/ });

    const card = screen.getByRole('radio', { name: 'Vanguard' });
    const thumbs = [...card.querySelectorAll('[data-thumb]')];
    expect(thumbs).toHaveLength(6);
    expect(thumbs[5]!.getAttribute('data-thumb')).toBe('');
  });

  it('reads the wall against your six, and lists both halves', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );

    const readout = within(await screen.findByLabelText('Scout readout'));
    const expected = readWall(
      (scoutOf('Player1', SIX).visible.seats as unknown) as Parameters<typeof readWall>[0],
      MY_SIX.map((id) => HEROES.find((h) => h.id === id)!),
    );

    const opens = [
      ...readout.getByRole('list', { name: 'Doors you can open' }).querySelectorAll('[data-opens]'),
    ].map((li) => li.getAttribute('data-opens'));
    expect(opens).toEqual(expected.opens.map((o) => o.type));

    const resisted = [
      ...readout
        .getByRole('list', { name: 'Walls you cannot move' })
        .querySelectorAll('[data-resisted]'),
    ].map((li) => li.getAttribute('data-resisted'));
    expect(resisted).toEqual(expected.resisted.map((r) => r.type));

    /* The second column is the one people skip, and it must not be empty just
       because the first one is full. */
    expect(
      expected.opens.length + expected.resisted.length,
      'the readout had nothing to say either way',
    ).toBeGreaterThan(0);
  });

  it('re-reads the wall when the squad changes, not only when the opponent does', async () => {
    await ready();
    await userEvent.click(
      within(screen.getByLabelText('Opponents')).getByRole('button', { name: /Player1/ }),
    );
    await screen.findByRole('button', { name: /Attack Player1/ });

    const seats = (scoutOf('Player1', SIX).visible.seats as unknown) as Parameters<
      typeof readWall
    >[0];
    const first = readWall(seats, MY_SIX.map((id) => HEROES.find((h) => h.id === id)!));
    const second = readWall(seats, MY_OTHER_SIX.map((id) => HEROES.find((h) => h.id === id)!));

    const doorsNow = () =>
      [
        ...within(screen.getByLabelText('Scout readout'))
          .getByRole('list', { name: 'Doors you can open' })
          .querySelectorAll('[data-opens]'),
      ].map((li) => li.getAttribute('data-opens'));

    expect(doorsNow()).toEqual(first.opens.map((o) => o.type));

    await userEvent.click(screen.getByRole('radio', { name: 'Second Wind' }));
    expect(doorsNow()).toEqual(second.opens.map((o) => o.type));

    /* If both squads happened to read identically the assertion above would
       hold with the readout frozen. */
    expect(
      first.opens.map((o) => o.type).join() !== second.opens.map((o) => o.type).join(),
      'both squads read identically, so switching proves nothing',
    ).toBe(true);
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
