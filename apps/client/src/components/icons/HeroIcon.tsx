/**
 * `HeroIcon` — a hero's emblem, resolved by id (017 T036 · FR-010).
 *
 * `heroId` is `HeroId`, the 27-value literal union, so **a typo is a build
 * error**: `<HeroIcon heroId="h99" />` does not compile, and neither does the
 * manifest if a hero is added without an icon. That is the whole point of the
 * generated `Record<HeroId, string>` — the alternative is a blank square that
 * nobody notices until a player mentions it.
 *
 * The emblems carry their own colours (each is drawn in its House's palette),
 * so this takes no tone and no force. The hero already determines both.
 */

import type { HeroId } from '@lmntlz/content';
import { HERO_ICONS } from './icons.generated.js';

export type HeroIconSize = 'chip' | 'tile' | 'detail';

export interface HeroIconProps {
  readonly heroId: HeroId;
  readonly size?: HeroIconSize;
  /** The hero's name, for the accessible label. */
  readonly name?: string;
}

const SIZE: Record<HeroIconSize, string> = {
  chip: 'size-8',
  tile: 'size-12',
  detail: 'size-20',
};

export function HeroIcon({ heroId, size = 'tile', name }: HeroIconProps): React.JSX.Element {
  return (
    <img
      src={HERO_ICONS[heroId]}
      /* Empty alt when there is no name: the emblem sits beside the name on
         every card, so announcing it twice is noise. With a name it is the
         only label, and it is used. */
      alt={name ? `${name} emblem` : ''}
      aria-hidden={name ? undefined : true}
      data-hero-icon={heroId}
      className={`${SIZE[size]} shrink-0 rounded-sm`}
      /* Emblems are decorative-adjacent and never above the fold in bulk —
         27 of them land on the roster screen at once. */
      loading="lazy"
      draggable={false}
    />
  );
}
