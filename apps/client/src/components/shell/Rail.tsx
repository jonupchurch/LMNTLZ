/**
 * `Rail` — the fixed left navigation (017 T019 · FR-015).
 *
 * ### An entry cannot name a screen that does not exist
 *
 * This is the load-bearing rule and it is enforced by the type, not by
 * discipline. `RailEntry` has **no `href`** and no destination field at all —
 * the rail is built from the entries the app actually registers, so an unbuilt
 * screen has nothing to put in the list. A dead nav item is the most visible
 * possible version of this project's most repeated defect: a seam with no
 * caller.
 *
 * 017 registers Squads · Roster · Matchmaking · The Court · Codex. 018 adds
 * Rune Forge and The Store as those screens land; 016 adds Dispatches. The
 * entry appears **with** the screen, never before it.
 *
 * Exactly one entry is active. `activeId` is a single value rather than a flag
 * on each entry so two-active is unrepresentable.
 */

import type { ReactNode } from 'react';
import { RailGroup } from './RailGroup.js';

export interface RailEntry {
  readonly id: string;
  readonly label: string;
  /** A count, like the roster's `27`. Not a dot — the number is the point. */
  readonly badge?: number;
  /** Nested entries. Only THE COURT uses this at 1.0. */
  readonly children?: readonly RailEntry[];
}

export interface RailProps {
  readonly entries: readonly RailEntry[];
  readonly activeId?: string;
  readonly onSelect?: (id: string) => void;
  readonly footer?: ReactNode;
}

function RailItem({
  entry,
  activeId,
  onSelect,
  nested = false,
}: {
  entry: RailEntry;
  /* `| undefined` spelled out: `exactOptionalPropertyTypes` is on, so an
     optional prop and a prop that may be `undefined` are different types. */
  activeId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
  nested?: boolean;
}): React.JSX.Element {
  const active = entry.id === activeId;
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        onClick={() => onSelect?.(entry.id)}
        className={[
          'text-h3 flex h-9 w-full items-center justify-between font-display tracking-wide uppercase',
          'transition-colors duration-(--duration-fast) ease-out',
          nested ? 'pl-8 pr-4' : 'px-4',
          /* Gold marks the active entry — the same signal every export uses. */
          active ? 'border-l-2 border-gold bg-surface text-gold' : 'text-muted hover:text-parchment',
        ].join(' ')}
      >
        <span className="truncate">{entry.label}</span>
        {entry.badge !== undefined && (
          <span className="text-caption text-faint font-mono tabular-nums">{entry.badge}</span>
        )}
      </button>
    </li>
  );
}

export function Rail({ entries, activeId, onSelect, footer }: RailProps): React.JSX.Element {
  return (
    <nav
      aria-label="Main"
      className="flex h-full w-(--rail-width) shrink-0 flex-col justify-between bg-bg py-4"
    >
      <ul className="flex flex-col">
        {entries.map((entry) =>
          entry.children && entry.children.length > 0 ? (
            <RailGroup
              key={entry.id}
              label={entry.label}
              containsActive={entry.children.some((child) => child.id === activeId)}
            >
              {entry.children.map((child) => (
                <RailItem
                  key={child.id}
                  entry={child}
                  activeId={activeId}
                  onSelect={onSelect}
                  nested
                />
              ))}
            </RailGroup>
          ) : (
            <RailItem key={entry.id} entry={entry} activeId={activeId} onSelect={onSelect} />
          ),
        )}
      </ul>
      {footer && <div className="px-4">{footer}</div>}
    </nav>
  );
}
