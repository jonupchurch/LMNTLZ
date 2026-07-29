/**
 * The sign-in panel says why it cannot work.
 *
 * ### The failure this is here to prevent
 *
 * A sign-in button has four ways to do nothing — no client ID in the build, the
 * Google script not loading, Google returning no credential, the server
 * refusing the token — and **all four look identical to a player**: a button
 * that has been clicked and has not responded. Every one of them was silent in
 * the first draft of this component.
 *
 * That is the same shape as everything else that has gone wrong on this project
 * recently: not breakage, silence. A health check identical in every build, a
 * CI guard that could never pass, a concurrency test that never raced. None of
 * them failed; each just could not tell a working state from a broken one.
 *
 * The test environment has no `VITE_GOOGLE_CLIENT_ID`, which is exactly the
 * misconfiguration worth pinning: it is what a fresh clone, a forgotten Vercel
 * variable, or a build that ran before the variable was added all look like.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SignInPanel } from '../../src/features/auth/SignInPanel.js';
import { GOOGLE_CLIENT_ID } from '../../src/features/auth/googleIdentity.js';

describe('a build with no Google client ID', () => {
  it('is the condition under test', () => {
    // Stated rather than assumed. If a `.env.local` ever sets this, the two
    // assertions below would pass for the wrong reason and nobody would know.
    expect(GOOGLE_CLIENT_ID).toBe('');
  });

  it('says so, instead of rendering a button that does nothing', async () => {
    render(<SignInPanel onSignedIn={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    const text = document.body.textContent ?? '';
    expect(text).toContain('VITE_GOOGLE_CLIENT_ID');
    expect(text).toMatch(/sign-in cannot start|unavailable/i);
  });

  it('still tells the player what signing in would get them', () => {
    // The panel is on the landing page, which says the game is not yet
    // playable. Promising a battle here would contradict the page it sits on.
    render(<SignInPanel onSignedIn={vi.fn()} />);
    expect(document.body.textContent).toMatch(/squad builder/i);
    expect(document.body.textContent).toMatch(/battles are still being written/i);
  });
});
