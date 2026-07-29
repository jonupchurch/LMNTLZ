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
    <div className="rounded border border-line bg-surface p-6">
      <h2 className="font-display text-sm tracking-widest text-gold uppercase">Sign in</h2>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        All twenty-seven champions unlock immediately. Signing in reaches the squad builder;
        battles are still being written.
      </p>

      <div className="mt-5 flex min-h-[44px] items-center" ref={slot} aria-busy={busy} />

      {busy ? <p className="mt-3 text-sm text-muted">Signing you in…</p> : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-fire">
          {error}
        </p>
      ) : null}

      {GOOGLE_CLIENT_ID ? null : (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-fire">
          This build has no Google client ID, so sign-in cannot start. Set{' '}
          <code>VITE_GOOGLE_CLIENT_ID</code> on the client project and redeploy.
        </p>
      )}
    </div>
  );
}
