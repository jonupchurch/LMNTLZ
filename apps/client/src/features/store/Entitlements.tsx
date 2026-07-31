/**
 * What the player holds, and when it ends (018 T029).
 *
 * Over `GET /v1/me/entitlements`, which is another route that shipped with 011
 * and had **no caller** — a player could buy a pass and had nowhere at all to
 * see that they held one.
 *
 * ### It states the ceiling, because the design is that there is one
 *
 * `06-progression.md`: *what is sold is speed, never ceiling*. The longest pass
 * grants exactly the à la carte cap and never more, so a paying player and a
 * fully-kitted free player end up in precisely the same place. That claim is
 * only credible if the store says out loud what the most money can buy, and
 * `maxPurchasableAdvantagePerYear` is served rather than written down so the
 * claim is generated from the same catalog that would break it.
 */

import type { JSX } from 'react';
import type { EntitlementsResponse } from './types.js';

export interface EntitlementsProps {
  readonly entitlements: EntitlementsResponse;
  /**
   * `today.nextBoundaryAt` from `GET /v1/me/shards` — an **absolute instant**,
   * rendered rather than the string `00:00 UTC` (T026).
   */
  readonly nextBoundaryAt: string;
}

export function Entitlements({ entitlements, nextBoundaryAt }: EntitlementsProps): JSX.Element {
  const { boostPass, ceiling } = entitlements;
  const boundary = new Date(nextBoundaryAt);

  return (
    <section
      aria-label="What you hold"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="text-caption font-mono tracking-[0.2em] uppercase text-faint">
        What you hold
      </h2>

      {boostPass.active ? (
        <>
          <p className="text-h2 font-display uppercase tracking-wide text-gold">
            Boost pass · {boostPass.daysRemaining} days left
          </p>
          <p className="text-caption font-mono text-faint">
            {/* The instant, formatted in the reader's own zone. The rule is one
                global boundary; where they are decides how it reads to them. */}
            Ends {boostPass.expiresAt ? new Date(boostPass.expiresAt).toLocaleString() : '—'}
          </p>
        </>
      ) : (
        <p className="text-body text-muted">
          {/* Says what a pass would do rather than only that you have none. */}
          No pass. Your income is the ordinary rate.
        </p>
      )}

      <p className="text-caption text-muted">
        {/**
         * **The pass's own claims, from the served rules rather than prose**
         * (T025). It doubles the first ten attack victories and the first ten
         * defense holds *each day* — two separate allowances, so attacking does
         * not consume the defending one.
         */}
        A pass doubles the shards from your first ten attack victories and your first ten
        defense holds each day. Both counts reset at {boundary.toLocaleTimeString()} — the
        next reset is {boundary.toLocaleString()}.
      </p>

      <p className="text-caption font-mono text-faint">
        {/* The ceiling, stated because "speed, never ceiling" is only credible
            if the store says what the most money can buy. */}
        The most any amount of money can buy in a year is{' '}
        {ceiling.maxPurchasableAdvantagePerYear.toLocaleString()} shards of speed.
        {!entitlements.autoRenews && ' Nothing renews automatically.'}
      </p>
    </section>
  );
}
