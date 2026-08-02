/**
 * **Two numbers beside a username may never be able to break the game.**
 *
 * ### The regression this locks down
 *
 * `useAccountSummary` added `/me/shards` and `/me/standing` to `App` so the header
 * could show a balance and a roster power. It then read the results like this:
 *
 * ```ts
 * power: standing.status === 'fulfilled' ? standing.value.gearScore : previous.power
 * ```
 *
 * **`fulfilled` does not mean the body was there.** `api<T>()` is typed to return `T`
 * and has two paths that do not: a `204` returns `undefined`, and a body that will not
 * parse as JSON is caught and returned as **`null`** (`api.ts` — `res.json().catch(() =>
 * null)`). So an HTML error page from a proxy, a maintenance page, or any non-JSON 200
 * arrives here as a *fulfilled* promise carrying nothing, and `.gearScore` throws.
 *
 * That throw happens in a state updater in `App`, which sits above every screen and
 * outside any error boundary — in a real browser **the whole application white-screens.**
 * Not the header. Everything.
 *
 * It shipped. It was found because 13 of the 19 `battle.spec.ts` e2e tests went red at
 * once: an unrouted request there falls through to the dev server, which answers with
 * `index.html` — exactly the non-JSON 200 above.
 *
 * ### Why this tests the hook and not `App`
 *
 * The first version of this file rendered `App` and asserted the shell survived. **It
 * passed against the broken code**, so it was worth nothing: the assertion resolved on
 * the render *before* the summary request settled, and the throw then landed in a
 * `void`-ed async callback where jsdom swallows it as an unhandled rejection. The
 * browser propagates it and jsdom does not, so `App` is the wrong altitude to ask from.
 *
 * Asking the hook directly makes the throw observable, and the mutation check confirms
 * it: restoring `standing.value.gearScore` turns four of these red.
 */

import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountSummary } from '../../src/lib/useAccountSummary.js';
import { setSessionToken } from '../../src/lib/api.js';

/**
 * **The assertion that actually distinguishes the two cases.**
 *
 * An earlier version of this file asserted only that the summary read
 * `undefined` after a bad response — which is *also* true when the hook throws,
 * because a component that crashed never updates its state either. It passed
 * against the broken code, exactly like the `App`-level version before it.
 *
 * So the crash has to be caught and named. React propagates a throw from a state
 * updater to the nearest boundary; in the real app there is none above `App`,
 * which is why the failure white-screened the game rather than blanking a chip.
 */
let caught: Error | null = null;

class Boundary extends Component<{ readonly children: ReactNode }> {
  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    caught = error;
  }

  override render(): ReactNode {
    return this.props.children;
  }
}

const wrapper = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <Boundary>{children}</Boundary>
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** What a dev server, a proxy, or an edge error page actually returns. */
const html = () =>
  new Response('<!doctype html><title>nope</title>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

function answerBoth(make: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(make())),
  );
}

beforeEach(() => {
  caught = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionToken(null);
});

describe('the header summary cannot take down the app', () => {
  /**
   * Each of these is a shape `api()` genuinely produces. The first is the one that
   * shipped broken; the rest are the same hole one step along.
   */
  const BAD_SHAPES: readonly (readonly [string, () => Response])[] = [
    ['a non-JSON 200 — an HTML error or maintenance page', html],
    ['a 204 with no body at all', () => new Response(null, { status: 204 })],
    ['a literal JSON null', () => json(200, null)],
    ['well-formed JSON missing the field', () => json(200, { somethingElse: 1 })],
  ];

  for (const [what, make] of BAD_SHAPES) {
    it(`reports both numbers as unknown given ${what}`, async () => {
      setSessionToken('token');
      answerBoth(make);

      const { result } = renderHook(() => useAccountSummary(true, 'roster'), { wrapper });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

      // The whole point: reading a body that is not there must not throw.
      await waitFor(() => expect(caught, `it threw: ${caught?.message}`).toBeNull());

      /*
       * **`undefined`, never `0`.** The header renders nothing for `undefined`;
       * `◈ 0` would be a false statement about a player's money that looks
       * authoritative — the reason the prop sat unwired for two features.
       */
      expect(result.current.shards).toBeUndefined();
      expect(result.current.power).toBeUndefined();
    });
  }

  /**
   * **The positive case is what makes the four above non-vacuous.** Without it, a
   * hook that returned `undefined` unconditionally would satisfy every one of them.
   */
  it('reports both numbers when the server answers properly', async () => {
    setSessionToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).includes('/me/shards')
            ? json(200, { balance: 1234 })
            : json(200, { gearScore: 56 }),
        ),
      ),
    );

    const { result } = renderHook(() => useAccountSummary(true, 'roster'));

    await waitFor(() => expect(result.current.shards).toBe(1234));
    expect(result.current.power).toBe(56);
  });

  it('asks for nothing at all when nobody is signed in', async () => {
    answerBoth(html);

    const { result } = renderHook(() => useAccountSummary(false, 'landing'));

    await waitFor(() => expect(result.current.shards).toBeUndefined());
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * 🔴 **Forging spends without navigating, and the header went stale** (Jon,
 * 2026-08-01).
 *
 * The revision key was the screen alone, on the argument that every spend ends with the
 * player leaving the screen they spent on. **The Forge is the counter-example**: a player
 * commits stage after stage on one screen, the Forge refetches its own state each time,
 * and the header — which reads two different routes through this hook — never hears.
 *
 * These assert the *mechanism* rather than the Forge, because the mechanism is what any
 * other screen that spends will need: a changed `accountRevision` re-reads, an unchanged
 * one does not, and the new figure replaces the old.
 */
describe('🔴 a spend that does not navigate still refreshes the header', () => {
  /** Answers with a balance that moves every time it is asked. */
  function answerWithBalances(balances: readonly number[]): void {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (!String(input).includes('/me/shards')) return Promise.resolve(json(200, { gearScore: 56 }));
        const value = balances[Math.min(call++, balances.length - 1)]!;
        return Promise.resolve(json(200, { balance: value }));
      }),
    );
  }

  it('re-reads when accountRevision changes on the same screen', async () => {
    setSessionToken('token');
    answerWithBalances([650, 500]);

    const { result, rerender } = renderHook(
      ({ rev }: { rev: number }) => useAccountSummary(true, 'forge', rev),
      { initialProps: { rev: 0 } },
    );

    await waitFor(() => expect(result.current.shards).toBe(650));

    // The screen does not change — only the counter the Forge bumps after a commit.
    rerender({ rev: 1 });

    await waitFor(() => expect(result.current.shards).toBe(500));
  });

  /**
   * **The other half, and the one that makes the first non-vacuous.** A hook that
   * re-read on every render would pass the test above and hammer two routes forever.
   */
  it('does not re-read when nothing changed', async () => {
    setSessionToken('token');
    answerWithBalances([650]);

    const { result, rerender } = renderHook(
      ({ rev }: { rev: number }) => useAccountSummary(true, 'forge', rev),
      { initialProps: { rev: 0 } },
    );

    await waitFor(() => expect(result.current.shards).toBe(650));
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    rerender({ rev: 0 });
    rerender({ rev: 0 });

    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
  });
});
