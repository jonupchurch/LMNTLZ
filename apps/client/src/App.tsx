import { useCallback, useEffect, useState, type JSX } from 'react';
import { SiteFooter } from './components/SiteFooter.js';
import { SignInPanel } from './features/auth/SignInPanel.js';
import { ResumeBattle } from './features/battle/ResumeBattle.js';
import { LandingScreen } from './features/landing/LandingScreen.js';
import { SquadsScreen } from './features/squads/SquadsScreen.js';
import {
  currentAccount,
  hasStoredSession,
  restore,
  signOut,
  type Account,
} from './lib/session.js';

/**
 * The app shell.
 *
 * ### Restore first, rather than fetch first
 *
 * Until sign-in existed this component rendered the squad screen immediately
 * and fell back to the landing page on a `401`, on the reasoning that a
 * signed-in player should not pay a round trip to reach their squads.
 *
 * **That optimism has no payoff now that tokens are held the way they are.**
 * The session token lives in memory only, so a page load never has one — the
 * optimistic request would `401` *every* time, for everybody, and the fallback
 * would be the normal path rather than the exception. So the shell asks
 * `session.ts` whether there is anything to restore, and only a player with a
 * stored renewal token waits on the network at all.
 *
 * **The footer sits outside the screen rather than inside it**, because the
 * policy links have to be on every screen 007–016 adds — including the ones
 * that do not exist yet. Putting it in `SquadsScreen` would make that a thing
 * to remember, and the day it is forgotten is the day the refund link
 * disappears.
 */
type Phase =
  | { readonly kind: 'restoring' }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'signed-in'; readonly account: Account };

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>(() =>
    hasStoredSession() ? { kind: 'restoring' } : { kind: 'anonymous' },
  );

  useEffect(() => {
    if (phase.kind !== 'restoring') return;

    let cancelled = false;
    void restore().then((account) => {
      if (cancelled) return;
      setPhase(account ? { kind: 'signed-in', account } : { kind: 'anonymous' });
    });

    return () => {
      cancelled = true;
    };
    // Deliberately empty: `restoring` is only ever the *initial* phase and is
    // never returned to, so this closes over the first render on purpose. A
    // dependency on `phase` would re-enter the effect on every sign-out.
  }, []);

  /**
   * **Reached only after renewal has already been tried and failed.** `api.ts`
   * renews and retries on a `401` before any caller sees one, so a `401` that
   * gets this far means the session is genuinely over — expired beyond renewal,
   * revoked, or its family killed by a reuse. The right response is the landing
   * page, not a retry.
   */
  const onUnauthenticated = useCallback(() => setPhase({ kind: 'anonymous' }), []);

  const onSignOut = useCallback(() => {
    setPhase({ kind: 'anonymous' });
    void signOut();
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {phase.kind === 'signed-in' ? (
        <SessionBar account={phase.account} onSignOut={onSignOut} />
      ) : null}

      <div className="flex-1">
        {phase.kind === 'restoring' ? <Restoring /> : null}

        {phase.kind === 'anonymous' ? (
          <>
            <LandingScreen />
            <div className="mx-auto mt-10 max-w-3xl px-8 pb-4">
              <SignInPanel
                onSignedIn={(account) => setPhase({ kind: 'signed-in', account })}
              />
            </div>
          </>
        ) : null}

        {phase.kind === 'signed-in' ? (
          /**
           * **A battle in progress outranks the squad builder**, because the
           * one-at-a-time rule means a player with an open battle cannot start
           * anything else — landing them on a builder whose only outcome is
           * `409 battle_already_open` would be showing them the one screen they
           * cannot use.
           *
           * This is also the only route into `BattleScreen` that exists. There
           * is no "attack" button yet: choosing an opponent needs the candidate
           * set, which is feature 009. See `ResumeBattle.tsx`.
           */
          <ResumeBattle
            onUnauthenticated={onUnauthenticated}
            fallback={<SquadsScreen onUnauthenticated={onUnauthenticated} />}
          />
        ) : null}
      </div>

      <SiteFooter />
    </div>
  );
}

function Restoring(): JSX.Element {
  return (
    <main className="mx-auto max-w-[1600px] px-8 py-16">
      <p className="text-sm tracking-widest text-faint uppercase" role="status">
        Restoring your session…
      </p>
    </main>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * **A visible sign-out is not optional.** This is a shared-computer game with a
 * thirty-day renewal token in browser storage; without a way to end a session
 * deliberately, the only way off a machine is to clear site data.
 */
function SessionBar({
  account,
  onSignOut,
}: {
  account: Account;
  onSignOut: () => void;
}): JSX.Element {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-3">
        <span className="font-display text-sm tracking-[0.3em] text-gold">LMNTLZ</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{account.username}</span>
          {/* No focus classes anywhere in this file: `base.css` gives every
              focusable element a mandatory gold ring, and a local override is
              how one control ends up looking different from all the rest. */}
          <button
            type="button"
            onClick={onSignOut}
            className="rounded border border-line px-3 py-1 text-sm text-muted hover:text-parchment"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

/** Re-exported so a screen can name the signed-in account without importing two modules. */
export { currentAccount };
