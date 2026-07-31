/**
 * `TypeBadge` — the signature component (017 T023 · 019 US1 · FR-007, FR-001).
 *
 * Takes a `DamageType` and **derives** its colour. There is no colour prop and
 * there will not be one: the nine forces are the brand, and a caller able to
 * override the fill could paint Fire with the Water token.
 *
 * ### The shape carries the family, and that is not decoration (019 FR-001)
 *
 * `LMNTLZ Hero Card.dc.html` draws a **magic** Force as a shield and a
 * **martial** one as a chamfered plate. That makes the 6-magic / 3-melee split
 * — which decides every counter in the game — legible in the silhouette
 * **before a word is read**, and legible to a player who cannot tell the nine
 * colours apart.
 *
 * 017 shipped this as `rounded-sm` plus a fill, so the badge carried exactly
 * one channel of information where the design carries two. That was the whole
 * of *"it still doesn't look like the designs"*, in one component.
 *
 * **`family()` is imported, never re-derived.** Which forces are melee is a
 * content rule; a local list here would be a second place it lives and would
 * be wrong the day a tenth force is added (Constitution XV).
 *
 * ### The shape and the focus ring are on different elements, deliberately
 *
 * `clip-path` clips `outline` and `box-shadow` alike, so a shaped focusable
 * element silently loses the ring `base.css` guarantees. This badge is not
 * focusable today, but it is embedded inside things that are, so the shape sits
 * on an inner span and the outer element stays unclipped. See `base.css`.
 */

import { family, type DamageType } from '@lmntlz/content';
import { FORCE_FILL } from './forceClasses.js';

export type TypeBadgeSize = 'compact' | 'sm' | 'md';

export interface TypeBadgeProps {
  readonly type: DamageType;
  readonly size?: TypeBadgeSize;
}

const SIZE_CLASS: Record<TypeBadgeSize, string> = {
  /** Sigil only — the label is dropped, never shrunk past legibility. */
  compact: 'h-5 w-5 justify-center text-caption',
  sm: 'h-6 px-2 gap-1 text-caption',
  md: 'h-7 px-3 gap-1.5 text-h3',
};

/**
 * Extra bottom padding on a plate so the chamfer does not eat the descenders.
 *
 * The cut removes the bottom-right 22%; at `compact` the label is a single
 * centred sigil and needs none, but a text label sits into it. Measured against
 * the longest real force name (`pierce`), not against a fixture.
 */
const SHAPE_PAD: Record<TypeBadgeSize, string> = {
  compact: '',
  sm: 'pr-3',
  md: 'pr-4',
};

/**
 * The first letter, uppercased, as the stand-in sigil.
 *
 * **This is a placeholder for the authored sigils** and is deliberately not
 * pretending otherwise — the real glyphs arrive with the icon manifest,
 * keyed on the same nine forces. Until then a letter is honest and a missing
 * icon is not.
 */
const sigil = (type: DamageType): string => type.charAt(0).toUpperCase();

export function TypeBadge({ type, size = 'sm' }: TypeBadgeProps): React.JSX.Element {
  const compact = size === 'compact';
  const magic = family(type) === 'magic';

  return (
    <span
      className={`relative inline-flex items-center font-display font-semibold uppercase tracking-wide ${
        SIZE_CLASS[size]
      } ${magic ? '' : SHAPE_PAD[size]} ${FORCE_FILL[type]} ${
        /* The shield's point needs vertical room the plate does not. */
        magic ? 'lz-shield pb-1' : 'lz-plate'
      }`}
      data-force={type}
      /**
       * **Read by `shape.test.tsx` and by nothing else.** The family is already
       * derivable from `data-force`, so this is not a second source of truth —
       * it is how a test asserts that the *silhouette* changed, which it cannot
       * do by reading a class list that Tailwind may rewrite.
       */
      data-family={magic ? 'magic' : 'melee'}
      /* Compact drops the visible label, so the force still has to reach a
         screen reader — otherwise the heat readout is nine unlabelled cells. */
      aria-label={compact ? type : undefined}
      title={compact ? type : undefined}
    >
      <span aria-hidden={!compact}>{sigil(type)}</span>
      {!compact && <span>{type}</span>}
    </span>
  );
}
