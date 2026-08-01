/**
 * The running account of the battle, in champion names (Jon, 2026-08-01).
 *
 * > *"make the area in the rectangle a place to display the results of each attack, one
 * > by one. For example it should say like, Corvane attacks Marisel. Hits for 250
 * > damage. Or 'Misses'."*
 *
 * ### The band was empty, and the only account of the battle was off to one side
 *
 * `EventLog` in the right rail holds the **last exchange** and nothing else, so every
 * turn erased the one before it. A player who wanted to know why a champion died had no
 * way back to the blow that killed it. This is the whole battle, in order, and it is
 * across the top because that is where the eye already goes between turns.
 *
 * ### Two rules this had to be built against, both learned the hard way
 *
 * **The height is reserved, never fitted to the content.** A panel that grows as lines
 * arrive would push the battlefield down on every turn, which reads as the board
 * flinching. The strip is a fixed `--lz-log-h` and scrolls inside itself, so the field
 * below it never moves once the screen has laid out.
 *
 * **It never clears.** The transcript holds across a resync and across the end of the
 * battle — a player reads the log *in order to think*, and blanking it at the moment
 * they look away is exactly when they need it. `BattleScreen` appends and never
 * replaces.
 *
 * ### Newest last, and pinned there
 *
 * A combat log reads downward, so new lines arrive at the bottom and the strip follows
 * them. `scrollTop = scrollHeight` rather than `scrollIntoView`, which would scroll the
 * *page* to bring the strip into view and yank the battlefield out from under the
 * cursor.
 */

import { useEffect, useRef } from 'react';
import type { TurnEvent } from './types.js';

export interface BattleLogProps {
  /** Every event so far, oldest first. */
  readonly events: readonly TurnEvent[];
  /** Already-composed prose for one event — `describeEvent`, bound to the roster. */
  readonly describe: (event: TurnEvent) => string;
}

export function BattleLog({ events, describe }: BattleLogProps) {
  const scroller = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <section
      aria-label="Battle log"
      data-testid="battle-log"
      className="lz-surface px-4 py-3"
      /* Reserved, not fitted — see the note above. Four lines plus the heading. */
      style={{ ['--lz-log-h' as string]: '5.25rem' }}
    >
      <h3 className="text-caption font-display mb-2 tracking-widest text-faint uppercase">
        The account
      </h3>

      {events.length === 0 ? (
        <p className="text-caption h-(--lz-log-h) font-mono text-faint">
          The first blow has not landed yet.
        </p>
      ) : (
        <ol
          ref={scroller}
          aria-live="polite"
          className="text-caption flex h-(--lz-log-h) flex-col gap-0.5 overflow-y-auto font-mono text-muted"
        >
          {events.map((event, i) => (
            <li
              key={`${i}-${event.actorInstanceId}`}
              /* The latest line is the one being read; the rest are context. */
              className={i === events.length - 1 ? 'text-parchment' : undefined}
            >
              {describe(event)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
