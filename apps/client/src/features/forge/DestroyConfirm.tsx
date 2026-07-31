/**
 * **Replacing a rune destroys it** (018 T011, T016 · FR-003).
 *
 * ### The warning is not the default action
 *
 * FR-003 and Constitution XVIII pull in the same direction here for once.
 * Rebuilding is a legitimate thing to want — the whole endgame use of shards is
 * re-speccing — so this does not block it. What it must not do is let a click
 * land on it by accident: a full rune is `fullRuneCost` shards, that is roughly
 * **1.7 days of typical income**, and there is no undo anywhere in the system.
 *
 * So the destructive control is the *secondary* one and Cancel takes the focus.
 * `409 needs_confirmation` on the server is the same rule enforced where it
 * cannot be skipped; this is the courtesy in front of it.
 *
 * ### The price is served, never typed
 *
 * `config.fullRuneCost`. The number is 650 today and appears nowhere in this
 * file — the same rule that took four hardcoded `650`s out of the guild screens
 * in 017 T057.
 */

import { useEffect, useRef, type JSX } from 'react';
import { Button } from '../../components/index.js';

export interface DestroyConfirmProps {
  readonly heroName: string;
  readonly slotLabel: string;
  /** The stage the existing rune reached. Rebuilding starts again at one. */
  readonly currentStage: number;
  /** `config.fullRuneCost` from `GET /v1/me/shards`. */
  readonly fullRuneCost: number;
  readonly spent: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DestroyConfirm({
  heroName,
  slotLabel,
  currentStage,
  fullRuneCost,
  spent,
  onConfirm,
  onCancel,
}: DestroyConfirmProps): JSX.Element {
  const cancel = useRef<HTMLButtonElement>(null);

  /**
   * **Focus lands on Cancel.** A dialog that opens with the destructive control
   * focused turns a stray Enter — from the keypress that opened it — into an
   * irreversible spend.
   */
  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="destroy-title"
      aria-describedby="destroy-body"
      className="rounded-lg border border-slash bg-surface p-5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 id="destroy-title" className="text-h2 font-display uppercase tracking-wide text-slash-lit">
        This destroys the rune
      </h3>

      <div id="destroy-body" className="text-body mt-2 flex flex-col gap-2 text-muted">
        <p>
          {heroName}&rsquo;s {slotLabel} rune is at stage {currentStage}, and ◈ {spent} has
          gone into it. Replacing it <strong className="text-parchment">destroys it</strong>{' '}
          — the stages are not refunded and the allocation is gone.
        </p>
        <p>
          {/* Stated because it is the part players get wrong: a rebuild is not
              a re-allocation of what is there, it is a new rune from stage one. */}
          The new rune starts again at stage one, so taking it back to complete costs ◈{' '}
          {fullRuneCost}.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {/* Cancel first in the DOM as well as focused: it is also the first tab stop. */}
        <Button ref={cancel} variant="secondary" onClick={onCancel}>
          Keep the rune
        </Button>
        {/* `danger` is the design's own vocabulary for this, and it is the one
            place in the Forge that earns it — the spend is irreversible. */}
        <Button variant="danger" onClick={onConfirm}>
          Destroy and rebuild
        </Button>
      </div>
    </div>
  );
}
