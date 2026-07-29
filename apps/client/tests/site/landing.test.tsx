/**
 * The front door.
 *
 * ### The regression this locks down
 *
 * The deployed homepage read, in full:
 *
 * ```
 * This endpoint requires a session token.
 * Passes Terms Privacy Refunds Contact
 * ```
 *
 * That is the API's own 401 message, rendered as the entire page, because
 * `SquadsScreen` treated *not signed in* as a load failure and displayed the
 * server's sentence verbatim. It was live for as long as the client was, and it
 * was found by rendering the real site rather than by any test — nothing here
 * had an opinion about what an anonymous visitor should see, because nothing had
 * been asked to.
 *
 * So the assertions below are about **the visitor**, not the component: a 401
 * must reach the landing page, and the server's wording must never be what
 * greets somebody.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App.js';
import { LandingScreen } from '../../src/features/landing/LandingScreen.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const UNAUTHENTICATED = jsonResponse(401, {
  error: { code: 'unauthenticated', message: 'This endpoint requires a session token.' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('an anonymous visitor', () => {
  it('is shown the landing page, not the API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(UNAUTHENTICATED.clone()));
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeInTheDocument(),
    );
  });

  it('never sees the server’s own wording', async () => {
    // The exact string that shipped. Asserting its absence is worth more than
    // asserting the landing page's presence: a future change could bring back
    // the leak while still rendering something.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(UNAUTHENTICATED.clone()));
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('session token');
    expect(document.body.textContent).not.toContain('endpoint');
  });

  it('can still reach the policy pages from the footer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(UNAUTHENTICATED.clone()));
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Refunds' })).toHaveAttribute('href', '/refunds.html');
  });
});

describe('a genuine failure is still reported', () => {
  it('does not disguise a 500 as being signed out', async () => {
    // The fallback must be narrow. Routing every error to the landing page would
    // make an outage look like a logged-out session, and a player would sit on a
    // marketing page wondering why signing in did nothing.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: 'internal_error', message: 'Something went wrong on our end.' },
        }),
      ),
    );
    render(<App />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeNull();
  });
});

describe('what the page claims', () => {
  /**
   * **Every number here is settled canon**, and a landing page is the easiest
   * place for one to drift — nobody diffs marketing copy against `CLAUDE.md`.
   * These assertions are cheap and they make the drift loud.
   */
  it('states the roster size and that it is not collectable', () => {
    render(<LandingScreen />);
    expect(document.body.textContent).toContain('twenty-seven champions');
    expect(document.body.textContent).toMatch(/unlocked the moment you sign in/i);
  });

  it('states the ambush rule exactly', () => {
    render(<LandingScreen />);
    expect(document.body.textContent).toContain('+2% per consecutive win');
    expect(document.body.textContent).toContain('capped at 90%');
  });

  it('states the spend ceiling', () => {
    render(<LandingScreen />);
    expect(document.body.textContent).toContain('$160 a year at most');
  });

  it('names all nine forces', () => {
    render(<LandingScreen />);
    for (const force of ['Earth', 'Air', 'Fire', 'Water', 'Light', 'Dark', 'Slash', 'Pierce', 'Crush']) {
      expect(screen.getByText(force)).toBeInTheDocument();
    }
  });

  it('does not claim the game is playable', () => {
    // It is not. Feature 007 onward is unbuilt, and a front door that implies
    // otherwise is the one thing on this page that could be dishonest rather
    // than merely wrong.
    render(<LandingScreen />);
    expect(document.body.textContent).toContain('not yet playable');
  });
});
