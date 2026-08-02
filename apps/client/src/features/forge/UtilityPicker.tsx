/**
 * Stage 4 — choosing the effect the last 200 shards buy (021 T024).
 *
 * ### What this replaces
 *
 * The line *"This stage buys the utility effect rather than stat points, so there
 * is nothing to allocate."* It was accurate about the stat points and wrong about
 * everything else: there was nothing to allocate **and nothing to choose**, so the
 * most expensive stage of a rune took 200 shards and stored `null`.
 *
 * ### The catalog is imported, never restated
 *
 * Every name, description and pool below comes from `@lmntlz/sim/rules` — the same
 * module the resolver runs (Constitution XIII). The client may import
 * `@lmntlz/sim/rules` and is banned from `/resolver` and `/ai`, which is what makes
 * this safe: there is no second copy of the catalog to drift, rather than a rule
 * against writing one.
 *
 * **Which pool a slot offers is derived here too**, by `poolOf`, from the
 * champion's two authored fields — the identical derivation the server validates
 * against, because `slotAccepts` now delegates to it. The two cannot disagree, so
 * the Forge can never offer something the commit will refuse.
 */

import type { JSX } from 'react';
import { effectsForSlot, type RuneEffect } from '@lmntlz/sim/rules';
import type { RuneSlot } from './types.js';

export interface UtilityPickerProps {
  readonly heroId: string;
  readonly slot: RuneSlot;
  /** The chosen effect id, or `null` while the player is still deciding. */
  readonly chosen: string | null;
  readonly onChoose: (id: string | null) => void;
}

const ROLE_LABEL: Record<RuneEffect['role'], string> = {
  offense: 'offense',
  defense: 'defense',
  tempo: 'tempo',
};

export function UtilityPicker({
  heroId,
  slot,
  chosen,
  onChoose,
}: UtilityPickerProps): JSX.Element {
  const offered = effectsForSlot(heroId, slot);

  /**
   * **An empty pool says so plainly.** Until the whole catalog is authored some
   * pools hold fewer than their designed three, and a silently short list reads as
   * a choice rather than as work outstanding.
   */
  if (offered.length === 0) {
    return (
      <p role="status" className="text-caption font-mono text-faint" data-utility-pool="empty">
        No utility effect is available for this slot yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-utility-pool={offered.length}>
      <h3 className="text-caption font-mono tracking-[0.2em] uppercase text-faint">
        Utility effect · one of {offered.length}
      </h3>

      <ul className="flex flex-col gap-2">
        {offered.map((effect) => {
          const picked = effect.id === chosen;

          return (
            <li key={effect.id}>
              <button
                type="button"
                aria-pressed={picked}
                data-utility={effect.id}
                onClick={() => onChoose(picked ? null : effect.id)}
                className={[
                  'flex w-full flex-col gap-1 rounded border px-3 py-2 text-left transition-colors',
                  picked
                    ? 'border-gold bg-raised shadow-(--shadow-glow-gold)'
                    : 'border-line hover:border-faint',
                ].join(' ')}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-body font-display text-parchment">{effect.name}</span>
                  <span className="text-caption font-mono uppercase text-faint">
                    {ROLE_LABEL[effect.role]}
                  </span>
                </span>

                {/**
                 * **The whole condition and consequence, before anything is
                 * committed** (FR-022). A permanent, non-refundable purchase whose
                 * effect a player cannot read beforehand is the same class of
                 * defect as one that does nothing.
                 */}
                <span className="text-caption font-mono leading-relaxed text-muted">
                  {effect.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-caption font-mono text-faint">
        {/* Permanent once placed: the only ways back are destroy-and-restart or
            melting the champion down. Saying it here is cheaper than a dialog. */}
        Choosing is free. Committing is permanent — a placed effect cannot be traded
        for another.
      </p>
    </div>
  );
}
