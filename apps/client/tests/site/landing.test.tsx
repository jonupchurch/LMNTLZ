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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App.js';
import { LandingScreen } from '../../src/features/landing/LandingScreen.js';
import { resetSessionForTests } from '../../src/lib/session.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const UNAUTHENTICATED = jsonResponse(401, {
  error: { code: 'unauthenticated', message: 'This endpoint requires a session token.' },
});

const RENEWED = () =>
  jsonResponse(200, {
    session: { token: 's', expiresAt: new Date(Date.now() + 9e5).toISOString() },
    renewal: { token: 'renewal-2' },
    account: { id: 'a', username: 'Reyna', createdAt: '2026-01-01T00:00:00.000Z' },
  });

/**
 * Put a signed-in player on the page: a stored renewal token that renews.
 *
 * `thenAnswer` covers everything after the renewal. Returning `null` leaves
 * that request unanswered forever, which parks `SquadsScreen` in its loading
 * state — the right stub when the assertion is about the shell around the
 * screen rather than the screen. A half-shaped roster payload would instead
 * make the screen throw, and the failure would name the wrong component.
 */
const signedIn = (thenAnswer: () => Response | null): void => {
  localStorage.setItem('lmntlz.renewal', 'renewal-1');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/auth/renew')) return Promise.resolve(RENEWED());
      const answer = thenAnswer();
      return answer ? Promise.resolve(answer) : new Promise<Response>(() => undefined);
    }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetSessionForTests();
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
    signedIn(() =>
      jsonResponse(500, {
        error: { code: 'internal_error', message: 'Something went wrong on our end.' },
      }),
    );
    render(<App />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 1, name: 'LMNTLZ' })).toBeNull();
  });
});

describe('the way in', () => {
  /**
   * **The landing page has to offer a door, not only describe the building.**
   * For two features the client could reach a fully-built server-side sign-in
   * and had no control that called it — the gap was invisible precisely because
   * every screen behind it was tested and worked.
   */
  it('offers sign-in to a visitor', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument(),
    );
  });

  it('makes no request at all for somebody who was never signed in', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<App />);

    // Nothing stored means nothing to restore. A visitor reaches the front door
    // without waiting on the network, and without a 401 in anybody's logs.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the signed-in player a way back out', async () => {
    signedIn(() => null);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument(),
    );
    expect(screen.getByText('Reyna')).toBeInTheDocument();
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

  /**
   * **Case-insensitive since 017 T047, and the reason is the point.**
   *
   * The page used to carry its own array of nine capitalised names beside nine
   * Tailwind classes. It now renders `TypeBadge`, which takes the force from
   * `@lmntlz/content` — where the canonical value is lowercase (`'earth'`) —
   * and uppercases it in CSS. So the DOM text is `earth` and the pixels say
   * EARTH.
   *
   * Asserting the exact capitalisation would be pinning a **presentational**
   * detail that CSS owns, and it would break again the next time the badge's
   * styling changed. What the test is actually for is that all nine are named,
   * so that is what it checks.
   */
  it('names all nine forces', () => {
    render(<LandingScreen />);
    for (const force of ['earth', 'air', 'fire', 'water', 'light', 'dark', 'slash', 'pierce', 'crush']) {
      expect(
        screen.getByText((_, el) => el?.textContent?.trim().toLowerCase() === force, {
          selector: 'span',
        }),
        `the landing page does not name ${force}`,
      ).toBeInTheDocument();
    }
  });

  /**
   * ### Inverted deliberately, and late — then inverted again, for the same reason
   *
   * The first version asserted `'not yet playable'` and kept passing for two
   * features after the game became playable. The replacement asserted that the page
   * still named `runes`, `guilds` and `rating ladder` as **missing** — and by
   * 2026-07-31 all three had shipped, so the test was **enforcing the lie**: an
   * honest page failed it, and the way to make the suite green was to put the false
   * claim back.
   *
   * Both versions made the same mistake at different levels. **A test that pins the
   * words of a status claim cannot tell you the claim went stale** — the words are
   * present whether or not they are true. So this one stops asserting contents and
   * asserts the *relationship*: nothing may appear in the not-built clause that has
   * a feature directory sitting in the tree.
   *
   * That is derived, so it moves when the code moves. Shipping a screen makes this
   * fail until somebody edits the sentence — which is the whole point, and is
   * exactly what neither earlier version could do.
   */
  it('says both what is playable and what is not', () => {
    render(<LandingScreen />);
    const text = document.body.textContent ?? '';

    expect(text).toContain('playable and unfinished');
    expect(document.querySelector('[data-playable]')?.textContent ?? '').not.toHaveLength(0);
    expect(document.querySelector('[data-not-built]')?.textContent ?? '').not.toHaveLength(0);

    // And it must not have gone back to promising rather than describing.
    expect(text).not.toContain('being written now');
  });

  /**
   * ### The one assertion here that can notice reality moving
   *
   * A word on the left is what the copy would call the feature; the path on the
   * right is what proves it exists. **`import.meta.dirname`, never
   * `new URL(rel, import.meta.url)`** — under jsdom the latter resolves against
   * `http://localhost:3000/` and `fileURLToPath` throws, which is a trap this repo
   * has already paid for once.
   */
  const SHIPPED: ReadonlyArray<readonly [claim: string, proof: string]> = [
    ['runes', 'forge'],
    ['guilds', 'guilds'],
    ['rating ladder', 'attack'],
    ['battles', 'battle'],
    ['replays', 'replays'],
    ['squad', 'squads'],
    ['codex', 'codex'],
    ['store', 'store'],
  ];

  it('never lists something as missing that has already shipped', () => {
    const features = join(import.meta.dirname, '..', '..', 'src', 'features');

    render(<LandingScreen />);
    const notBuilt = (document.querySelector('[data-not-built]')?.textContent ?? '').toLowerCase();

    // Guard: an empty clause would pass every assertion below without reading a
    // thing. This is the check that stops the test being vacuous.
    expect(notBuilt.length, 'the page has no "what is not built" clause').toBeGreaterThan(20);

    for (const [claim, proof] of SHIPPED) {
      if (!existsSync(join(features, proof))) continue;
      expect(
        notBuilt,
        `the page says "${claim}" is not built, but apps/client/src/features/${proof} exists — ` +
          `either the feature shipped and this sentence is stale, or the directory is dead code`,
      ).not.toContain(claim);
    }
  });
});
