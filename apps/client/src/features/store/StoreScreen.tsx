/**
 * The Store — **one product, seven durations** (018 US2).
 *
 * ### What was missing
 *
 * Feature 011 built the catalog, the checkout, the webhook, the entitlement
 * fold, the receipt and the spend ceiling. **No screen.** 011 T026 says to put
 * the statement descriptor on the store screen and no task anywhere creates
 * one, which is how a whole feature ships without the surface it is for.
 *
 * ### It could not honestly ship until the pass paid
 *
 * `awardShards()` never read the entitlement, so a bought pass paid exactly
 * normal income. That is 011 Phase 8 and it landed first, deliberately: a store
 * selling a pass that does nothing is worse than no store, because unlike the
 * missing rail it fails **silently** and takes the money.
 *
 * ### Not one price is in this file
 *
 * Seven durations at seven prices come off `GET /v1/catalog`. The store export
 * prints them as literals in its own script and they are right today — same
 * rule as the Forge's stage table.
 *
 * ### And no rail means no control
 *
 * `catalog.available` is false when nothing is installed, and the screen says
 * purchasing is unavailable rather than offering a button that answers `503`.
 * A 503 on a pay button reads as *your card was refused*.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Panel } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { Checkout } from './Checkout.js';
import { Entitlements } from './Entitlements.js';
import {
  money,
  perDay,
  type CatalogResponse,
  type EntitlementsResponse,
  type ShardsSlice,
  type Sku,
} from './types.js';

export interface StoreScreenProps {
  readonly onUnauthenticated: () => void;
}

export function StoreScreen({ onUnauthenticated }: StoreScreenProps): JSX.Element {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [held, setHeld] = useState<EntitlementsResponse | null>(null);
  const [shards, setShards] = useState<ShardsSlice | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unauthenticated = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return true;
      }
      return false;
    },
    [onUnauthenticated],
  );

  const load = useCallback(async () => {
    try {
      const [cat, ent, sh] = await Promise.all([
        api<CatalogResponse>('/catalog'),
        api<EntitlementsResponse>('/me/entitlements'),
        api<ShardsSlice>('/me/shards'),
      ]);
      setCatalog(cat);
      setHeld(ent);
      setShards(sh);
      setError(null);
    } catch (err) {
      if (unauthenticated(err)) return;
      setError('Could not open the store.');
    }
  }, [unauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Longest first, which is how the export orders its rows. */
  const durations = useMemo(
    () => (catalog ? [...catalog.skus].sort((a, b) => a.days - b.days) : []),
    [catalog],
  );

  const selected = durations.find((s) => s.id === chosen) ?? null;

  const buy = async (sku: Sku): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const session = await api<{ url?: string }>('/checkout', {
        method: 'POST',
        body: JSON.stringify({ sku: sku.id }),
      });

      /**
       * The rail returns somewhere to go. **Not navigated automatically** — the
       * player pressed a pay button and should see where they are being sent,
       * and a `window.location` from inside a promise is the shape that breaks
       * on a popup blocker with no message.
       */
      if (session.url) window.location.assign(session.url);
      else setProblem('The payment provider did not return a checkout page.');
    } catch (err) {
      if (unauthenticated(err)) return;
      setProblem(
        err instanceof ApiError && err.status === 503
          ? 'Purchasing is unavailable right now. Nothing was charged.'
          : err instanceof ApiError && err.status === 409
            ? /**
               * **Refused before the rail was touched** (FR-010). The ceiling
               * check happens server-side ahead of the provider precisely so
               * money is never taken for something undeliverable.
               */
              'That purchase would take you past the shard cap, so it was refused before anything was charged.'
            : 'Could not start the checkout. Nothing was charged.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!catalog || !held || !shards) {
    return (
      <Panel span={12}>
        <p role="status" className="text-faint">
          {error ?? 'Opening the store…'}
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Panel span={12}>
        <header>
          <h1 className="text-h1 font-display uppercase tracking-wide">The Store</h1>
          <p className="text-body text-muted mt-1 max-w-3xl">
            {/**
             * **The design's own sentence, and it is the reason the ceiling is
             * served**: what is sold is speed, never ceiling. A full kit is a
             * common ceiling every player reaches; selling *time to reach it*
             * is categorically different from selling power.
             */}
            One pass, seven durations. It doubles what you earn — it does not raise what
            you can reach, and a paying player and a fully-kitted free player end up in
            exactly the same place.
          </p>
        </header>
      </Panel>

      <Panel span={8}>
        <section aria-label="Seven durations">
          <h2 className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
            Seven durations
          </h2>

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-3">
            {durations.map((sku) => {
              const best = sku.id === bestValue(durations)?.id;

              return (
                <li key={sku.id}>
                  <button
                    type="button"
                    aria-pressed={sku.id === chosen}
                    onClick={() => setChosen(sku.id)}
                    data-sku={sku.id}
                    className={[
                      'flex w-full flex-col gap-1 rounded-lg border-2 p-3 text-left transition-colors',
                      sku.id === chosen
                        ? 'border-gold bg-raised shadow-(--shadow-glow-gold)'
                        : 'border-line bg-surface hover:border-faint',
                    ].join(' ')}
                  >
                    <span className="text-h2 font-display uppercase tracking-wide text-parchment">
                      {sku.days} days
                    </span>
                    <span className="text-h3 font-mono text-gold">
                      {money(sku.price, catalog.currency)}
                    </span>
                    <span className="text-caption font-mono text-faint">
                      {/* Derived from two served numbers, so it cannot drift. */}
                      {perDay(sku, catalog.currency)}
                    </span>
                    {best && (
                      <span className="text-caption font-mono uppercase text-earth-lit">
                        best per day
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </Panel>

      <Panel span={4}>
        <div className="flex flex-col gap-4">
          <Checkout
            catalog={catalog}
            sku={selected}
            heldDaysRemaining={held.boostPass.daysRemaining}
            busy={busy}
            onBuy={(sku) => void buy(sku)}
            problem={problem}
          />

          <Entitlements entitlements={held} nextBoundaryAt={shards.today.nextBoundaryAt} />
        </div>
      </Panel>
    </>
  );
}

/**
 * The cheapest per day. **Computed, not flagged in the catalog** — it is a
 * comparison between served prices, so it cannot disagree with them, and
 * marking it in the payload would be a second place the ranking lives.
 */
function bestValue(skus: readonly Sku[]): Sku | null {
  let best: Sku | null = null;
  for (const sku of skus) {
    if (!best || sku.price / sku.days < best.price / best.days) best = sku;
  }
  return best;
}
