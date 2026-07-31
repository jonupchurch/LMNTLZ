/**
 * The three marks in a card's upper-left corner: who she is, and both Forces
 * she deals (019 US2).
 *
 * ### Why all three, and why in one corner
 *
 * A card carries two different facts and they were competing for the same
 * bottom strip. *Who* — the emblem — is how a player finds the champion they
 * already have in mind among 27. *What she deals* — `primary` and `secondary` —
 * is how a player counter-builds, which is the whole game. Printed as words
 * they cost two lines and truncate; drawn as marks they cost one row and read
 * at a glance.
 *
 * **Both Forces, never just the House.** Coverage is the union of `strengths`
 * everywhere else in this feature — `analysis.ts`, the picker's filter, the
 * readout's coverage row — and a card that showed only `primary` would hide
 * half of what a champion can open, on the screen where that decision is made.
 * A card and a filter disagreeing about what a champion deals is worse than
 * either being wrong alone.
 *
 * ### The badge variant, and the size floor
 *
 * `resources/damage-types/README.md` draws two variants and says which is
 * which: the **badge** is the one built to hold over painted art, and it is
 * drawn to read down to ~20px and no smaller. These sit on portraits, so badge
 * it is, at `pip` — which is exactly that 20px floor. Anything smaller here
 * would be a shape nobody can resolve, and the shapes are how the magic/martial
 * split stays legible to a player who cannot tell the nine colours apart.
 *
 * The secondary is drawn a step down in opacity. Both are real and both are
 * dealt, but `primary` is the House, the wash on the art and the source of the
 * Bane — a flat pair would say the two rank equally, and they do not.
 */

import type { DamageType, HeroId } from '@lmntlz/content';
import { HeroIcon } from '../icons/HeroIcon.js';
import { TypeIcon } from '../icons/TypeIcon.js';

export interface HeroMarksProps {
  readonly heroId: HeroId;
  readonly primary: DamageType;
  readonly secondary: DamageType;
  /**
   * The hero's name, for the accessible label.
   *
   * Pass it when this cluster is the only thing naming her. Every card that
   * prints the name in its title strip omits it — announcing it twice is noise.
   */
  readonly name?: string;
}

export function HeroMarks({
  heroId,
  primary,
  secondary,
  name,
}: HeroMarksProps): React.JSX.Element {
  return (
    <span
      /**
       * One label for the group rather than three separate announcements. A
       * screen reader offered `emblem, earth damage, fire damage` gets the parts
       * and has to assemble the sentence; this is the sentence.
       */
      role="img"
      aria-label={`${name ? `${name}: ` : ''}${primary} primary, ${secondary} secondary`}
      data-hero-marks={heroId}
      className="pointer-events-none flex items-center gap-1 drop-shadow-[0_2px_6px_rgba(14,12,23,0.85)]"
    >
      <HeroIcon heroId={heroId} size="chip" />
      <TypeIcon type={primary} variant="badge" size="pip" />
      <span className="opacity-70">
        <TypeIcon type={secondary} variant="badge" size="pip" />
      </span>
    </span>
  );
}
