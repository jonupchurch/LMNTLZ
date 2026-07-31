/**
 * `TypeIcon` — one of the Nine, drawn rather than merely coloured (019 US2).
 *
 * ### Why this had to exist
 *
 * `resources/damage-types/` has carried two variants of all nine forces since
 * the icon pass and **nothing copied them into the client**, so every screen
 * said "Fire" with a red dot. That is one channel of information, and it is the
 * channel a player with a colour vision deficiency cannot read — on a game
 * whose entire strategy layer is *which force opens which door*.
 *
 * The shapes are the fix, and they are the same argument as `TypeBadge`'s
 * shield-versus-plate silhouette one level finer: a Force should be legible
 * before its colour is.
 *
 * ### Two variants, and the README says which goes where
 *
 * *"`type-*` — the bare glyph on a transparent artboard, with a 3.5px keyline
 * so it stays legible over element-coloured card frames, portraits, and light
 * panels. `badge-*` — the same glyph inside a dark disc ringed in the type
 * colour. Use this for damage callouts on a hero: it holds its shape against
 * portrait art and reads down to ~20px."*
 *
 * So: `badge` over art, `glyph` on a flat panel. The default is `glyph`,
 * because most uses are panels and the disc is a deliberate choice.
 *
 * Each carries its own colours — they are drawn in their House's palette — so
 * this takes no tone and no force class. The force already determines both.
 */

import type { DamageType } from '@lmntlz/content';
import { TYPE_BADGES, TYPE_ICONS } from './icons.generated.js';

export type TypeIconVariant = 'glyph' | 'badge';
export type TypeIconSize = 'pip' | 'chip' | 'tile' | 'detail';

export interface TypeIconProps {
  readonly type: DamageType;
  readonly variant?: TypeIconVariant;
  readonly size?: TypeIconSize;
  /**
   * Label it for a screen reader.
   *
   * **Off by default**, because the overwhelming majority of uses sit beside
   * the force's name in text and announcing it twice is noise — the call
   * `HeroIcon` already makes. Pass it when the icon is the only thing saying
   * which force this is.
   */
  readonly labelled?: boolean;
}

const SIZE: Record<TypeIconSize, string> = {
  /* The README's floor: the badge is drawn to read down to ~20px and no
     smaller, so `pip` is 20 and there is deliberately nothing below it. */
  pip: 'size-5',
  chip: 'size-6',
  tile: 'size-8',
  detail: 'size-12',
};

export function TypeIcon({
  type,
  variant = 'glyph',
  size = 'chip',
  labelled = false,
}: TypeIconProps): React.JSX.Element {
  return (
    <img
      src={variant === 'badge' ? TYPE_BADGES[type] : TYPE_ICONS[type]}
      alt={labelled ? `${type} damage` : ''}
      aria-hidden={labelled ? undefined : true}
      data-type-icon={type}
      data-variant={variant}
      className={`${SIZE[size]} shrink-0`}
      draggable={false}
    />
  );
}
