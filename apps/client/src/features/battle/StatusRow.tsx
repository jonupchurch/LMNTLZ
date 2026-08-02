/**
 * The strip of effects under a champion (020 US4, T045/T046).
 *
 * ### The height is reserved whether or not anything is on it
 *
 * A row that collapsed to nothing when a champion was clean would move every
 * pixel below it the moment a burn landed — and effects land and expire
 * constantly, so the whole board would twitch through a battle. **The row always
 * occupies its own height**; only what is drawn inside it changes.
 *
 * That is the rule Jon caught on the Forge panel: *reserve the height of the part
 * that varies, not the panel.* Here the varying part is the pips, so the pip
 * strip is what carries the fixed height.
 *
 * ### It renders nothing interactive, deliberately
 *
 * A tooltip per pip is the obvious next step and it is not in this slice. The
 * board's hover already drives the target read, and a second hover surface over
 * the same card would fight it — `TargetRead` answers *what will this swing do*,
 * which is the question a player is actually holding. The pip carries a `title`
 * so the name is available without inventing a second overlay.
 */

import { StatusPip } from '../../components/index.js';
import { statusGroups, type WireStatus } from './statusPips.js';

export interface StatusRowProps {
  readonly statuses: readonly WireStatus[];
  /** Board cards have room for more than a 64px rail card. */
  readonly scale: 'board' | 'rail';
  /** Named on the row so a screen reader says whose effects these are. */
  readonly heroName: string;
}

/**
 * **How many pips fit before the row would wrap.**
 *
 * A board card is 135px at the design's 1600×900, and a pip is 24px — so four
 * sit comfortably with the count badge clear of the edge. A rail card is
 * narrower and shares its width with the portrait, so it takes three.
 *
 * Anything past the limit becomes a `+N`, which is a *worse* outcome than
 * showing it and an *honest* one: the alternative is a row that silently drops
 * the effect that mattered.
 */
const LIMIT: Readonly<Record<'board' | 'rail', number>> = { board: 4, rail: 3 };

export function StatusRow({ statuses, scale, heroName }: StatusRowProps): React.JSX.Element {
  const groups = statusGroups(statuses);
  const limit = LIMIT[scale];
  const shown = groups.slice(0, limit);
  const spilled = groups.length - shown.length;

  return (
    <span
      data-status-row={heroName}
      aria-label={
        groups.length === 0
          ? `${heroName}, no effects`
          : `${heroName}, ${groups.length} effect${groups.length === 1 ? '' : 's'}`
      }
      /**
       * `h-6` is the pip's own height and it is set here rather than left to the
       * content — an empty row is the common case and it must take exactly as
       * much room as a full one.
       */
      className="flex h-6 items-center gap-0.5"
    >
      {shown.map((group) => (
        <StatusPip
          key={group.icon}
          kind={group.icon}
          stacks={group.stacks}
          sealed={group.sealed}
          duration={group.duration}
          /**
           * **The rune is named in the label, not given a badge of its own**
           * (021 US4, FR-025). The pip already says an effect is here; what a
           * player could not tell was *whose*, and that is a word rather than a
           * second indicator competing for 24 pixels.
           *
           * `data-rune` carries the same fact for a test to assert on, because a
           * title string is the one thing a screenshot cannot check.
           */
          label={group.runes.length === 0 ? group.label : `${group.label} · ${group.runes.join(', ')}`}
          {...(group.runes.length > 0 && { rune: group.runes.join(', ') })}
        />
      ))}
      {spilled > 0 && (
        <span className="text-caption font-mono tabular-nums text-faint">+{spilled}</span>
      )}
    </span>
  );
}
