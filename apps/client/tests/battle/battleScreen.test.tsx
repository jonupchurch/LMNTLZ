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
    const panel = screen.getByRole('region', { name: 'Your move' });
    const offered = [...panel.querySelectorAll('button')].map((b) => b.textContent ?? '');

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
      expect(
        screen.getByRole('region', { name: 'Your move' }).textContent,
      ).toContain(`${nameOf(upNow.heroId)} is up`),
    );
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

describe('an ambush is announced', () => {
  it('says so when the server put the player into the Hidden zone', () => {
    stubFetch(() => ({ status: 200, body: {} }));

    render(<BattleScreen started={started({ zone: 'hidden', ambushed: true })} />);
    expect(screen.getByText(/ambushed/i)).toBeTruthy();
  });

  it('says nothing about an ambush on an ordinary attack', () => {
    stubFetch(() => ({ status: 200, body: {} }));

    render(<BattleScreen started={started()} />);
    expect(screen.queryByText(/ambushed/i)).toBeNull();
  });
});
