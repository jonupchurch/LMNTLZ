/**
 * **Melting a champion's runes down** (2026-08-01).
 *
 * ### This is the most destructive control in the game, and it is also a good deal
 *
 * `DestroyConfirm` guards one rune and gives nothing back. This destroys up to
 * three at once — every stage and every utility effect on the champion — and
 * returns a rate of what was placed. Both halves have to be equally visible: a
 * dialog that led with the refund would be selling, and one that led with the
 * destruction would be hiding the reason anybody would press it.
 *
 * So it shows the manifest first, priced, and the credit last. Same treatment as
 * `DestroyConfirm`'s losses — `lz-forfeit`, the export's dashed danger — because
 * these lines are about to become empty slots.
 *
 * ### Every number is served
 *
 * The rate, the per-slot value and the total all arrive from
 * `GET /v1/heroes/:heroId/runes` — the collection read beside the collection
 * delete. Nothing here computes 80% of anything: a client that did its own
 * arithmetic would be a second implementation of the refund, and the two would
 * disagree **quietly** the first time the rate moved — shown one number, paid
 * another, with nothing failing.
 *
 * The one thing this file does convert is `0.8` into `80%`, which is a *reading*
 * of a served number rather than a rule.
 */

import { useEffect, useRef, type JSX } from 'react';
import { Button } from '../../components/index.js';
import type { RefundQuote } from './types.js';

export interface RefundConfirmProps {
  readonly heroName: string;
  readonly quote: RefundQuote;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy?: boolean;
}

/** `0.8` → `80%`. A rate is served; a percentage is how a player reads it. */
const asPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

export function RefundConfirm({
  heroName,
  quote,
  onConfirm,
  onCancel,
  busy = false,
}: RefundConfirmProps): JSX.Element {
  const cancel = useRef<HTMLButtonElement>(null);

  /** Focus lands on keeping them — see `DestroyConfirm` for the sequence. */
  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="refund-title"
      aria-describedby="refund-body"
      className="rounded-lg border border-slash bg-surface p-5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 id="refund-title" className="text-h2 font-display uppercase tracking-wide text-slash-lit">
        Melt every rune on {heroName}
      </h3>

      {/*
       * **Both cases are written, because one rune is the common early case.**
       * The plural sentence reads "All 1 of Bramwen's runes are destroyed …
       * there is no way to melt only one", which is wrong twice over: the count
       * is ungrammatical and the caveat describes a choice the player does not
       * have. Caught by looking at it rather than by a test.
       */}
      <p id="refund-body" className="text-body mt-2 text-muted">
        {quote.slots.length === 1 ? (
          <>
            {heroName}&rsquo;s only rune is destroyed — every stage and any utility effect on it.{' '}
            <strong className="text-parchment">This cannot be undone.</strong>
          </>
        ) : (
          <>
            All {quote.slots.length} of {heroName}&rsquo;s runes are destroyed — every stage and
            every utility effect.{' '}
            <strong className="text-parchment">This cannot be undone</strong>, and there is no way
            to melt only one.
          </>
        )}
      </p>

      <div className="mt-4">
        <h4 className="text-caption mb-2 font-mono tracking-[0.2em] text-slash-lit uppercase">
          Destroyed
        </h4>
        <ul className="flex flex-col gap-1.5" data-testid="refund-list">
          {quote.slots.map((line) => (
            <li
              key={line.slot}
              data-refund-slot={line.slot}
              className="lz-forfeit text-caption flex items-center gap-3 px-3 py-1.5 font-mono"
            >
              <span className="w-20 shrink-0 text-parchment uppercase">{line.slot}</span>
              <span className="flex-1 truncate text-muted">
                stage {line.stage}
                {line.utility ? ` · ${line.utility}` : ''}
              </span>
              <span className="shrink-0 text-faint">◈ {line.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {/*
       * The credit, stated as the arithmetic rather than as a headline. A player
       * deciding this wants to see the 20% they are giving up, not only the 80%
       * they are getting — those are the same fact and only one of them reads as
       * a cost.
       */}
      <dl className="text-caption mt-4 flex flex-col gap-1 border-t border-line pt-3 font-mono">
        <div className="flex justify-between">
          <dt className="text-faint">Placed</dt>
          <dd className="tabular-nums text-muted">◈ {quote.invested}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-faint">Returned at {asPercent(quote.rate)}</dt>
          <dd className="tabular-nums text-gold" data-testid="refund-total">
            ◈ {quote.refund}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-faint">Lost</dt>
          <dd className="tabular-nums text-slash-lit">◈ {quote.invested - quote.refund}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button ref={cancel} variant="secondary" onClick={onCancel}>
          Keep the runes
        </Button>
        <Button variant="danger" state={busy ? 'disabled' : 'rest'} onClick={onConfirm}>
          Melt for ◈ {quote.refund}
        </Button>
      </div>
    </div>
  );
}
