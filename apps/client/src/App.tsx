import { Analytics } from '@vercel/analytics/react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { SiteFooter } from './components/SiteFooter.js';
import { SignInPanel } from './features/auth/SignInPanel.js';
import { AttackScreen } from './features/attack/AttackScreen.js';
import { BattleScreen } from './features/battle/BattleScreen.js';
import { ResumeBattle } from './features/battle/ResumeBattle.js';
import type { StartedBattle } from './features/battle/types.js';
import { LandingScreen } from './features/landing/LandingScreen.js';
import { ProfileScreen } from './features/profile/ProfileScreen.js';
import { SquadsScreen } from './features/squads/SquadsScreen.js';
import { analyticsEnabled, scrubEvent } from './lib/analytics.js';
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

/**
 * Which screen a signed-in player is on.
 *
 * **A battle is a screen rather than a mode**, and it is deliberately not
 * navigable away from by the nav: one battle at a time is a server rule, so
 * offering "Squads" mid-fight would offer a screen whose only outcome is
 * `409 battle_already_open`. The nav is hidden instead of disabled — a disabled
 * control invites the player to work out why.
 */
type Screen =
  | { readonly kind: 'squads' }
  | { readonly kind: 'attack' }
  | { readonly kind: 'battle'; readonly started: StartedBattle }
  /**
   * **One screen for both your profile and somebody else's**, carrying the id
   * it is showing. Two components would be two disclosure surfaces to keep in
   * step, and the difference between them is a single flag: whose controls to
   * render. The *data* difference is the server's job, not this union's.
   */
  | { readonly kind: 'profile'; readonly targetId: string };

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>(() =>
    hasStoredSession() ? { kind: 'restoring' } : { kind: 'anonymous' },
  );
  const [screen, setScreen] = useState<Screen>({ kind: 'squads' });

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
           * **A battle in progress outranks everything else**, because the
           * one-at-a-time rule means a player with an open battle cannot start
           * anything else — landing them on a builder whose only outcome is
           * `409 battle_already_open` would be showing them the one screen they
           * cannot use. So the resume check runs first and its fallback is the
           * ordinary app.
           *
           * **It is no longer the only route into `BattleScreen`.** It was, for one
           * feature: choosing an opponent needed the candidate set, which was 009.
           * 009 shipped, so `AttackScreen` is now the other route in — and the two
           * differ in exactly one way, which is that a start has an opening packet
           * and a resume does not.
           */
          <ResumeBattle
            onUnauthenticated={onUnauthenticated}
            fallback={
              screen.kind === 'battle' ? (
                <BattleScreen
                  started={screen.started}
                  onConcluded={() => {
                    /**
                     * **Left on the result rather than navigated away from.** The
                     * player just finished a fight and the outcome is what they came
                     * for; going back to a list would animate over it. The next load
                     * lands them on the squad screen on its own, because
                     * `GET /battles/open` answers `204` once a battle has settled.
                     */
                  }}
                  onUnauthenticated={onUnauthenticated}
                />
              ) : (
                <>
                  <ScreenNav
                    screen={screen.kind}
                    accountId={phase.account.id}
                    onNavigate={setScreen}
                  />
                  {screen.kind === 'attack' ? (
                    <AttackScreen
                      onBattleStarted={(started) => setScreen({ kind: 'battle', started })}
                      onViewProfile={(targetId) => setScreen({ kind: 'profile', targetId })}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : screen.kind === 'profile' ? (
                    <ProfileScreen
                      targetId={screen.targetId}
                      isSelf={screen.targetId === phase.account.id}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : (
                    <SquadsScreen onUnauthenticated={onUnauthenticated} />
                  )}
                </>
              )
            }
          />
        ) : null}
      </div>

      <SiteFooter />

      {/**
       * **Beside the footer for the same reason the footer is here** — it has to
       * apply to every screen 009–016 adds, including the ones that do not exist
       * yet, and anything mounted inside a screen is a thing to remember.
       *
       * It renders no markup; it injects a script. See `lib/analytics.ts` for
       * why it is gated and what `beforeSend` removes. One caveat to know before
       * reading the dashboard: **this app is a single URL**, so every screen
       * reports as `/` and the five policy pages are the only distinct paths
       * there are. A per-screen funnel needs routes or custom events, neither of
       * which exists.
       */}
      {analyticsEnabled() ? <Analytics beforeSend={scrubEvent} /> : null}
    </div>
  );
}

/**
 * Two screens, named for what they do.
 *
 * **Not a router.** The app is a single URL — deliberately, since the Steam build
 * loads from disk and there is no server to route on — so this is local state, and
 * `lib/analytics.ts` records the consequence: every screen reports as `/` in the
 * dashboard, and a per-screen funnel would need routes or custom events.
 */
function ScreenNav({
  screen,
  accountId,
  onNavigate,
}: {
  screen: 'squads' | 'attack' | 'profile';
  /** Needed because "My profile" is a profile *of somebody*, and that is you. */
  accountId: string;
  onNavigate: (
    next: { kind: 'squads' } | { kind: 'attack' } | { kind: 'profile'; targetId: string },
  ) => void;
}): JSX.Element {
  const tab = (
    kind: 'squads' | 'attack' | 'profile',
    label: string,
    next: Parameters<typeof onNavigate>[0],
  ) => (
    <button
      key={kind}
      type="button"
      role="tab"
      aria-selected={screen === kind}
      onClick={() => onNavigate(next)}
      className={[
        'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
        screen === kind ? 'border-gold bg-raised text-parchment' : 'border-line text-faint',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <nav className="mx-auto max-w-[1600px] px-8 pt-8">
      <div className="flex items-center gap-2" role="tablist" aria-label="Screen">
        {tab('squads', 'Squads', { kind: 'squads' })}
        {tab('attack', 'Attack', { kind: 'attack' })}
        {tab('profile', 'Profile', { kind: 'profile', targetId: accountId })}
      </div>
    </nav>
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
