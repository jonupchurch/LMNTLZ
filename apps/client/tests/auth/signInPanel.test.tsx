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

  /**
   * **Once, not twice.** Two blocks used to render on this one condition — the
   * rejection from `loadGoogleIdentity`, and a static paragraph that fired on the
   * same empty variable — so the visitor read the same complaint back to back and
   * a screen reader announced it twice. `getAllByRole` above cannot catch that; it
   * is satisfied by "one or more", which is what let the duplicate ship.
   */
  it('complains exactly once, not once per code path', async () => {
    render(<SignInPanel onSignedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
  });

  /**
   * ### This assertion pinned a claim that went stale — the third time on this page
   *
   * It required the panel to say *"battles are still being written"*, and battles
   * shipped. The test then **enforced the lie**: an honest panel failed it, and the
   * green fix was to put the false sentence back. `landing.test.tsx` carried the
   * same defect twice over, in both directions.
   *
   * The lesson is not "update the string". It is that **a test cannot verify a
   * claim about the product by checking the claim is present** — presence is true
   * whether or not the claim is. So this checks only what is durable: the panel
   * describes what is behind the door, and it does not contradict the page it sits
   * on by calling the game unplayable. What is *accurate* is asserted one place
   * only, by the derived check in `landing.test.tsx`, which reads the feature tree.
   */
  it('tells the player what signing in opens', () => {
    render(<SignInPanel onSignedIn={vi.fn()} />);
    const text = document.body.textContent ?? '';

    expect(text).toMatch(/squad builder/i);
    // The panel sits under a page that says the game is playable and unfinished.
    // Reverting to "not yet playable" here would contradict it in one screenful.
    expect(text).not.toMatch(/not yet playable|still being written|coming soon/i);
  });
});
