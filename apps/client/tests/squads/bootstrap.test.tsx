/**
 * The client bootstrap holds together (006 T001–T004).
 *
 * Three things worth asserting the day the app is created, because each is
 * silent when broken and expensive to discover later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from '../../src/App.js';
import { resetSessionForTests } from '../../src/lib/session.js';

const CLIENT = join(import.meta.dirname, '../..');

describe('the app shell reaches the squad screen', () => {
  /**
   * **A session has to be seeded now, and that is the point of the change.**
   *
   * This test used to render `App` with nothing stubbed at all, because the
   * shell asked for the roster first and fell back to the landing page on a
   * `401`. Sign-in changed which of those is the default: the session token is
   * held in memory only, so a page load never has one, and the shell restores
   * from the stored renewal token instead of guessing.
   */
  beforeEach(() => {
    localStorage.setItem('lmntlz.renewal', 'renewal-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/auth/renew')) {
          return new Response(
            JSON.stringify({
              session: { token: 's', expiresAt: new Date(Date.now() + 9e5).toISOString() },
              renewal: { token: 'renewal-2' },
              account: { id: 'a', username: 'Reyna', createdAt: '2026-01-01T00:00:00.000Z' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // The roster never answers, so the screen stays in its loading state —
        // which is exactly what proves `App` is the screen, not a placeholder.
        return new Promise<Response>(() => undefined);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    resetSessionForTests();
  });

  it('renders the squads screen rather than a placeholder', async () => {
    /**
     * **The gap this replaced.** Until feature 006's Phase 8, `App` rendered a
     * bootstrap shell listing the nine damage types, and every squad component
     * was complete, unit-tested and unreachable from the running app. A
     * component suite cannot see that; this assertion and the e2e run can.
     */
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Loading your champions/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'LMNTLZ' })).toBeNull();
  });
});

describe('the desktop floor is stated in CSS, not assumed', () => {
  // **Comments stripped before scanning.** The file explains *why* nobody should
  // write `outline: none`, and a scan that reads prose flags the explanation —
  // which would make the only fix deleting the reason. Same trap as
  // `apps/api/tests/auth/convention.test.ts`.
  const css = readFileSync(join(CLIENT, 'src/styles/base.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('sets a 1280px minimum width rather than reflowing', () => {
    // A squad is six heroes in a fixed 2/3/1 formation and the defense screen
    // shows two squads side by side. Below the floor that is a different
    // interface, not a smaller one — so it scrolls.
    expect(css).toMatch(/min-width:\s*1280px/);
  });

  it('never removes the focus ring', () => {
    // The only thing telling a keyboard player where they are. `outline: none`
    // anywhere in this file is a regression, and it is the single most common
    // thing a component library drops in.
    expect(css).toMatch(/:focus-visible/);
    expect(css).not.toMatch(/outline:\s*none/);
  });
});
