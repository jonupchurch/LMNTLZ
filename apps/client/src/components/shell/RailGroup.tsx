/**
 * `RailGroup` — an expandable group inside the rail (017 T019).
 *
 * THE COURT is the only group at 1.0. It is the game's word for the social
 * half — chat, guild roster, guild admin — and *Court-Champion* is a rank
 * inside that vocabulary, **not** a standings screen. That reading cost a
 * round trip once; the evidence that settled it was the active-state colour in
 * every export.
 *
 * A `<button>` with `aria-expanded`, not a div with a click handler, so the
 * group opens from the keyboard for free and announces its state. `<summary>`
 * would also work and is harder to style consistently across the two builds.
 */

import type { ReactNode } from 'react';
import { useId, useState } from 'react';

export interface RailGroupProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  /** True when any entry inside is the active one — the group stays open. */
  readonly containsActive?: boolean;
}

export function RailGroup({
  label,
  children,
  defaultOpen = false,
  containsActive = false,
}: RailGroupProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen || containsActive);
  const panelId = useId();

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="text-caption flex h-9 w-full items-center justify-between px-4 font-display tracking-wide text-muted uppercase hover:text-parchment"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-faint">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {/* Unmounted rather than hidden when closed: a collapsed group must not
          leave focusable children in the tab order. */}
      {open && (
        <ul id={panelId} className="flex flex-col">
          {children}
        </ul>
      )}
    </li>
  );
}
