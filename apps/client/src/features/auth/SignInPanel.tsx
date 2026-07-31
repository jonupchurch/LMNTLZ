/**
 * The sign-in control on the landing page.
 *
 * ### It says what went wrong, out loud
 *
 * Four things can fail here and **three of them used to be silent**: the script
 * not loading, the client ID being absent from the build, Google returning no
 * credential, and the server refusing the token. Each gets its own sentence,
 * because a sign-in button that simply does nothing is indistinguishable from a
 * sign-in button that is working slowly, and the player has no way to tell.
 *
 * ### It does not promise more than the game delivers
 *
 * The landing page says LMNTLZ is not yet playable, and it is not. Signing in
 * reaches the squad builder — a real, working screen with the full roster — and
 * nothing beyond it. The note under the button says that, so nobody signs in
 * expecting a battle.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { ApiError } from '../../lib/api.js';
import { signInWithGoogle, type Account } from '../../lib/session.js';
import { GOOGLE_CLIENT_ID, mountGoogleButton } from './googleIdentity.js';

export interface SignInPanelProps {
  readonly onSignedIn: (account: Account) => void;
}

export function SignInPanel({ onSignedIn }: SignInPanelProps): JSX.Element {
  const slot = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const exchange = useCallback(
    (idToken: string) => {
      setBusy(true);
      setError(null);
      signInWithGoogle(idToken)
        .then(onSignedIn)
        .catch((err: unknown) => {
          /**
           * **`403` is the one that must not be flattened into "try again".** A
           * suspended account is not a failed attempt, and telling a banned
           * player their sign-in did not work sends them to support with the
           * wrong problem.
           */
          if (err instanceof ApiError && err.status === 403) {
            setError('This account is suspended. See the contact page if that is unexpected.');
          } else if (err instanceof ApiError && err.status === 401) {
            setError('Google verified you, but we could not accept that token. Try again.');
          } else {
            setError('We could not reach the server. Check your connection and try again.');
          }
        })
        .finally(() => setBusy(false));
    },
    [onSignedIn],
  );

  useEffect(() => {
    const parent = slot.current;
    if (!parent) return;

    let cancelled = false;
    void mountGoogleButton(
      parent,
      (idToken) => {
        if (!cancelled) exchange(idToken);
      },
      (message) => {
        if (!cancelled) setError(message);
      },
    ).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Sign-in is unavailable.');
    });

    return () => {
      cancelled = true;
    };
  }, [exchange]);

  return (
    /*
     * 017 T047 — ported onto the design tokens.
     *
     * **The error colour changed from `fire` to `danger`, and that is not a
     * repaint.** An error is a semantic state, not a Force; borrowing Fire's
     * token made the colour mean two things, so a future change to the Fire
     * House would have silently restyled every failure message in the app.
     * `--color-danger` is aliased onto Slash in `base.css`, so it looks
     * near-identical today and can diverge deliberately later.
     *
     * Every size below is a scale token rather than a Tailwind step, so the
     * panel moves with the type ramp instead of drifting from it.
     */
    <div className="rounded-lg bg-surface p-6 shadow-(--shadow-glow-1)">
      <h2 className="text-h3 font-display tracking-widest text-gold uppercase">Sign in</h2>

      <p className="text-body mt-3 text-muted">
        All twenty-seven champions unlock immediately. Signing in reaches the squad builder;
        battles are still being written.
      </p>

      {/* The 44px floor stays: it is the Google button's own rendered height,
          not a touch target — this is a mouse-and-keyboard game. */}
      <div className="mt-5 flex min-h-[44px] items-center" ref={slot} aria-busy={busy} />

      {busy ? <p className="text-body mt-3 text-muted">Signing you in…</p> : null}

      {error ? (
        <p role="alert" className="text-body mt-3 text-danger">
          {error}
        </p>
      ) : null}

      {GOOGLE_CLIENT_ID ? null : (
        <p role="alert" className="text-body mt-3 text-danger">
          This build has no Google client ID, so sign-in cannot start. Set{' '}
          <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> on the client project and
          redeploy.
        </p>
      )}
    </div>
  );
}
