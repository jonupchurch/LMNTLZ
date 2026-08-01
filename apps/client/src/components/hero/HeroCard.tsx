/**
 * `HeroCard` — **let the portrait carry the card** (017 T026, rebuilt in 019).
 *
 * That sentence is the h1 of `LMNTLZ Hero Card.dc.html`, and until 019 this
 * component did the opposite. It was a text card: a 20px emblem, a name, a role,
 * an HP meter and the five-rung effectiveness ladder, on a chamfered surface. The
 * export draws three shapes and **all three are an illustration with UI over its
 * darkened lower third** — wide for detail, tall for battle, tile for browsing 27.
 *
 * What that cost was measurable rather than aesthetic. On the roster it rendered
 * **135 rows of `×1.50 / ×1.25 / ×1.00 / ×0.80 / ×0.50`** — the same five numbers
 * 27 times — and truncated **13 of the 27 champion names** to fit them, so the
 * one field a player scans by was the field that got cut. `DoorCluster` carries
 * the same four Forces in a 34px corner and gives the name its own line.
 *
 * ### The three scales still carry the same data
 *
 * The contract's rule holds: *"all three scales carry the same data; only density
 * differs, so a caller never loses information by choosing a smaller one."*
 *
 * `compact` swapping the ladder for the cluster is a density change, not a data
 * change — the ladder's five multipliers are **fixed constants** identical for
 * every champion, and the four Forces are what vary. Dropping the constants and
 * keeping the variables is the definition of getting denser. HP is the one thing
 * `compact` genuinely omits, and only when no `hp` is passed: on a browsing grid
 * every champion is undamaged, so the bar is 27 identical full meters.
 *
 * > **There is no epithet in the data.** The export writes "NYXARA / the Kind
 * > Veil", and `AuthoredHero` has `id`, `name` and `slug` — no epithet field
 * > anywhere in `@lmntlz/content`. Nothing is rendered for it rather than a
 * > placeholder being invented; it is either authoring that has not happened or
 * > flavour the export added, and the roster is the authority.
 *
 * **HP is `Toughness × 50`**, computed here rather than stored — `CLAUDE.md`
 * fixes the formula and a second copy of it is a second thing to get wrong.
 */

import type { Hero, HeroId } from '@lmntlz/content';
import { HeroIcon } from '../icons/HeroIcon.js';
import { RelationshipStrip } from '../type/RelationshipStrip.js';
import { TypeBadge } from '../type/TypeBadge.js';
import { FORCE_RING } from '../type/forceClasses.js';
import { Meter } from '../readouts/Meter.js';
import { Pill } from '../readouts/Pill.js';
import { DoorCluster } from './DoorCluster.js';
import { HeroPortrait } from './HeroPortrait.js';

export type HeroCardScale = 'compact' | 'standard' | 'full';

export interface HeroCardProps {
  readonly hero: Hero;
  readonly scale?: HeroCardScale;
  /** Current HP. Omitted means undamaged — and on `compact`, means no meter. */
  readonly hp?: number;
  readonly onSelect?: (hero: Hero) => void;
  /**
   * Take the width of the container instead of the scale's own (017 T048).
   *
   * `LMNTLZ Roster.dc.html` lays the champions out on
   * `repeat(auto-fill, minmax(158px, 1fr))` — tracks that are *at least* the
   * floor and then share what is left over. A fixed-width card in a track that
   * grew leaves dead space on the right of every column, so the grid reads as
   * ragged rather than as a grid.
   *
   * `scale` still chooses the padding, the gap and — through `compact` — how
   * much is drawn. Only the width defers. **The floor still comes from the
   * scale**: the caller's `minmax()` is what must not go below 160px, which is
   * the same number `compact` would have set.
   */
  readonly fill?: boolean;
}

/** `CLAUDE.md`: `HP = Toughness × 50`. */
export const maxHpOf = (hero: Hero): number => hero.stats.toughness * 50;

const WIDTH: Record<HeroCardScale, string> = {
  compact: 'w-40',
  standard: 'w-56',
  full: 'w-75',
};

/**
 * The export's crops, per its own "Portrait crop rules" panel: the tile is
 * tighter with the face in the upper third, the larger shapes give the figure
 * more room. `object-top` in `HeroPortrait` does the work; this is the box.
 */
const ART: Record<HeroCardScale, string> = {
  compact: 'aspect-[158/214]',
  standard: 'aspect-[224/240]',
  full: 'aspect-[300/300]',
};

export function HeroCard({
  hero,
  scale = 'standard',
  hp,
  onSelect,
  fill = false,
}: HeroCardProps): React.JSX.Element {
  const max = maxHpOf(hero);
  const compact = scale === 'compact';
  const Root = onSelect ? 'button' : 'div';

  return (
    <Root
      {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(hero) } : {})}
      data-scale={scale}
      data-hero={hero.id}
      /**
       * **The frame takes the House colour** — `border:1px solid {{ h.frame }}`
       * in the Roster export, per champion, with a matching glow on hover. It is
       * the cheapest way to make a grid of 27 sort itself into nine families
       * before anything is read.
       *
       * ### The chamfer is gone, and that is deliberate
       *
       * The card used to carry `lz-plate`. A chamfer removes the bottom-right
       * ~22%, which is exactly where the export puts the door cluster — the two
       * cannot both have that corner. The export's own tile is a plain
       * `border-radius:10px` rectangle for this reason; the *shapes* on this card
       * are the marks inside it, which is where they carry meaning. That also
       * frees the focus ring to be an ordinary outline again, since there is no
       * `clip-path` on the root to eat it.
       */
      className={[
        'lz-surface relative flex flex-col overflow-hidden text-left ring-1',
        FORCE_RING[hero.primary],
        fill ? 'w-full' : WIDTH[scale],
        onSelect
          ? 'transition-shadow duration-(--duration-fast) hover:shadow-(--shadow-glow-air) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-air'
          : '',
      ].join(' ')}
    >
      {/* --- the art, and everything that sits over it -------------------- */}
      <span className={`relative block w-full ${ART[scale]}`}>
        <HeroPortrait
          heroId={hero.id as HeroId}
          force={hero.primary}
          sizes={compact ? '(max-width: 1600px) 20vw, 214px' : '300px'}
          scrim
          fill
        />

        {/* Top-left: the House. The export's 26px type badge. */}
        <span className="absolute top-2 left-2">
          <TypeBadge type={hero.primary} size="compact" />
        </span>

        {/*
          Bottom-left: who she is.

          `Hero['id']` is `string`, because it comes out of a zod schema and
          cannot narrow; `HeroIcon` wants the 27-value `HeroId` union. This is
          the one place the two meet, so the narrowing happens here, once, and
          is justified rather than sprinkled:

          **Every `Hero` originates in the generated roster**, and the manifest
          is `Record<HeroId, string>` built from that same roster — the two
          cannot disagree without `icons:build` failing first. What the union
          actually buys is unaffected by this line: a literal `heroId="h99"` is
          still a type error, and a hero added without an icon still breaks the
          build on the record's exhaustiveness.
        */}
        <span className="absolute bottom-2 left-2">
          <HeroIcon heroId={hero.id as HeroId} name={hero.name} size="chip" />
        </span>

        {/* Bottom-right: the four doors. */}
        <span className="absolute right-2 bottom-2">
          <DoorCluster hero={hero} />
        </span>
      </span>

      {/* --- the title strip, SOLID and beneath the art ------------------- */}
      {/*
        **A strip, never a scrim over the bottom of the illustration.** The
        squad-builder export settled this one and it applies identically here: a
        name over a painting is legible only while the pixels behind it stay
        dark, and the bottom edge of 27 different illustrations is not something
        anybody controls. The scrim above is for the marks, which are opaque
        shapes; the text gets its own ground.
      */}
      <span className={`flex flex-col gap-1 bg-surface ${compact ? 'p-2' : 'p-3'}`}>
        {/*
          **The name gets the whole line, and the reach chip drops to the row
          below.** Sharing a line with the chip cost `Hettamar Ironfall` and
          `Reyna Two-Rivers` their last four characters at the 160px floor — and
          the name is the field a player scans by, so it is the one field that
          must never be the thing that gets cut. The export lays it out this way
          for the same reason: a title line, then `epithet · R2` beneath it.
        */}
        {/* `data-hero-name` is how the e2e clipping check finds this. It cannot
            select on `.font-display` — `TypeBadge` carries that class too and
            sits earlier in the card, so the check silently measured the badge
            and passed on a deliberately-truncated name. */}
        <span
          data-hero-name
          className="text-h3 block truncate font-display font-semibold uppercase"
        >
          {hero.name}
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-caption truncate font-mono uppercase text-muted">{hero.role}</span>
          {/* Reach gates all targeting, so it is the one stat that earns a place
              on a browsing tile. `shrink-0` — it is never what truncates. */}
          <span className="text-caption shrink-0 rounded-sm border border-air px-1 font-mono text-air">
            R{hero.reach}
          </span>
        </span>

        {/* HP only where it means something: a damaged champion, or a scale
            with room. 27 identical full meters on a browsing grid is noise. */}
        {(!compact || hp !== undefined) && (
          <Meter value={hp ?? max} max={max} tone={hero.primary} label="HP" bare={compact} />
        )}

        {!compact && (
          <span className="flex flex-wrap gap-1">
            <Pill label="MIGHT">{hero.stats.might}</Pill>
            <Pill label="SPD">{hero.stats.speed}</Pill>
          </span>
        )}

        {/* The full ladder at the scales that can hold it. `compact` carries the
            same four Forces through `DoorCluster` on the art above. */}
        {!compact && <RelationshipStrip hero={hero} />}
      </span>
    </Root>
  );
}
