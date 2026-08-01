/**
 * Landing back in a battle you are already in (007, and not in any task).
 *
 * ### Why this exists at all
 *
 * T028 says build `BattleScreen`; nothing says put it on a page. Feature 006 hit
 * the same gap — its components were complete and unit-tested while unreachable
 * from the running app, which is invisible in a component suite and obvious the
 * instant anybody tries to click something — and `SquadsScreen.tsx` records it
 * so 007 would not rediscover it. This is 007 not rediscovering it.
 *
 * ### It is resume, not attack, and the distinction is what makes it buildable
 *
 * **Choosing an opponent needs the candidate set, which is feature 009.** There
 * is no matchmaking, no scout list and no "attack" button anywhere yet, so the
 * screen cannot be reached that way.
 *
 * Resuming needs none of that. `GET /v1/battles/open` answers "am I mid-battle?"
 * with no id and no opponent, and the one-at-a-time rule guarantees the answer
 * is one battle or none. So a player who reloads, or comes back tomorrow, lands
 * back in their fight — which is a requirement in its own right rather than a
 * stand-in for the missing entry point. The contract carries that route
 * precisely so *"resume needs no separate concept."*
 *
 * ### The board is fetched, not the packet
 *
 * `POST /v1/battles` returns the opening packet; a resume has no packet, because
 * the turns it folded are in the past. So this reads the **state** and hands
 * `BattleScreen` a synthetic `StartedBattle` with an empty event list — nothing
 * is lost, because state is re-derived from the log on every call and the log
 * holds everything a replay would need.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { BattleScreen } from './BattleScreen.js';
import type { BattleView, StartedBattle } from './types.js';

export interface ResumeBattleProps {
  readonly onUnauthenticated?: () => void;
  /** Rendered when there is no battle to resume — the ordinary case. */
  readonly fallback: React.ReactNode;
  /**
   * The way off the result screen — **and without it this path is a dead end.**
   *
   * `BattleScreen` documents at length that the shell hides the tab bar while a
   * battle is open and that a result screen with no exit leaves reloading the
   * browser as the only way on. The fix landed on the *other* call site: the one
   * reached from matchmaking passes `onLeave`, and this one, the resume path,
   * never forwarded it. So a player who reloaded mid-battle and then finished it
   * was stuck — the same bug, surviving on the route nobody re-tested.
   *
   * Found by an e2e assertion that the result offers *some* button, which is the
   * shape worth asserting: naming the button would have passed while the screen
   * was still terminal on this path.
   */
  readonly onLeave?: () => void;
}

type Lookup =
  | { readonly kind: 'asking' }
  | { readonly kind: 'none' }
  | { readonly kind: 'in-battle'; readonly started: StartedBattle };

export function ResumeBattle({ onUnauthenticated, fallback, onLeave }: ResumeBattleProps) {
  const [lookup, setLookup] = useState<Lookup>({ kind: 'asking' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        /**
         * **`204` is the normal answer**, and `api.ts` returns `undefined` for
         * it — so "no open battle" arrives as an absent body rather than as an
         * error. A route that threw for the common case would put the whole
         * game behind a caught exception on every load.
         */
        const open = await api<{ battleId: string } | undefined>('/battles/open');
        if (cancelled) return;

        if (!open?.battleId) {
          setLookup({ kind: 'none' });
          return;
        }

        const view = await api<BattleView>(`/battles/${open.battleId}`);
        if (cancelled) return;

        setLookup({
          kind: 'in-battle',
          started: {
            battleId: view.battleId,
            zone: view.zone,
            /**
             * **Not announced on a resume.** The ambush was announced when the
             * battle started; repeating it on every reload would read as a
             * fresh ambush each time.
             */
            ambushed: false,
            sequence: view.sequence,
            packet: { events: [], state: view.state, conclusion: view.conclusion },
          },
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthenticated?.();
          return;
        }
        /**
         * **Any other failure falls through to the fallback.** A player whose
         * resume check failed should still reach their squads; blocking the
         * whole app on an optional question would turn one bad request into a
         * dead site.
         */
        setLookup({ kind: 'none' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onUnauthenticated]);

  const onConcluded = useCallback(() => {
    /**
     * **Left on the result rather than navigated away from.** The player has
     * just finished a fight and the outcome is the thing they came for; the next
     * `GET /battles/open` returns `204` on its own, so the transition happens on
     * the next load rather than being animated over the result.
     */
  }, []);

  if (lookup.kind === 'asking') {
    return (
      <main className="mx-auto max-w-[1600px] px-8 py-16">
        <p role="status" className="text-body tracking-widest text-faint uppercase">
          Checking for a battle in progress…
        </p>
      </main>
    );
  }

  if (lookup.kind === 'none') return <>{fallback}</>;

  return (
    <BattleScreen
      started={lookup.started}
      onConcluded={onConcluded}
      {...(onLeave ? { onLeave } : {})}
      {...(onUnauthenticated ? { onUnauthenticated } : {})}
    />
  );
}
