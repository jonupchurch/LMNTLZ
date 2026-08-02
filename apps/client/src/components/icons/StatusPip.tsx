/**
 * `StatusPip` — the 71-icon status registry (017 T037, wired 020 US4).
 *
 * ### It had no producer for three features, and now it has one
 *
 * The warning that stood here was accurate when it was written: *nothing in the
 * codebase constructs a status*, `board.ts` hardcoded `statuses: []`, and wiring
 * this would have created a component with no caller dressed up as working code.
 * 020 US1 gave the engine a status layer, US2 and US3 gave it 37 passives, and
 * `StatusRow` in `features/battle/` now renders one of these per effect on every
 * champion on the board.
 *
 * `kind` is typed on the icon registry rather than on the engine's `StatusKind`,
 * which is still the weak seam: the mapping between the two lives in
 * `statusIcons.ts` and is asserted by `icons.test.ts`, which reads `StatusKind`
 * out of the engine source so it moves when the engine does. That guard **is no
 * longer vacuous** — it caught `reach` the day it was added.
 *
 * ### The two numerals are deliberately different shapes
 *
 * `status-icons.md`: *"Distinguish [the stack count] from the duration numeral
 * clearly; they will sometimes appear on the same pip."* A burn stacked three
 * times with two turns left has to read as **×3, 2** and never as 32. So the
 * stack badge sits bottom-right in the accent colour and the duration sits
 * top-right in mono — different corner, different weight, different colour.
 */

import { STATUS_ICONS, type StatusIconKey } from './icons.generated.js';

export interface StatusPipProps {
  /**
   * The status's icon key. Typed on the registry, so the 71 keys that exist
   * are checked — what is *not* checked is whether the engine's eventual
   * status kinds map onto them.
   */
  readonly kind: StatusIconKey;
  /** Stack count. Rendered only when above 1 — "×1" is noise. */
  readonly stacks?: number;
  /** Sealed statuses cannot be cleansed; the export draws an overlay for it. */
  readonly sealed?: boolean;
  /**
   * Turns remaining, or **`null` for no numeral at all**.
   *
   * `null` covers both of `status-icons.md`'s numberless treatments — a
   * rest-of-battle effect, and an enemy's self-applied effect whose duration the
   * server withheld. Neither is a zero and neither is an unknown to be guessed
   * at: the design draws a pip with no number, and so does this.
   */
  readonly duration?: number | null;
  /** Spoken name for the pip, so the row is not twelve identical "burn" strings. */
  readonly label?: string;
}

export function StatusPip({
  kind,
  stacks,
  sealed,
  duration,
  label,
}: StatusPipProps): React.JSX.Element {
  return (
    <span
      className="relative inline-flex size-6 items-center justify-center"
      data-status-pip={kind}
      data-sealed={sealed || undefined}
      data-duration={duration ?? undefined}
      data-stacks={stacks !== undefined && stacks > 1 ? stacks : undefined}
      title={label ?? kind}
    >
      <img src={STATUS_ICONS[kind]} alt={label ?? kind} className="size-6" draggable={false} />
      {sealed && (
        <img
          src={STATUS_ICONS['overlay-sealed']}
          alt="sealed"
          className="absolute inset-0 size-6"
          draggable={false}
        />
      )}
      {stacks !== undefined && stacks > 1 && (
        <span className="text-caption absolute -right-1 -bottom-1 font-mono tabular-nums text-gold">
          {stacks}
        </span>
      )}
      {/**
       * **Top-right, mono, parchment — a different corner from the stack badge.**
       * The two share a pip often enough that a shared corner would read as one
       * two-digit number.
       */}
      {duration !== undefined && duration !== null && (
        <span className="text-caption absolute -top-1 -right-1 font-mono tabular-nums text-parchment">
          {duration}
        </span>
      )}
    </span>
  );
}
