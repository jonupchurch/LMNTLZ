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
 * re-reads on **navigation or an explicit spend**. A balance that is right once and then
 * quietly wrong for the rest of the session would be the exact failure the original
 * comment refused to ship — and until 2026-08-01 the Forge produced exactly that,
 * because navigation was the only trigger and forging does not navigate.
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
 * **`fulfilled` does not mean the body was there** — and reading it as though it did
 * white-screened the entire game.
 *
 * `api<T>()` is typed to return `T` and has two paths that do not: a `204` returns
 * `undefined`, and a body that will not parse as JSON is caught and returned as `null`
 * (`api.ts` — `res.json().catch(() => null)`). An HTML error page from a proxy, a
 * maintenance page, an edge 200 that is not JSON: all three land here as a *fulfilled*
 * promise carrying nothing.
 *
 * `previous.gearScore` on that `null` throws inside a `useState` updater in `App`, which
 * is above every screen and outside any error boundary — so **two header decorations
 * took down the whole application.** Caught by the e2e suite, where an unrouted request
 * falls through to the dev server and returns `index.html`; found only because 13 battle
 * specs went red at once.
 *
 * The rule this encodes: **a number beside a username may never be able to break the
 * game.** Anything unreadable is `undefined`, which the header already renders as absent.
 */
function numberOr<T>(
  settled: PromiseSettledResult<T | null | undefined>,
  read: (value: T) => unknown,
  fallback: number | undefined,
): number | undefined {
  if (settled.status !== 'fulfilled' || settled.value === null || settled.value === undefined) {
    return fallback;
  }
  const raw = read(settled.value);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

/**
 * @param signedIn Skip the requests entirely when nobody is signed in. Both routes are
 *   authenticated, so calling them on the landing screen buys two guaranteed 401s.
 * @param revision Changes on navigation. Any new value re-reads.
 * @param accountRevision Bumped by a screen that **spent or earned without navigating**.
 *
 * ### ⚠️ Navigation alone is not enough, and the reasoning that said it was is quoted
 * in `App.tsx`
 *
 * Reported by Jon, 2026-08-01: forge a rune stage and the header keeps the old shard
 * balance and the old roster power. The original key was the screen alone, on the
 * argument that *"every one of those ends with the player leaving the screen they did it
 * on."* **The Forge is the counter-example** — a player commits stage after stage on one
 * screen, and the Forge refetches its own state each time while the header, which reads
 * two different routes through this hook, never hears about it.
 *
 * Two parameters rather than one composite key, because the two triggers are genuinely
 * different: one is *where you are*, one is *what you did*. A caller that spends must say
 * so; there is no way to infer it from a screen that did not change.
 */
export function useAccountSummary(
  signedIn: boolean,
  revision: unknown,
  accountRevision: number = 0,
): AccountSummary {
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
        api<{ balance: number } | null>('/me/shards'),
        api<{ gearScore: number } | null>('/me/standing'),
      ]);

      if (cancelled) return;

      setSummary((previous) => ({
        /* Keep the last known figure on a failed refresh rather than blanking the
           header — the number was true a moment ago, and flicker reads as a bug. */
        shards: numberOr(shards, (v) => v.balance, previous.shards),
        power: numberOr(standing, (v) => v.gearScore, previous.power),
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, revision, accountRevision]);

  return summary;
}
