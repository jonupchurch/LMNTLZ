/**
 * `HeroPortrait` — a champion's illustration, resolved by id (019 US3).
 *
 * The squad screen is **portrait-led**: the formation seats, the picker's 27
 * cards and the loadout rail are all art with a label over it, and without the
 * art none of them look like anything. That is why this exists at the component
 * layer rather than inside `features/squads` — the Roster, the Codex and the
 * battle screen want the same thing.
 *
 * ### Two widths, chosen by the browser
 *
 * `tools/build-portraits.py` emits 240w and 480w WebP, and this hands both to
 * the browser with a `sizes` hint so a 176px picker card takes the 240 and the
 * same card on a 2x display takes the 480. Naming one `src` and hoping would
 * ship 27 × 53 kB to every laptop.
 *
 * ### The crop lives here, not in the asset
 *
 * Source art is 948×1659 (0.571) and **every** card on screen is wider than
 * that, so `object-cover object-top` does the cropping. Baking a crop into the
 * asset would fix one card's framing into a file four cards share.
 *
 * ### Two layers over the art, and they do different jobs
 *
 * A **wash** in the House colour makes the Force legible at a size where the
 * emblem is 14px — see `FORCE_WASH`. A **scrim** is a bottom-up ramp to `void`
 * so a name can sit on top of an illustration whose bottom edge is arbitrary.
 * The scrim is legibility and the wash is identity; a single combined layer
 * would have to compromise one for the other.
 */

import type { DamageType, HeroId } from '@lmntlz/content';
import { FORCE_WASH } from '../type/forceClasses.js';
import { HERO_PORTRAITS } from './portraits.generated.js';

export interface HeroPortraitProps {
  readonly heroId: HeroId;
  /**
   * The hero's name, for the accessible label.
   *
   * Omitted on every card that prints the name beside the art — announcing it
   * twice is noise, which is the call `HeroIcon` already makes.
   */
  readonly name?: string;
  /** Which House's colour washes the art. A hero's `primary`. */
  readonly force: DamageType;
  /**
   * The CSS `sizes` hint. Defaults to the picker card's width, which is where
   * 27 of the 28 portraits on the squad screen land.
   */
  readonly sizes?: string;
  /** A bottom-up ramp to `void`, so a label can sit over the art. */
  readonly scrim?: boolean;
  /**
   * Fill the positioned ancestor, so a label can be laid over the art.
   *
   * ### ⚠️ This exists because passing `absolute` in `className` DOES NOT WORK
   *
   * The root needs a `position` of its own — the wash and the scrim are
   * `absolute inset-0` against it — so it used to hardcode `relative` and let
   * callers "override" it with `absolute inset-0`. **They cannot.** Tailwind
   * emits `.absolute` *before* `.relative`, and CSS resolves a tie by
   * stylesheet order rather than by the order of names in a `class` attribute,
   * so `relative` won every time.
   *
   * The failure is silent and total: the portrait lands in normal flow at full
   * card height and everything after it — name, reach, Force, Bane — is pushed
   * below the card and clipped away by `overflow-hidden`. The cards rendered as
   * bare illustrations for a day, with every label present in the DOM and none
   * of it on screen, which is why no test saw it.
   *
   * So the choice is a **prop**, resolved here, and there is exactly one
   * `position` class on the element either way.
   */
  readonly fill?: boolean;
  /**
   * Extra classes for the frame.
   *
   * **Never a `position` utility** — use `fill`. See above for what happens.
   */
  readonly className?: string;
}

export function HeroPortrait({
  heroId,
  name,
  force,
  sizes = '176px',
  scrim = false,
  fill = false,
  className = '',
}: HeroPortraitProps): React.JSX.Element {
  const art = HERO_PORTRAITS[heroId];

  return (
    <span
      /* Exactly one `position` class, chosen here. Two would be a coin flip
         decided by Tailwind's emit order — see `fill`. */
      className={`${fill ? 'absolute inset-0' : 'relative'} block overflow-hidden ${className}`}
      data-hero-portrait={heroId}
    >
      <img
        src={art.w480}
        srcSet={`${art.w240} 240w, ${art.w480} 480w`}
        sizes={sizes}
        alt={name ? `${name}` : ''}
        aria-hidden={name ? undefined : true}
        /* 27 of these land on the squad screen at once and the picker is below
           the fold — the same call `HeroIcon` makes for the emblems. */
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover object-top"
      />
      <span aria-hidden className={`absolute inset-0 ${FORCE_WASH[force]}`} />
      {scrim ? (
        <span
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-void via-void/60 via-45% to-transparent"
        />
      ) : null}
    </span>
  );
}
