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
  /**
   * The rune effect(s) that put something in this pip, comma-joined (021 US4).
   *
   * **A declared prop rather than a spread**, because this component does not take
   * arbitrary attributes — and a `data-` attribute passed to something that
   * ignores it is a test selector that silently matches nothing. It is deliberately
   * separate from `label`: the label is prose a screen reader speaks, this is the
   * machine-readable fact a Playwright check counts.
   */
  readonly rune?: string;
}

export function StatusPip({
  kind,
  stacks,
  sealed,
  duration,
  label,
  rune,
}: StatusPipProps): React.JSX.Element {
  return (
    <span
      /**
       * **A rune's pip wears a gold ring, and the ring is the point** (021 US4).
       *
       * The first cut carried the rune's name in `data-rune` and in `title`, and
       * a screenshot settled it: both are invisible. This row is deliberately not
       * interactive — the board's hover already drives the target read — so a
       * fact that needs a hover to appear is a fact a player never sees, and
       * *"the player can see what they bought"* was the whole user story.
       *
       * Gold because gold is already this design's *"yours, and it matters"*
       * accent — the stack badge and the active rail entry both use it. A ring
       * rather than another icon: the pip's 24px is spoken for by two numerals
       * that must not read as one number, and a third glyph would crowd them.
       */
      className={
        'relative inline-flex size-6 items-center justify-center' +
        (rune === undefined ? '' : ' rounded-full ring-1 ring-gold/70')
      }
      data-status-pip={kind}
      data-sealed={sealed || undefined}
      data-duration={duration ?? undefined}
      data-stacks={stacks !== undefined && stacks > 1 ? stacks : undefined}
      data-rune={rune}
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
