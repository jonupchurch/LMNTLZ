/**
 * `HeroCard` — three scales carrying **the same data** (017 T026).
 *
 * The contract's rule, and it is the interesting one: *"all three scales carry
 * the same data; only density differs, so a caller never loses information by
 * choosing a smaller one."* A chip that dropped the relationship cluster would
 * make the battlefield the one screen where you cannot see what you are weak
 * to — which is the screen where it matters.
 *
 * So every scale renders identity, forces, reach, relationships and HP. What
 * changes is how much room each gets. The export sets the floor: *"tile floor
 * is 160px; below that, drop the epithet before anything else"* — and twelve
 * chips share a 1280×720 window, so the chip is the constraint that sets the
 * type floor for the whole design.
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
import { Meter } from '../readouts/Meter.js';
import { Pill } from '../readouts/Pill.js';

export type HeroCardScale = 'compact' | 'standard' | 'full';

export interface HeroCardProps {
  readonly hero: Hero;
  readonly scale?: HeroCardScale;
  /** Current HP. Omitted means undamaged. */
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

const SCALE: Record<HeroCardScale, string> = {
  compact: 'w-40 p-2 gap-1',
  standard: 'w-56 p-3 gap-2',
  full: 'w-75 p-4 gap-3',
};

/** The same padding and gap, with the width handed to the container. */
const FILLED: Record<HeroCardScale, string> = {
  compact: 'w-full p-2 gap-1',
  standard: 'w-full p-3 gap-2',
  full: 'w-full p-4 gap-3',
};

export function HeroCard({
  hero,
  scale = 'standard',
  hp,
  onSelect,
  fill = false,
}: HeroCardProps): React.JSX.Element {
  const max = maxHpOf(hero);
  const current = hp ?? max;
  const compact = scale === 'compact';
  const Root = onSelect ? 'button' : 'div';

  return (
    <Root
      {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(hero) } : {})}
      data-scale={scale}
      data-hero={hero.id}
      className={`flex flex-col rounded-lg bg-surface text-left shadow-(--shadow-glow-1) ${
        fill ? FILLED[scale] : SCALE[scale]
      }`}
    >
      <div className="flex items-start gap-2">
        {/*
          T042 — the emblem.

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
        <HeroIcon
          heroId={hero.id as HeroId}
          name={hero.name}
          size={scale === 'full' ? 'detail' : 'chip'}
        />
        <span className="min-w-0 flex-1">
          <span className="text-h3 block truncate font-display font-semibold uppercase">
            {hero.name}
          </span>
          <span className="text-caption text-muted block font-mono uppercase">{hero.role}</span>
        </span>
        <span className="flex shrink-0 gap-1">
          <TypeBadge type={hero.primary} size="compact" />
          <TypeBadge type={hero.secondary} size="compact" />
        </span>
      </div>

      <Meter value={current} max={max} tone={hero.primary} label="HP" bare={compact} />

      <div className="flex flex-wrap gap-1">
        <Pill label="REACH">{hero.reach}</Pill>
        {!compact && <Pill label="MIGHT">{hero.stats.might}</Pill>}
        {!compact && <Pill label="SPD">{hero.stats.speed}</Pill>}
      </div>

      {/* Present at every scale — the labels drop, the meaning does not. */}
      <RelationshipStrip hero={hero} compact={compact} />
    </Root>
  );
}
