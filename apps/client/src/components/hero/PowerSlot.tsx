/**
 * `PowerSlot` — the five states the export draws (017 T027): ready,
 * recharging, disabled, awaiting server, empty.
 *
 * **`awaiting` is the same idea as the Button's pending state**, for the same
 * reason: the server owns the resolution, so "you asked, nobody has answered"
 * is a real and frequent condition rather than an edge case. It reads as
 * held-in-place, not as failed.
 *
 * `gated` is separate from `disabled` and is not a styling choice. A power has
 * a `gateTurn` — it cannot be used before that turn of the battle regardless of
 * cooldown — so a slot can be fully recharged and still unusable. Collapsing
 * the two would tell the player to wait for a ring that is already full.
 */

import type { Power } from '@lmntlz/content';
import { CooldownRing } from './CooldownRing.js';
import { TypeBadge } from '../type/TypeBadge.js';

export type PowerSlotState = 'ready' | 'recharging' | 'disabled' | 'awaiting' | 'empty';

export interface PowerSlotProps {
  /** `null` renders the empty slot — a hero with fewer than six authored powers. */
  readonly power: Power | null;
  readonly turnsRemaining?: number;
  /** Locked by `gateTurn`, not by cooldown. */
  readonly gated?: boolean;
  readonly awaiting?: boolean;
  readonly onSelect?: (power: Power) => void;
}

export function stateOf({
  power,
  turnsRemaining = 0,
  gated = false,
  awaiting = false,
}: PowerSlotProps): PowerSlotState {
  if (!power) return 'empty';
  if (awaiting) return 'awaiting';
  if (gated) return 'disabled';
  return turnsRemaining > 0 ? 'recharging' : 'ready';
}

export function PowerSlot(props: PowerSlotProps): React.JSX.Element {
  const { power, turnsRemaining = 0, onSelect } = props;
  const state = stateOf(props);

  if (!power) {
    return (
      <div
        data-state="empty"
        className="flex h-16 items-center justify-center rounded-md bg-void ring-1 ring-line"
      >
        <span className="text-caption text-faint font-display tracking-wide">EMPTY</span>
      </div>
    );
  }

  const usable = state === 'ready' && onSelect !== undefined;

  return (
    <button
      type="button"
      data-state={state}
      data-tier={power.tier}
      disabled={!usable}
      aria-busy={state === 'awaiting' || undefined}
      onClick={usable ? () => onSelect(power) : undefined}
      className={[
        'flex h-16 w-full items-center gap-3 rounded-md px-3 text-left ring-1',
        'transition-colors duration-(--duration-fast) ease-out',
        'disabled:cursor-not-allowed',
        state === 'ready' ? 'bg-surface ring-line hover:bg-raised' : 'bg-void ring-line',
        state === 'disabled' ? 'opacity-50' : '',
        state === 'awaiting' ? 'animate-pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <CooldownRing turnsRemaining={turnsRemaining} turnsTotal={power.cooldown} />
      <span className="min-w-0 flex-1">
        <span className="text-h3 block truncate font-display">{power.name}</span>
        <span className="text-caption text-muted block font-mono">
          {/* Turns, spelled out. The unit is the point. */}
          CD {power.cooldown} {power.cooldown === 1 ? 'turn' : 'turns'}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {power.types.map((type) => (
          <TypeBadge key={type} type={type} size="compact" />
        ))}
      </span>
    </button>
  );
}
