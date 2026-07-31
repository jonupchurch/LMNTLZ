/**
 * `Header` — shard balance, username, connection state (017 T020).
 *
 * **Profile hangs off the username rather than taking a rail slot.** The rail
 * is for places the game happens; a profile is a property of the person
 * already named in the corner, and giving it a rail entry would push a
 * gameplay destination further down for something reached twice a week.
 *
 * The shard balance is `font-mono` and `tabular-nums` for the same reason every
 * number a player reads under pressure is: a balance that shifts its digits
 * when it changes is a balance nobody trusts at a glance.
 */

import type { ReactNode } from 'react';

export interface HeaderProps {
  readonly shards: number;
  readonly username: string;
  /** The `ConnectionState` element, passed in rather than constructed here. */
  readonly connection?: ReactNode;
  readonly onProfile?: () => void;
}

export function Header({
  shards,
  username,
  connection,
  onProfile,
}: HeaderProps): React.JSX.Element {
  return (
    <header className="flex h-14 items-center justify-between gap-(--gutter) border-b border-line bg-bg px-(--gutter)">
      <span className="text-h2 font-display font-bold tracking-widest uppercase">LMNTLZ</span>

      <div className="flex items-center gap-(--gutter)">
        {connection}

        <span className="flex items-center gap-1.5" title="Shards">
          <span aria-hidden="true" className="text-gold">
            ◈
          </span>
          <span className="font-mono tabular-nums">{shards.toLocaleString('en-US')}</span>
          <span className="sr-only">shards</span>
        </span>

        {onProfile ? (
          <button
            type="button"
            onClick={onProfile}
            className="text-h3 rounded-sm font-display tracking-wide text-muted hover:text-parchment"
          >
            {username}
          </button>
        ) : (
          <span className="text-h3 font-display tracking-wide text-muted">{username}</span>
        )}
      </div>
    </header>
  );
}
