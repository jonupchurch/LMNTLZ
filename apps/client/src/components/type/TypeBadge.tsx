/**
 * `TypeBadge` — the signature component (017 T023 · FR-007).
 *
 * Takes a `DamageType` and **derives** its colour. There is no colour prop and
 * there will not be one: the nine forces are the brand, and a caller able to
 * override the fill could paint Fire with the Water token.
 *
 * The compact variant is sigil-only, for chips and the heat readout where the
 * label will not fit.
 */

import type { DamageType } from '@lmntlz/content';
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
 * The first letter, uppercased, as the stand-in sigil.
 *
 * **This is a placeholder for the authored sigils** and is deliberately not
 * pretending otherwise — the real glyphs arrive with the icon manifest in
 * T033/T034, keyed on the same nine forces. Until then a letter is honest and
 * a missing icon is not.
 */
const sigil = (type: DamageType): string => type.charAt(0).toUpperCase();

export function TypeBadge({ type, size = 'sm' }: TypeBadgeProps): React.JSX.Element {
  const compact = size === 'compact';
  return (
    <span
      className={`inline-flex items-center rounded-sm font-display font-semibold uppercase tracking-wide ${SIZE_CLASS[size]} ${FORCE_FILL[type]}`}
      data-force={type}
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
