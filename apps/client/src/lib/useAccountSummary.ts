/**
 * The two numbers the header carries beside a player's name: **shards and roster power**
 * (Jon, 2026-08-01).
 *
 * ### Why they were not there already
 *
 * `Header` has had a `shards` prop since 017 and `App` has never passed it — the session
 * payload carries no balance, and the prop's own comment argues correctly that rendering
 * `◈ 0` for an unknown balance *"is a false statement about a player's money that looks
 * authoritative."* Absent was the honest placeholder. This is the request that makes it
 * present instead: both numbers come from the server, so neither is ever a guess.
 *
 * **Roster power is `gearScore`**, the same number `leagueOf` reads to place a player in
 * a band. It is the account-level power figure the game already computes, recomputed on
 * every rune placement and never accumulated — so it answers *"how strong am I"* in the
 * units matchmaking actually uses. `RosterScreen`'s local `totalStats` is a different
 * thing and deliberately not shown as a number.
 *
 * ### ⚠️ A stale balance is worse than no balance
 *
 * Both numbers move constantly — a battle pays shards, forging spends them and moves
 * gear, melting a rune moves both — and this sits on a header that never unmounts. So it
 * re-reads on `revision`, which callers bump when they navigate. A balance that is right
 * once and then quietly wrong for the rest of the session would be the exact failure the
 * original comment refused to ship.
 *
 * `undefined` while unknown, never `0`: the caller renders nothing rather than a number
 * that means "we did not ask".
 */

import { useEffect, useState } from 'react';
import { api } from './api.js';

export interface AccountSummary {
  /** Spendable shard balance. `undefined` until the first successful read. */
  readonly shards: number | undefined;
  /** Roster power — the account's gear score. `undefined` until read. */
  readonly power: number | undefined;
}

/**
 * @param signedIn Skip the requests entirely when nobody is signed in. Both routes are
 *   authenticated, so calling them on the landing screen buys two guaranteed 401s.
 * @param revision Bump to force a re-read — screen changes, a settled battle, a forge.
 */
export function useAccountSummary(signedIn: boolean, revision: unknown): AccountSummary {
  const [summary, setSummary] = useState<AccountSummary>({ shards: undefined, power: undefined });

  useEffect(() => {
    if (!signedIn) {
      setSummary({ shards: undefined, power: undefined });
      return;
    }

    let cancelled = false;

    void (async () => {
      /**
       * **Settled independently, so one failure does not blank the other.**
       * `Promise.all` would reject the pair on a single bad response and drop a balance
       * the server had already returned — and these are two different routes with two
       * different reasons to fail.
       */
      const [shards, standing] = await Promise.allSettled([
        api<{ balance: number }>('/me/shards'),
        api<{ gearScore: number }>('/me/standing'),
      ]);

      if (cancelled) return;

      setSummary((previous) => ({
        /* Keep the last known figure on a failed refresh rather than blanking the
           header — the number was true a moment ago, and flicker reads as a bug. */
        shards: shards.status === 'fulfilled' ? shards.value.balance : previous.shards,
        power: standing.status === 'fulfilled' ? standing.value.gearScore : previous.power,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, revision]);

  return summary;
}
