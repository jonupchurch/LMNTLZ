/**
 * `Header` — shard balance, username, connection state (017 T020).
 *
 * **Profile hangs off the username rather than taking a rail slot.** The rail
 * is for places the game happens; a profile is a property of the person
 * already named in the corner, and giving it a rail entry would push a
 * gameplay destination further down for something reached twice a week.
 *
 * The shard balance is `font-mono` and `tabular-nums` for the same reason every
 * number a player reads under pressure is: a balance that shifts its digits
 * when it changes is a balance nobody trusts at a glance.
 */

import type { ReactNode } from 'react';
import { BUILD_SHA } from '../../lib/build.js';

export interface HeaderProps {
  /**
   * **Optional, and omitted means "not known" rather than zero.**
   *
   * There is no balance in the session payload today, so `App` passes nothing.
   * Rendering `◈ 0` for an unknown balance would be a false statement about a
   * player's money that looks authoritative — and the one number in this app
   * nobody would think to doubt. Absent is honest; wrong is not.
   */
  readonly shards?: number;
  readonly username: string;
  /**
   * The `ConnectionState` element, passed in rather than constructed here.
   *
   * ⚠️ **`App` passes nothing**, so the game has no connection readout at all
   * while every export draws one. It needs a real status source — 014's
   * socket — and inventing one here would be a green dot that means nothing.
   */
  readonly connection?: ReactNode;
  readonly onProfile?: () => void;
  /**
   * Ends the session. **Absent means no control is drawn**, which is right for
   * any shell that is not the signed-in app.
   *
   * A shared-computer game needs a deliberate way off a machine: the renewal
   * token lives in browser storage for thirty days, and without this the only
   * exit is clearing site data.
   */
  readonly onSignOut?: () => void;
}

export function Header({
  shards,
  username,
  connection,
  onProfile,
  onSignOut,
}: HeaderProps): React.JSX.Element {
  return (
    <header
      /*
       * Labelled because the app currently renders **two** landmarks with the
       * `banner` role — this one and the older `SessionBar`, which shows the
       * same username and the sign-out. That duplication is a real smell and
       * the two should merge: the export puts the username, the balance and
       * the connection state in this bar, and the sign-out belongs with the
       * name it signs out of. Left alone here because removing `SessionBar`
       * would take the visible sign-out with it, which `landing.test.tsx`
       * requires and a shared-computer game needs.
       */
      aria-label="Account"
      className="flex h-14 items-center justify-between gap-(--gutter) border-b border-line bg-bg px-(--gutter)"
    >
      <span className="text-h2 font-display font-bold tracking-widest uppercase">LMNTLZ</span>

      <div className="flex items-center gap-(--gutter)">
        {connection}

        {shards !== undefined && (
          <span className="flex items-center gap-1.5" title="Shards">
            <span aria-hidden="true" className="text-gold">
              ◈
            </span>
            <span className="font-mono tabular-nums">{shards.toLocaleString('en-US')}</span>
            <span className="sr-only">shards</span>
          </span>
        )}

        {onProfile ? (
          <button
            type="button"
            onClick={onProfile}
            className="text-h3 rounded-sm font-display tracking-wide text-muted hover:text-parchment"
          >
            {username}
          </button>
        ) : (
          <span className="text-h3 font-display tracking-wide text-muted">{username}</span>
        )}

        {onSignOut ? (
          /**
           * **Beside the name it signs out of**, which is where this component's
           * own header comment said it belonged. It used to live in `SessionBar`
           * — a second `banner` landmark with a second LMNTLZ wordmark and a
           * second copy of the username, stacked directly above this one. Two
           * headers is what a player actually saw.
           */
          <button
            type="button"
            onClick={onSignOut}
            className="text-caption rounded border border-line px-2 py-1 font-display tracking-wide text-muted uppercase hover:text-parchment"
          >
            Sign out
          </button>
        ) : null}

        {/**
         * **Which build is on screen.** See `lib/build.ts` for why seven
         * characters of the commit hash are worth permanent space: *"is it
         * deployed?"* has been answered wrongly here three times, and nothing
         * on the screen could settle it.
         */}
        <span
          className="text-caption text-decor font-mono tabular-nums"
          title={`Client build ${BUILD_SHA}. If this does not match the latest commit, the page is cached.`}
          data-build={BUILD_SHA}
        >
          {BUILD_SHA}
        </span>
      </div>
    </header>
  );
}
