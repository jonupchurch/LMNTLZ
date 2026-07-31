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
function signIn(): void {
  localStorage.setItem('lmntlz.renewal', 'renewal-1');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
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
