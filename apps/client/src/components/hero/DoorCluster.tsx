/**
 * `DoorCluster` — a champion's four doors as a 2×2 of marks (019, roster tile).
 *
 * ### The single densest thing in the design, and it is the whole game
 *
 * LMNTLZ is counter-building: *read what your opponent is weak to and build
 * against it.* A champion's entire relationship profile is four Forces — two she
 * deals and two that open her — and `LMNTLZ Hero Card.dc.html` puts all four in
 * a 34×34 corner of the roster tile so a player scanning 27 champions reads them
 * without opening anything.
 *
 * The alternative shipped first and was much worse. `RelationshipStrip` prints
 * the five-rung ladder with its multipliers, which is right in a detail panel
 * and catastrophic on a grid: **135 rows of `×1.50 / ×1.25 / ×1.00 / ×0.80 /
 * ×0.50` on one screen**, identical numbers repeated 27 times, burying the four
 * Forces that actually differ. Density is not the same as information.
 *
 * ### Shape says WHICH DOOR · colour says WHICH FORCE
 *
 * The two axes are independent and that is what makes four marks readable at
 * 13px:
 *
 * | mark | shape | means |
 * |---|---|---|
 * | `primary` | shield | she deals this, and it is her House |
 * | `secondary` | shield | she deals this too |
 * | `bane` | **circle, ringed in `danger`** | ×1.50 against her — the major door |
 * | `fault` | chamfered plate | ×1.25 against her — the minor door |
 *
 * A strength and a weakness never share a silhouette, so **the cluster survives
 * colour-blindness**: the ringed circle is the thing to hit, whatever colour it
 * is. That is the same reason `TypeBadge` splits shield from plate — see
 * `resources/damage-types/README.md`.
 *
 * ### Every value is derived, none is authored
 *
 * `bane` and `fault` come off the `Hero`, which computed them as
 * `counter(primary)` and `counter(secondary)` in `@lmntlz/content`. This
 * component never re-derives them and never takes them as separate props —
 * Constitution XV, and the reason `resources/LORE-and-flavor.md` says *the doors
 * are not chosen*.
 */

import type { Hero } from '@lmntlz/content';
import { FORCE_FILL } from '../type/forceClasses.js';

export interface DoorClusterProps {
  readonly hero: Hero;
}

/*
 * ### One size, because there is one caller
 *
 * This shipped with a `size: 'tile' | 'detail'` prop and a second geometry
 * table, for a detail view that does not use it — the drawer draws the full
 * five-rung `RelationshipStrip`, which is canon where the export's four-rung
 * version is not. That is **a seam with no caller**, the defect this repo has
 * found more times than any other, written fresh. Deleted rather than left as a
 * branch nobody exercises; a second size can arrive with its second caller.
 *
 * The export's own geometry: shields taller than wide, weaknesses square. Note
 * it draws the Fault with a *dashed* border at 42–48px and **no border at all**
 * at the 13px tile size — a 1px dash is noise at that scale, so the shapes carry
 * the distinction here and the border is not missing, it is not drawn.
 */
const SHIELD = 'h-4 w-3.5';
const ROUND = 'h-3.5 w-3.5';

export function DoorCluster({ hero }: DoorClusterProps): React.JSX.Element {
  /*
   * The order is the export's and it is not arbitrary — it reads top row
   * "what she deals", bottom row "what opens her", so the two questions a
   * player is asking never interleave.
   */
  return (
    <span
      data-door-cluster
      className="grid grid-cols-2 gap-0.75 rounded-[5px] bg-void/78 p-1"
      /*
       * One label for the cluster rather than four. A screen reader announcing
       * "dark, water, light, fire" as four bare Forces says nothing about which
       * is a strength and which is a door; the sentence carries the roles that
       * the shapes carry visually.
       */
      role="img"
      aria-label={
        `Deals ${hero.primary} and ${hero.secondary}. ` +
        `Bane ${hero.bane}, fault ${hero.fault}.`
      }
    >
      <span data-door="primary" className={`lz-shield ${SHIELD} ${FORCE_FILL[hero.primary]}`} />
      <span data-door="secondary" className={`lz-shield ${SHIELD} ${FORCE_FILL[hero.secondary]}`} />
      {/*
       * **The ring is `danger`, not the Force's own colour.** The circle says
       * *this is the Force that beats her* and the red rim says *this one costs
       * you the most* — two facts, and collapsing them into one coloured disc
       * would make the Bane indistinguishable from the Fault at this size.
       */}
      <span
        data-door="bane"
        className={`rounded-full ring-[1.5px] ring-danger ${ROUND} ${FORCE_FILL[hero.bane]}`}
      />
      <span data-door="fault" className={`lz-plate-sm ${ROUND} ${FORCE_FILL[hero.fault]}`} />
    </span>
  );
}
