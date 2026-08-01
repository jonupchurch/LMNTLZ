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
import type { RuneAllocations } from './types.js';

export interface DestroyConfirmProps {
  readonly heroName: string;
  readonly slotLabel: string;
  /** The stage the existing rune reached. Rebuilding starts again at one. */
  readonly currentStage: number;
  /** `config.fullRuneCost` from `GET /v1/me/shards`. */
  readonly fullRuneCost: number;
  readonly spent: number;
  /**
   * What is actually on the rune. **Itemized rather than summarized** — see the
   * manifest below.
   */
  readonly allocations: RuneAllocations;
  /** The stage-4 effect, if this rune got that far. */
  readonly utility: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DestroyConfirm({
  heroName,
  slotLabel,
  currentStage,
  fullRuneCost,
  spent,
  allocations,
  utility,
  onConfirm,
  onCancel,
}: DestroyConfirmProps): JSX.Element {
  /**
   * **What is going, line by line.**
   *
   * The dialog used to say *"◈ 450 has gone into it"* and leave the player to
   * remember what that bought. A shard total is the wrong unit for this
   * decision: nobody is attached to 450 shards, they are attached to `+20
   * Might`. The export draws each line in `border:1px dashed #C0313A` over a red
   * wash — the empty-slot dash, because that is precisely what each of these is
   * about to become.
   *
   * Built from the rune the caller holds, so it cannot describe a rune that is
   * not the one being destroyed.
   */
  const losing: readonly { readonly key: string; readonly value: string; readonly label: string }[] =
    [
      ...Object.entries(allocations)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([stat, amount]) => ({ key: stat, value: `+${amount}`, label: stat })),
      ...(utility ? [{ key: 'utility', value: '◈', label: utility }] : []),
    ];
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

      {/*
       * The manifest. Rendered only when there is something on the rune — an
       * empty heading over an empty list would imply nothing is lost, which is
       * true and is better said by the list simply not being there.
       */}
      {losing.length > 0 && (
        <div className="mt-4">
          <h4 className="text-caption mb-2 font-mono tracking-[0.2em] text-slash-lit uppercase">
            Destroyed with it
          </h4>
          <ul className="flex flex-col gap-1.5" data-testid="forfeit-list">
            {losing.map((line) => (
              <li
                key={line.key}
                data-forfeit={line.key}
                className="lz-forfeit text-caption flex items-center gap-3 px-3 py-1.5 font-mono"
              >
                <span className="w-10 shrink-0 text-slash-lit">{line.value}</span>
                <span className="truncate text-muted uppercase">{line.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
