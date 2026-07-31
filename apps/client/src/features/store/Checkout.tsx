/**
 * The pay control — **and the statement descriptor beside it** (018 T027 ·
 * 011 T026 · FR-007).
 *
 * ### The descriptor is not a footnote
 *
 * An unrecognised line on a card statement is what a chargeback is made of, and
 * the moment to prevent one is while the player is looking at the button — not
 * in a footer they will scroll past and not in the receipt email that arrives
 * after the charge. So it is rendered adjacent to the control, in the same
 * visual group, and it comes from `GET /v1/catalog` rather than being written
 * here: it is an environment value that has to match what the provider
 * dashboard is configured with.
 *
 * ### No rail means no control, not a disabled one
 *
 * FR-009. `POST /v1/checkout` answers `503` when nothing is installed, and a
 * button that produces a 503 is worse than no button — the player assumes their
 * card was refused. The store says purchasing is unavailable and offers nothing
 * to click.
 *
 * ### Nothing auto-renews, and the payload says so
 *
 * `autoRenews: false` is served, not asserted in copy. A store that let a
 * player believe otherwise would be the single most expensive misunderstanding
 * available here.
 */

import type { JSX } from 'react';
import { money, type CatalogResponse, type Sku } from './types.js';

export interface CheckoutProps {
  readonly catalog: CatalogResponse;
  readonly sku: Sku | null;
  /** Days already held, so stacking can be stated rather than discovered. */
  readonly heldDaysRemaining: number;
  readonly busy: boolean;
  readonly onBuy: (sku: Sku) => void;
  readonly problem?: string | null;
}

export function Checkout({
  catalog,
  sku,
  heldDaysRemaining,
  busy,
  onBuy,
  problem,
}: CheckoutProps): JSX.Element {
  if (!catalog.available) {
    return (
      <section
        aria-label="Checkout"
        className="rounded-lg border border-line bg-surface p-4"
      >
        <p role="status" className="text-body text-muted">
          Purchasing is unavailable right now. Nothing here can be bought yet — this is
          not a problem with your account or your card.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Checkout" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      {sku === null ? (
        <p className="text-body text-muted">Choose a duration.</p>
      ) : (
        <>
          <p className="text-body text-parchment">
            {sku.days} days for {money(sku.price, catalog.currency)}.
          </p>

          {/**
           * **Stacking, stated before the purchase** (T028). Buying while a pass
           * is live adds to the end date — nothing is lost — and a player who
           * does not know that will wait, or worse, buy and think they lost the
           * remainder.
           */}
          {heldDaysRemaining > 0 && (
            <p className="text-caption font-mono text-gold">
              You hold {heldDaysRemaining} days. Buying adds to the end date rather than
              replacing it: {heldDaysRemaining} → {heldDaysRemaining + sku.days} days.
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => onBuy(sku)}
            className={[
              'text-caption self-start rounded border px-4 py-2 font-display tracking-widest uppercase',
              busy ? 'border-line text-faint' : 'border-gold bg-raised text-parchment hover:bg-gold/20',
            ].join(' ')}
          >
            {busy ? 'Opening checkout…' : `Pay ${money(sku.price, catalog.currency)}`}
          </button>

          {/* Adjacent to the control, deliberately — see the note above. */}
          <p className="text-caption font-mono text-faint">
            This appears on your statement as{' '}
            <span className="text-parchment">{catalog.statementDescriptor}</span>.
            {!catalog.autoRenews && ' Nothing renews automatically.'}
          </p>
        </>
      )}

      {problem ? (
        <p role="alert" className="text-caption font-mono text-slash-lit">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
