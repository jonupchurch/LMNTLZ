/**
 * Latency is hidden, never waited on (007 T030, US3, SC-008).
 *
 * ### These assertions are about ORDER and TIMING, so the clock is fake
 *
 * Every claim here is of the form *"X happened before Y"*, and with a real clock
 * that is a race the test would sometimes win. `vi.useFakeTimers()` makes the
 * wind-up advance only when this file says so, which turns "the wind-up started
 * before the response arrived" from a hope into a fact.
 *
 * ### The three scenarios, and what each would look like if it broke
 *
 * | Scenario | The broken version |
 * |---|---|
 * | request and wind-up fire on the same click | `await api(...)` first, then animate — the round trip is spent on a frozen screen and the animation then makes the player wait *again* |
 * | a slow response waits at a natural point | the wind-up ends and the screen holds a half-finished motion, which reads as a crash |
 * | the server's version is what is shown | a local damage estimate is displayed and then corrected, and the number visibly changes under the player |
 *
 * The third is the one that cannot break here, and the reason is worth stating:
 * **nothing in this client predicts an outcome.** The wind-up is motion, not a
 * guess, so there is no optimistic value to disagree with the server's. The test
 * below proves it the only way that means anything — by having the server return
 * something no local arithmetic would have produced.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { getHero } from '@lmntlz/content';
import { availablePowers, legalTargets } from '@lmntlz/sim/rules';
import { BattleScreen } from '../../src/features/battle/BattleScreen.js';
import { useIntent, BEAT_MS, WIND_UP_MS } from '../../src/features/battle/useIntent.js';
import { setSessionToken } from '../../src/lib/api.js';
import type { ActionPacket } from '../../src/features/battle/types.js';
import { board, started } from './fixtures.js';

/** A request whose resolution this test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let calls: string[];

beforeEach(() => {
  vi.useFakeTimers();
  setSessionToken('test-session');
  calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setSessionToken(null);
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const packetOf = (events: ActionPacket['events'] = []): ActionPacket => ({
  events,
  state: board('a-front-1'),
  conclusion: null,
});

const event = (actor: string, damage: number) => ({
  actorInstanceId: actor,
  powerId: 'p',
  targetInstanceId: 'd-front-0',
  source: 'player' as const,
  outcome: {
    hit: true,
    crit: false,
    damage,
    healing: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
  },
});

const intent = {
  sequence: 0,
  actorInstanceId: 'a-front-0',
  powerId: 'p',
  targetInstanceId: 'd-front-0',
};

describe('scenario 1 — the request and the wind-up start on the same click', () => {
  it('is winding up before the response has been given a chance to arrive', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        return pending.promise;
      }),
    );

    const { result } = renderHook(() =>
      useIntent({ battleId: 'b', onResolved: vi.fn(), onFailed: vi.fn() }),
    );

    expect(result.current.phase.kind).toBe('idle');

    act(() => {
      result.current.commit(intent);
    });

    /**
     * **Both, with no clock advanced at all.** The request has left and the
     * phase is already `winding` — which is the entire claim. An implementation
     * that awaited the response first would still be `idle` here.
     */
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/battles/b/act');
    expect(result.current.phase.kind).toBe('winding');

    pending.resolve(jsonResponse({ sequence: 0, packet: packetOf(), nextSequence: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + BEAT_MS);
    });
  });

  it('refuses a second action while one is in flight', async () => {
    /**
     * **Checked synchronously, because two fast clicks land in the same React
     * batch.** A guard that read rendered state would see `idle` twice and send
     * two actions at the same sequence — the second of which the server answers
     * from storage, so the player's second move would silently vanish.
     */
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => { calls.push('act'); return pending.promise; }));

    const { result } = renderHook(() =>
      useIntent({ battleId: 'b', onResolved: vi.fn(), onFailed: vi.fn() }),
    );

    act(() => {
      result.current.commit(intent);
      result.current.commit(intent);
      result.current.commit(intent);
    });

    expect(calls).toHaveLength(1);

    pending.resolve(jsonResponse({ sequence: 0, packet: packetOf(), nextSequence: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + BEAT_MS);
    });
  });
});

describe('scenario 2 — a slow response waits at a natural point', () => {
  it('reaches a held pose rather than staying mid-motion', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));

    const { result } = renderHook(() =>
      useIntent({ battleId: 'b', onResolved: vi.fn(), onFailed: vi.fn() }),
    );

    act(() => {
      result.current.commit(intent);
    });
    expect(result.current.phase.kind).toBe('winding');

    // The wind-up finishes and the network still has not answered.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + 1);
    });

    /**
     * **`holding`, and it is a distinct state rather than a stuck one.** The
     * failure this catches is a hook that leaves the phase at `winding`
     * forever — indistinguishable in code, and on screen it is a champion
     * frozen halfway through a swing.
     */
    expect(result.current.phase.kind).toBe('holding');

    pending.resolve(jsonResponse({ sequence: 0, packet: packetOf(), nextSequence: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });
    expect(result.current.phase.kind).toBe('idle');
  });

  it('never holds at all on a healthy connection', async () => {
    /**
     * The measured API answers in ~70ms and the wind-up runs 220ms, so a player
     * on a good connection should go straight from `winding` to the resolution.
     * Reaching `holding` routinely would mean the wind-up is too short to be
     * covering anything.
     */
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(
              () => resolve(jsonResponse({ sequence: 0, packet: packetOf(), nextSequence: 1 })),
              70,
            );
          }),
      ),
    );

    const { result } = renderHook(() =>
      useIntent({ battleId: 'b', onResolved: vi.fn(), onFailed: vi.fn() }),
    );

    act(() => {
      result.current.commit(intent);
    });
    seen.push(result.current.phase.kind);

    for (let t = 0; t < 4; t++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WIND_UP_MS / 4);
      });
      seen.push(result.current.phase.kind);
    }

    expect(seen).not.toContain('holding');
  });
});

describe('scenario 3 — the server’s version is what is shown', () => {
  it('applies the packet’s state, not anything derived locally', async () => {
    /**
     * The server says the target is on 1 HP. No local arithmetic on this board
     * produces 1, so seeing it is proof the render came from the response.
     */
    const base = board('a-front-1');
    const serverState = {
      ...base,
      heroes: base.heroes.map((h) => (h.instanceId === 'd-front-0' ? { ...h, hp: 1 } : h)),
    };

    const onResolved = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            sequence: 0,
            packet: { events: [], state: serverState, conclusion: null },
            nextSequence: 1,
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useIntent({ battleId: 'b', onResolved, onFailed: vi.fn() }));

    act(() => {
      result.current.commit(intent);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + BEAT_MS);
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
    const [packet, next] = onResolved.mock.calls[0]!;
    expect(next).toBe(1);
    expect((packet as ActionPacket).state.heroes.find((h) => h.instanceId === 'd-front-0')!.hp).toBe(1);
  });

  it('reports the packet only after it has finished playing', async () => {
    /**
     * **The board updates once, at the end.** Applying `packet.state` while the
     * folded turns are still playing would show the outcome of turn five during
     * turn one — the numbers would be right and the sequence would be nonsense.
     */
    const onResolved = vi.fn();
    const events = [event('a-front-0', 100), event('d-front-0', 50), event('a-middle-0', 75)];

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ sequence: 0, packet: packetOf(events), nextSequence: 1 }),
        ),
      ),
    );

    const { result } = renderHook(() => useIntent({ battleId: 'b', onResolved, onFailed: vi.fn() }));

    act(() => {
      result.current.commit(intent);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS);
    });

    const seen: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const phase = result.current.phase;
      if (phase.kind === 'playing') seen.push(phase.index);
      expect(onResolved, `reported during turn ${i}`).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BEAT_MS);
      });
    }

    expect(seen).toEqual([0, 1, 2]);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('plays the packet out without touching the network again', async () => {
    /**
     * **FR-019 in one assertion.** Every turn in the packet is already resolved,
     * so playing it must cost nothing — one request in, several turns out. A
     * request per turn is the shape this whole packet design exists to avoid.
     */
    const requests: string[] = [];
    const events = [event('a-front-0', 10), event('d-front-1', 20), event('a-back-0', 30)];

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        requests.push(url);
        return Promise.resolve(
          jsonResponse({ sequence: 0, packet: packetOf(events), nextSequence: 1 }),
        );
      }),
    );

    const { result } = renderHook(() =>
      useIntent({ battleId: 'b', onResolved: vi.fn(), onFailed: vi.fn() }),
    );

    act(() => {
      result.current.commit(intent);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + BEAT_MS * events.length + 10);
    });

    expect(requests).toHaveLength(1);
  });
});

describe('the screen, end to end', () => {
  it('shows the resolution instead of the move panel while a turn resolves', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));

    const state = board();
    const up = state.turnOfInstance!;
    const power = availablePowers(state, up).filter(
      (p) => legalTargets(state, up, p.id).candidates.length > 0,
    )[0]!;
    const target = legalTargets(state, up, power.id).candidates[0]!;
    const victim = state.heroes.find((h) => h.instanceId === target)!;

    render(<BattleScreen started={started()} />);
    expect(screen.getByRole('region', { name: 'Your move' })).toBeTruthy();

    /**
     * **`fireEvent`, not `userEvent`.** `userEvent` schedules its own work on
     * `setTimeout`, which is faked here, so its click never completes — the
     * pointer sequence it simulates is irrelevant to a claim about what happens
     * in the same tick as the handler.
     */
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${getHero(victim.heroId).name},`) }),
      );
    });

    /**
     * **Replaced, not disabled.** A greyed-out panel invites the player to keep
     * aiming at controls that will not answer; the resolution is what they
     * should be watching, so it takes the space.
     *
     * Asserted directly rather than through `waitFor`: that helper polls on
     * `setTimeout`, which is faked here, so it would spin until the test timed
     * out. The point of the fake clock is that no waiting is needed — the
     * wind-up is on screen in the same commit as the click.
     */
    expect(screen.getByRole('region', { name: 'Resolving' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your move' })).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Resolving' }).getAttribute('data-phase'),
    ).toBe('winding');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIND_UP_MS + 1);
    });
    expect(
      screen.getByRole('region', { name: 'Resolving' }).getAttribute('data-phase'),
    ).toBe('holding');

    pending.resolve(jsonResponse({ sequence: 0, packet: packetOf(), nextSequence: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });

    expect(screen.getByRole('region', { name: 'Your move' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Resolving' })).toBeNull();
  });
});
