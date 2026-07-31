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

import type { Hero } from '@lmntlz/content';
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
}

/** `CLAUDE.md`: `HP = Toughness × 50`. */
export const maxHpOf = (hero: Hero): number => hero.stats.toughness * 50;

const SCALE: Record<HeroCardScale, string> = {
  compact: 'w-40 p-2 gap-1',
  standard: 'w-56 p-3 gap-2',
  full: 'w-75 p-4 gap-3',
};

export function HeroCard({ hero, scale = 'standard', hp, onSelect }: HeroCardProps): React.JSX.Element {
  const max = maxHpOf(hero);
  const current = hp ?? max;
  const compact = scale === 'compact';
  const Root = onSelect ? 'button' : 'div';

  return (
    <Root
      {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(hero) } : {})}
      data-scale={scale}
      data-hero={hero.id}
      className={`flex flex-col rounded-lg bg-surface text-left shadow-(--shadow-glow-1) ${SCALE[scale]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
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
