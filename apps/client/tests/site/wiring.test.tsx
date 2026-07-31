/**
 * **Every rail destination renders from `App`** (017 T059 · FR-016).
 *
 * `rail.test.tsx` proves the rail's *model* is sound — every entry maps to a
 * `Screen` and lights exactly one entry. That is a statement about two pure
 * functions, and it would stay green if `App` forgot to render one of them.
 *
 * This is the other half, and it is the half this project keeps getting wrong:
 * **click the entry and assert something from that screen is on the page.** A
 * destination only a type can reach is not wired.
 *
 * It also covers FR-016's second clause — leavable without a page reload — by
 * navigating away again and back.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App.js';
import { resetSessionForTests } from '../../src/lib/session.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const RENEWED = () =>
  json(200, {
    session: { token: 's', expiresAt: new Date(Date.now() + 9e5).toISOString() },
    renewal: { token: 'renewal-2' },
    account: { id: 'a', username: 'Reyna', createdAt: '2026-01-01T00:00:00.000Z' },
  });

/**
 * Signed in, with every screen's own fetch left **pending**.
 *
 * Deliberate: each screen then sits in its loading state, which is enough to
 * prove `App` mounted it and avoids inventing a payload shape per screen — a
 * half-shaped stub would make the screen throw and the failure would name the
 * wrong component. `/battles/open` must answer, or `ResumeBattle` never
 * reaches its fallback and nothing renders at all.
 */
let paths: string[] = [];

/** Every path any screen asked for, so a caller test can name the routes. */
const requestedPaths = (): readonly string[] => paths;

function signIn(): void {
  paths = [];
  localStorage.setItem('lmntlz.renewal', 'renewal-1');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      paths.push(url);
      if (url.includes('/auth/renew')) return Promise.resolve(RENEWED());
      if (url.includes('/battles/open')) return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>(() => undefined);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetSessionForTests();
});

const rail = () => screen.getByRole('navigation', { name: 'Main' });

describe('every rail destination is reachable from App', () => {
  it('starts on Squads with the rail rendered', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());
    expect(rail().querySelector('[aria-current="page"]')).toHaveTextContent(/squads/i);
  });

  /**
   * Roster is the strongest case in the set: it needs no request at all, so
   * reaching it renders **real content** rather than a spinner. If `App` did
   * not mount it, there would be no champions on the page.
   */
  it('reaches Roster, and it renders the whole roster', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /roster/i }).click();

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeInTheDocument(),
    );
    expect(document.body.textContent).toMatch(/All 27 champions/i);
  });

  it.each([
    ['Matchmaking', 'attack'],
    ['The Court', 'court'],
  ])('reaches %s and lights it', async (label, id) => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: new RegExp(label, 'i') }).click();

    await waitFor(() =>
      expect(rail().querySelector('[aria-current="page"]')).toHaveTextContent(
        new RegExp(label, 'i'),
      ),
    );
    expect(rail().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(id).toBeTruthy();
  });

  /**
   * T065's caller assertion. The Codex is content-only, so reaching it renders
   * real rules rather than a spinner — cut its branch out of `App` and this
   * goes red.
   */
  it('reaches the Codex, and it renders generated rules', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /codex/i }).click();

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: /laws of aethrym/i }),
      ).toBeInTheDocument(),
    );
    expect(document.body.textContent).toContain('×0.80');
  });

  /**
   * **018 T020's caller assertion.** The Forge is the reason this pattern
   * exists: feature 010 built runes end to end — stages, costs, the 75 cap, the
   * destroy transaction, gear score — and its task list named **no screen and
   * no nav entry anywhere**, so shards were earned with nothing to spend them
   * on and every gate stayed green.
   *
   * Cut the `screen.kind === 'forge'` branch out of `App.tsx` and this goes red,
   * which is the only thing that would have caught the original omission.
   */
  it('reaches the Rune Forge, and it asks for the two routes it needs', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /rune forge/i }).click();

    /**
     * Its loading state, like every other screen here — the fetches are left
     * pending on purpose, so this proves `App` mounted the component without
     * inventing a payload shape that would make the failure name the wrong
     * thing.
     */
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/opening the forge/i),
    );

    /**
     * **And that it asked for both reads**, because either alone renders a
     * broken screen: without `/me/runes` there is nothing to show, and without
     * `/me/shards` every price on it would have to be a literal.
     */
    await waitFor(() => {
      expect(requestedPaths().some((p) => p.includes('/me/runes'))).toBe(true);
      expect(requestedPaths().some((p) => p.includes('/me/shards'))).toBe(true);
    });
  });

  /**
   * **018 T032's caller assertion.** 011 built the catalog, the checkout, the
   * webhook, the entitlement fold, the receipt and the spend ceiling, and named
   * no screen anywhere — its own T026 says to put the statement descriptor *on
   * the store screen*, and no task creates one.
   */
  it('reaches the Store, and it asks for the three routes it needs', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /the store/i }).click();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/opening the store/i),
    );

    await waitFor(() => {
      /* The catalog for prices, the entitlement for what is held, and shards
         for the daily reset instant — none of the three is optional. */
      expect(requestedPaths().some((p) => p.includes('/catalog'))).toBe(true);
      expect(requestedPaths().some((p) => p.includes('/me/entitlements'))).toBe(true);
      expect(requestedPaths().some((p) => p.includes('/me/shards'))).toBe(true);
    });
  });

  /**
   * **018 T040's caller assertion.** Feature 008 built the battle record, the
   * replay blob, the seven-day window, the cleanup sweep, the holds and both
   * read routes — and **neither route has ever had a caller**.
   * `tools/gap-audit.py` has listed `/me/battles` and `/replays/:id` as gaps
   * since the audit existed, so every replay this game has written expired
   * without anybody being able to open one.
   *
   * Cut the `screen.kind === 'battles'` branch out of `App.tsx` and this goes
   * red.
   */
  it('reaches the battle record, and it asks for the list', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /battle record/i }).click();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/loading your battles/i),
    );

    /**
     * **And that it does not probe for replays.** FR-011: watchability is a
     * field on the list, so a screen that discovered it by asking would put a
     * request per row on a list of fifty — and would learn the answer only
     * after a click it had already promised a video for.
     */
    await waitFor(() => {
      expect(requestedPaths().some((p) => p.includes('/me/battles'))).toBe(true);
    });
    expect(requestedPaths().some((p) => p.includes('/replays/'))).toBe(false);
  });

  /** The profile is the one destination that is NOT in the rail (T020). */
  it('reaches the profile from the header username', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    const header = screen.getByRole('banner', { name: 'Account' });
    within(header).getByRole('button', { name: 'Reyna' }).click();

    /* THE COURT lights up for the profile — the active-state reading from R6. */
    await waitFor(() =>
      expect(rail().querySelector('[aria-current="page"]')).toHaveTextContent(/the court/i),
    );
  });

  /**
   * FR-016 — leavable **without a page reload**. A screen you can enter and
   * not leave is the shape of the bug that made a finished battle terminal.
   */
  it('leaves a destination and comes back without a reload', async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(rail()).toBeInTheDocument());

    within(rail()).getByRole('button', { name: /roster/i }).click();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeInTheDocument(),
    );

    within(rail()).getByRole('button', { name: /squads/i }).click();
    await waitFor(() =>
      expect(rail().querySelector('[aria-current="page"]')).toHaveTextContent(/squads/i),
    );
    expect(screen.queryByRole('heading', { level: 1, name: /roster/i })).toBeNull();
  });
});
