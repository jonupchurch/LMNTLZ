/**
 * Force → Tailwind classes. **The single place a damage type becomes a colour**
 * (017 T023 · FR-007, Constitution XV).
 *
 * ### Why a lookup table and not a prop
 *
 * No component accepts a colour. It accepts the *force* and comes here. A
 * `color` prop would let a caller paint Fire with the Water token and nothing
 * would catch it — the colour would have become a second source of truth for a
 * rule that lives in `@lmntlz/content`.
 *
 * ### Why the class strings are written out in full
 *
 * Tailwind scans source text for class names, so `` `bg-${type}` `` produces
 * nothing at all — the utility is never generated and the badge renders
 * transparent. Every class below is a complete literal for that reason. It
 * looks redundant and it is what makes the file work.
 *
 * ### Ink is dark on every fill, and that is the export's rule
 *
 * *"Sigil + label in the House colour, dark ink on core fill so contrast holds
 * on Air and Light as well as Dark."* Air (#8FCFE0) and Light (#F2C744) are
 * bright enough that white would fail on them, so one ink colour that works
 * everywhere beats a per-force decision nobody can audit.
 */

import type { DamageType } from '@lmntlz/content';

/** Solid fill in the force's core colour, dark ink. Badges and chips. */
export const FORCE_FILL: Record<DamageType, string> = {
  earth: 'bg-earth text-void',
  air: 'bg-air text-void',
  fire: 'bg-fire text-void',
  water: 'bg-water text-void',
  light: 'bg-light text-void',
  dark: 'bg-dark text-void',
  slash: 'bg-slash text-void',
  pierce: 'bg-pierce text-void',
  crush: 'bg-crush text-void',
};

/** The force as text on a dark ground — uses the lit step so small text holds. */
export const FORCE_TEXT: Record<DamageType, string> = {
  earth: 'text-earth-lit',
  air: 'text-air-lit',
  fire: 'text-fire-lit',
  water: 'text-water-lit',
  light: 'text-light-lit',
  dark: 'text-dark-lit',
  slash: 'text-slash-lit',
  pierce: 'text-pierce-lit',
  crush: 'text-crush-lit',
};

/** A 1px rim in the force's colour. Frames, wells and hovered rows. */
export const FORCE_RING: Record<DamageType, string> = {
  earth: 'ring-earth',
  air: 'ring-air',
  fire: 'ring-fire',
  water: 'ring-water',
  light: 'ring-light',
  dark: 'ring-dark',
  slash: 'ring-slash',
  pierce: 'ring-pierce',
  crush: 'ring-crush',
};

/** The deep step, for fills that sit *behind* content rather than carry it. */
export const FORCE_DEEP: Record<DamageType, string> = {
  earth: 'bg-earth-deep',
  air: 'bg-air-deep',
  fire: 'bg-fire-deep',
  water: 'bg-water-deep',
  light: 'bg-light-deep',
  dark: 'bg-dark-deep',
  slash: 'bg-slash-deep',
  pierce: 'bg-pierce-deep',
  crush: 'bg-crush-deep',
};

/**
 * **A bar is a gradient, deep to base** (019 US1 · FR-002).
 *
 * `LMNTLZ Battle.dc.html` fills every health bar with
 * `linear-gradient(90deg, <force>-deep, <force>)` — four times on one screen —
 * and the client filled them with one flat colour. On a 2px bar that is
 * invisible; on a health bar, which is where a player spends the whole fight
 * looking, it is the difference between a readout and a coloured rectangle.
 *
 * Written as `bg-linear-to-r from-x-deep to-x` rather than an arbitrary value,
 * so the two stops stay tokens and a force's shade can be retuned in one place.
 * Written out per force rather than interpolated for the reason at the top of
 * this file: **Tailwind scans source text**.
 */
export const FORCE_GRADIENT: Record<DamageType, string> = {
  earth: 'bg-linear-to-r from-earth-deep to-earth',
  air: 'bg-linear-to-r from-air-deep to-air',
  fire: 'bg-linear-to-r from-fire-deep to-fire',
  water: 'bg-linear-to-r from-water-deep to-water',
  light: 'bg-linear-to-r from-light-deep to-light',
  dark: 'bg-linear-to-r from-dark-deep to-dark',
  slash: 'bg-linear-to-r from-slash-deep to-slash',
  pierce: 'bg-linear-to-r from-pierce-deep to-pierce',
  crush: 'bg-linear-to-r from-crush-deep to-crush',
};

/**
 * A wash laid *over* hero art in the force's deep step (019 US2).
 *
 * The squad screen's cards are portrait-led, and 27 unrelated illustrations
 * side by side read as 27 unrelated illustrations. A single low-opacity wash in
 * the House colour is what makes the grid read as one roster and makes a
 * champion's Force legible at picker size, where the emblem is 14px.
 *
 * Kept low deliberately: at `/40` the art is still the art. This is a tint, not
 * a filter, and the moment it stops looking like a painting it has gone too far.
 */
export const FORCE_WASH: Record<DamageType, string> = {
  earth: 'bg-earth-deep/40',
  air: 'bg-air-deep/40',
  fire: 'bg-fire-deep/40',
  water: 'bg-water-deep/40',
  light: 'bg-light-deep/40',
  dark: 'bg-dark-deep/40',
  slash: 'bg-slash-deep/40',
  pierce: 'bg-pierce-deep/40',
  crush: 'bg-crush-deep/40',
};

/**
 * The three-letter column heads the nine-type heat readout uses.
 *
 * Transcribed from the export's grid (`EAR AIR FIR WAT LGT DRK SLA PRC CRU`)
 * rather than sliced from the type name — `light` would abbreviate to `LIG`
 * and the export writes `LGT`.
 */
export const FORCE_ABBR: Record<DamageType, string> = {
  earth: 'EAR',
  air: 'AIR',
  fire: 'FIR',
  water: 'WAT',
  light: 'LGT',
  dark: 'DRK',
  slash: 'SLA',
  pierce: 'PRC',
  crush: 'CRU',
};
