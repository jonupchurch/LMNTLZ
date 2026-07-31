/**
 * `RelationshipStrip` — **five tiers, and the design draws four** (017 T024,
 * T025 · FR-019).
 *
 * ### The one place this port deliberately departs from the export
 *
 * Four exports print `FAULT ×1.2` and none prints `×0.80` at all. The canon in
 * `resources/mechanics/` is a five-rung ladder — Bane ×1.50 · Fault ×1.25 ·
 * neutral ×1.00 · secondary ×0.80 · primary ×0.50 — and canon wins. The
 * discrepancy is logged in `resources/README.md`; nothing here should be
 * "corrected" back toward the picture.
 *
 * Every number below is **read from `@lmntlz/content`**, never typed. That is
 * what makes the departure permanent: `Effectiveness` is the closed union
 * `1.5 | 1.25 | 1.0 | 0.8 | 0.5`, so restoring the export's `1.2` is a compile
 * error rather than a review someone has to remember to run.
 *
 * ### Shape carries the meaning before colour does
 *
 * The export's rule, and it is an accessibility rule as much as a style one —
 * a strength is a shield, the Bane a downward chevron, the Fault a notched
 * square. Colour alone would leave the strip unreadable to a colour-blind
 * player, and the two weaknesses are the whole point of the component.
 */

import {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
  type DamageType,
  type Effectiveness,
  type Hero,
} from '@lmntlz/content';
import { TypeBadge } from './TypeBadge.js';

export interface RelationshipStripProps {
  readonly hero: Hero;
  /** Drops the labels for tile and chip scales; shape and colour survive. */
  readonly compact?: boolean;
}

interface Rung {
  readonly key: string;
  readonly label: string;
  /** `null` for the neutral rung — it names no force by definition. */
  readonly type: DamageType | null;
  readonly multiplier: Effectiveness;
  readonly glyph: string;
  readonly toneClass: string;
}

/**
 * `×1.50`, not `×1.5`. Two decimals throughout so the five rungs line up as a
 * column and so `0.80` reads as a tier rather than a rounding artefact.
 */
export const formatMultiplier = (value: Effectiveness): string => `×${value.toFixed(2)}`;

/** The five rungs, worst-for-this-hero first, exactly as the ladder is written. */
export function rungsFor(hero: Hero): readonly Rung[] {
  return [
    {
      key: 'bane',
      label: 'BANE',
      type: hero.bane,
      multiplier: BANE,
      glyph: '▼',
      toneClass: 'text-danger',
    },
    {
      key: 'fault',
      label: 'FAULT',
      type: hero.fault,
      multiplier: FAULT,
      glyph: '◧',
      toneClass: 'text-warning',
    },
    {
      key: 'neutral',
      label: 'NEUTRAL',
      type: null,
      multiplier: NEUTRAL,
      glyph: '—',
      toneClass: 'text-muted',
    },
    {
      key: 'secondary',
      label: 'RESISTS',
      type: hero.secondary,
      multiplier: RESISTED_SECONDARY,
      glyph: '◈',
      toneClass: 'text-air-lit',
    },
    {
      key: 'primary',
      label: 'RESISTS',
      type: hero.primary,
      multiplier: RESISTED_PRIMARY,
      glyph: '◆',
      toneClass: 'text-success',
    },
  ];
}

export function RelationshipStrip({
  hero,
  compact = false,
}: RelationshipStripProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1" data-testid="relationship-strip">
      {rungsFor(hero).map((rung) => (
        <li key={rung.key} className="flex items-center gap-2" data-rung={rung.key}>
          <span className={`w-4 text-center ${rung.toneClass}`} aria-hidden="true">
            {rung.glyph}
          </span>
          {!compact && (
            <span className="text-caption text-muted w-16 font-display tracking-wide">
              {rung.label}
            </span>
          )}
          {rung.type ? (
            <TypeBadge type={rung.type} size="compact" />
          ) : (
            <span className="w-5" aria-hidden="true" />
          )}
          <span className="font-mono text-caption tabular-nums">
            {formatMultiplier(rung.multiplier)}
          </span>
        </li>
      ))}
    </ul>
  );
}
