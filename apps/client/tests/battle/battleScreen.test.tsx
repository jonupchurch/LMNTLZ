/**
 * The battle screen renders the packet and decides nothing (007 T028, FR-004).
 *
 * ### Two claims, and they pull in opposite directions
 *
 * **The server decides.** No damage is computed here, no hit is rolled here, and
 * the board that gets rendered after a move is the one the response carried —
 * not one this file derived by applying the move itself.
 *
 * **But the client must offer exactly what the server will accept.** That is
 * computed locally, from `@lmntlz/sim/rules`, which is the same module
 * `assertLegalIntent` refuses with. Offering a move the server rejects makes the
 * game look broken; hiding a legal one is worse, because a player who never sees
 * an option never reports its absence.
 *
 * The tests below assert both halves: one request per choice, and the offered
 * set equal to the rules' own answer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getHero } from '@lmntlz/content';
import { availablePowers, legalTargets } from '@lmntlz/sim/rules';
import { BattleScreen } from '../../src/features/battle/BattleScreen.js';
import { setSessionToken } from '../../src/lib/api.js';
import { board, started } from './fixtures.js';

let calls: { url: string; init: RequestInit }[];

/** Answer with whatever the test needs, and record every call. */
function stubFetch(reply: (url: string) => { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const { status, body } = reply(url);
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

beforeEach(() => {
  setSessionToken('test-session');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionToken(null);
});

const nameOf = (heroId: string) => getHero(heroId).name;

describe('what the screen offers', () => {
  it('offers exactly the powers the shared rules call usable', () => {
    stubFetch(() => ({ status: 200, body: {} }));

    const state = board();
    const up = state.turnOfInstance!;
    const expected = availablePowers(state, up)
      .filter((p) => legalTargets(state, up, p.id).candidates.length > 0)
      .map((p) => p.name);

    render(<BattleScreen started={started()} />);

    /**
     * **Set equality, not containment.** A screen that offered every power the
     * hero owns — cooldowns, tier gates and reach ignored — contains the right
     * answer and is wrong, and the player finds out by having a move refused.
     * Scoped to the move panel so the board's target buttons are not counted.
     */
    /**
     * **Identified by `data-power`, not by the button's text.** A power card
     * carries its Force, tier and cooldown as well as its name now, so reading
     * `textContent` compared `Root and HoldT11 turn` against `Root and Hold`
     * and failed on a rewording rather than on a wrong set.
     */
    const panel = screen.getByRole('region', { name: 'Your move' });
    const offered = [...panel.querySelectorAll('[data-power]')].map(
      (b) => b.getAttribute('data-power') ?? '',
    );

    expect(expected.length).toBeGreaterThan(0);
    expect([...offered].sort()).toEqual([...expected].sort());
  });

  it('marks only the legal targets as targetable', () => {
    stubFetch(() => ({ status: 200, body: {} }));

    const state = board();
    const up = state.turnOfInstance!;
    const chosen = availablePowers(state, up).filter(
      (p) => legalTargets(state, up, p.id).candidates.length > 0,
    )[0]!;
    const legal = new Set(legalTargets(state, up, chosen.id).candidates);

    render(<BattleScreen started={started()} />);

    for (const hero of state.heroes) {
      const button = screen.getByRole('button', {
        name: new RegExp(`^${nameOf(hero.heroId)},`),
      });
      expect(
        (button.getAttribute('aria-label') ?? '').includes('targetable'),
        `${hero.instanceId} targetable state`,
      ).toBe(legal.has(hero.instanceId));
    }

    expect(legal.size).toBeGreaterThan(0);
  });
});

describe('one request per choice', () => {
  it('sends exactly one act and renders the board the response carried', async () => {
    const base = board('a-front-1');
    const after = {
      ...base,
      heroes: base.heroes.map((h) => (h.instanceId === 'd-front-0' ? { ...h, hp: 1 } : h)),
    };

    stubFetch(() => ({
      status: 200,
      body: {
        sequence: 0,
        packet: { events: [], state: after, conclusion: null },
        nextSequence: 1,
      },
    }));

    const state = board();
    const up = state.turnOfInstance!;
    const target = legalTargets(
      state,
      up,
      availablePowers(state, up).filter(
        (p) => legalTargets(state, up, p.id).candidates.length > 0,
      )[0]!.id,
    ).candidates[0]!;

    render(<BattleScreen started={started()} />);

    const victim = state.heroes.find((h) => h.instanceId === target)!;
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(victim.heroId)},`) }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toContain('/battles/btl-test/act');
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      sequence: 0,
      actorInstanceId: up,
      targetInstanceId: target,
    });

    /**
     * **The board came from the response, not from applying the move here.**
     * The stub says the target is on 1 HP, which no local arithmetic would
     * produce — so seeing it is proof the render is the server's answer.
     */
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: new RegExp(`^${nameOf(victim.heroId)},`) })
          .getAttribute('aria-label'),
      ).toContain('1 of'),
    );
  });

  it('resynchronises on a 409 instead of showing the player an error', async () => {
    /**
     * **A `409` means the two sides disagree about history, and the client can
     * fix that alone.** State is re-derived from the log on every call, so a
     * re-read is a complete repair — surfacing it as an error would ask the
     * player to do something about a desync they cannot see and did not cause.
     */
    const resynced = board('a-middle-0');

    stubFetch((url) =>
      url.includes('/act')
        ? { status: 409, body: { error: { code: 'sequence_gap', message: 'behind' }, currentSequence: 4 } }
        : {
            status: 200,
            body: {
              battleId: 'btl-test',
              zone: 'visible',
              sequence: 4,
              state: resynced,
              conclusion: null,
              startedAt: '2026-07-29T00:00:00Z',
              concludedAt: null,
            },
          },
    );

    const state = board();
    const up = state.turnOfInstance!;
    const target = legalTargets(
      state,
      up,
      availablePowers(state, up).filter(
        (p) => legalTargets(state, up, p.id).candidates.length > 0,
      )[0]!.id,
    ).candidates[0]!;
    const victim = state.heroes.find((h) => h.instanceId === target)!;

    render(<BattleScreen started={started()} />);
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(victim.heroId)},`) }),
    );

    // The act, then the re-read. Two calls, no error shown.
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.url).toMatch(/\/battles\/btl-test$/);
    expect(screen.queryByRole('alert')).toBeNull();

    /**
     * **The re-read replaced the board, not just the sequence.** The resynced
     * state puts a different champion up, and the move panel names whoever is
     * up — so this is the visible proof that the client adopted the server's
     * version rather than carrying on with its own.
     */
    const upNow = resynced.heroes.find((h) => h.instanceId === resynced.turnOfInstance)!;
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Your move' }).textContent).toContain(
        nameOf(upNow.heroId),
      ),
    );

    /**
     * **And the powers on offer are that champion's**, which the name alone
     * does not prove — a panel that redrew its heading from the new state while
     * still offering the old actor's powers would satisfy the line above.
     */
    const theirs = new Set(
      availablePowers(resynced, resynced.turnOfInstance!).map((p) => p.id),
    );
    const shown = [
      ...screen.getByRole('region', { name: 'Your move' }).querySelectorAll('[data-power]'),
    ].map((el) => el.getAttribute('data-power'));
    expect(shown.length).toBeGreaterThan(0);
    for (const id of shown) {
      expect(theirs.has(id!), `${id} does not belong to ${nameOf(upNow.heroId)}`).toBe(true);
    }
  });
});

describe('the conclusion', () => {
  it('shows the result and stops asking for moves', () => {
    stubFetch(() => ({ status: 200, body: {} }));

    render(
      <BattleScreen
        started={started({
          packet: {
            events: [],
            state: board(null),
            conclusion: { winner: 'attacker', reason: 'wipe' },
          },
        })}
      />,
    );

    expect(screen.getByRole('region', { name: 'Result' })).toBeTruthy();
    expect(screen.getByText(/victory/i)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your move' })).toBeNull();
  });

  it('reports the conclusion upward exactly once', async () => {
    const onConcluded = vi.fn();
    const ended = board(null);

    stubFetch(() => ({
      status: 200,
      body: {
        sequence: 0,
        packet: {
          events: [],
          state: ended,
          conclusion: { winner: 'defender', reason: 'wipe' },
        },
        nextSequence: 1,
      },
    }));

    const state = board();
    const up = state.turnOfInstance!;
    const target = legalTargets(
      state,
      up,
      availablePowers(state, up).filter(
        (p) => legalTargets(state, up, p.id).candidates.length > 0,
      )[0]!.id,
    ).candidates[0]!;
    const victim = state.heroes.find((h) => h.instanceId === target)!;

    render(<BattleScreen started={started()} onConcluded={onConcluded} />);
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${nameOf(victim.heroId)},`) }),
    );

    await waitFor(() => expect(onConcluded).toHaveBeenCalledTimes(1));
    expect(onConcluded).toHaveBeenCalledWith({ winner: 'defender', reason: 'wipe' });
    expect(screen.getByText(/defeat/i)).toBeTruthy();
  });
});

/**
 * **Reported from live play, 2026-08-01**: *"I think I got my first ambush, but
 * there's no notification that it's an ambush other than the different squad."*
 *
 * The two tests that used to live here passed the whole time. They asserted
 * `getByText(/ambushed/i)` against a 12px caption tucked under a heading that
 * already read **HIDDEN ZONE** — present in the DOM, invisible on the screen.
 * That is the shape of assertion this project keeps relearning: *it says the
 * word* is not *the player is told*.
 *
 * So these pin the things that carry the announcement instead — that it is its
 * own region, that it states what the fight is worth, and that the numbers are
 * the server's.
 */
describe('an ambush is announced', () => {
  const SHARDS = {
    balance: 0,
    config: { hiddenMultiplier: 3, hiddenRatingMultiplier: 7 },
  };

  it('gives the ambush a region of its own, not a line under the zone heading', async () => {
    stubFetch(() => ({ status: 200, body: SHARDS }));

    render(<BattleScreen started={started({ zone: 'hidden', ambushed: true })} />);

    const banner = await screen.findByTestId('ambush-banner');
    expect(banner.textContent).toMatch(/ambushed/i);
    /* The heading is the *other* element. If the banner ever collapses back into
       the header this fails, which is the regression being guarded. */
    expect(banner.contains(screen.getByRole('heading', { name: /hidden zone/i }))).toBe(false);
  });

  /**
   * **Deliberately absurd multipliers.** Both constants are `2` in production,
   * so a component that typed `×2` would agree with the server forever and this
   * suite would never know. `3` and `7` can only come off the wire — and they
   * are different from each other, so swapping the two fields fails too.
   */
  it('states what the Hidden battle pays, in the server’s numbers', async () => {
    stubFetch(() => ({ status: 200, body: SHARDS }));

    render(<BattleScreen started={started({ zone: 'hidden', ambushed: true })} />);

    const banner = await screen.findByTestId('ambush-banner');
    await waitFor(() => expect(banner.textContent).toMatch(/×3/));
    expect(banner.querySelector('[data-chip="hidden-shards"]')?.textContent).toMatch(/×3/);
    expect(banner.querySelector('[data-chip="hidden-rating"]')?.textContent).toMatch(/×7/);
    expect(calls.some((c) => c.url.includes('/me/shards'))).toBe(true);
  });

  /** The rating double is the winner's positive delta only; a Hidden loss costs
      the same as any other. Promising a symmetric swing would be a lie. */
  it('qualifies the rating double as a win-only bonus', async () => {
    stubFetch(() => ({ status: 200, body: SHARDS }));

    render(<BattleScreen started={started({ zone: 'hidden', ambushed: true })} />);

    const chip = (await screen.findByTestId('ambush-banner')).querySelector(
      '[data-chip="hidden-rating"]',
    );
    expect(chip?.textContent).toMatch(/on a win/i);
  });

  /**
   * The announcement is the bug being fixed; the numbers are the flourish. A
   * banner that waited on a config request would put the original defect back on
   * exactly the connections least able to survive it.
   */
  it('still announces when the rewards request fails', async () => {
    stubFetch((url) =>
      url.includes('/me/shards') ? { status: 500, body: {} } : { status: 200, body: {} },
    );

    render(<BattleScreen started={started({ zone: 'hidden', ambushed: true })} />);

    const banner = await screen.findByTestId('ambush-banner');
    expect(banner.textContent).toMatch(/ambushed/i);
    expect(banner.textContent).not.toMatch(/×/);
  });

  it('says nothing about an ambush on an ordinary attack, and asks for nothing', () => {
    stubFetch(() => ({ status: 200, body: SHARDS }));

    render(<BattleScreen started={started()} />);

    expect(screen.queryByTestId('ambush-banner')).toBeNull();
    /* The overwhelming majority of battles are Visible. None of them should pay
       for a request that exists to explain an ambush. */
    expect(calls.some((c) => c.url.includes('/me/shards'))).toBe(false);
  });
});
