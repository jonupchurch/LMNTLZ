/**
 * The 2/3/1 placement grid (T019), for both defense zones and all three attack
 * squads.
 *
 * **One component, `kind` as a prop.** Visible and Hidden differ in visibility
 * and reward and in nothing this renders; offense differs only in having no
 * per-champion configuration. Three components would be three formation grids,
 * and the one that drifts is Hidden — because it is the one nobody looks at.
 *
 * Validation runs on every placement through `@lmntlz/sim/rules`, the same
 * module the server rejects with.
 */

import { ROW_CAPACITY, type Seat, type SquadRow } from '@lmntlz/sim/rules';
import type { AllocationView } from './hooks/useAllocation.js';

export interface SquadBuilderProps {
  readonly allocation: AllocationView;
  readonly heroName: (id: string) => string;
  readonly kind: 'defense' | 'offense';
  readonly selectedHeroId: string | null;
  readonly onSeatActivate: (row: SquadRow, index: number) => void;
}

/** Front is nearest the enemy, so it renders at the top of the stack. */
const ROW_LABEL: Readonly<Record<SquadRow, string>> = {
  front: 'Front',
  middle: 'Middle',
  back: 'Back',
};

/**
 * The row's number on the **shared 1–6 axis** — attacker 1–3, defender 4–6.
 *
 * The Design System's applied builder row labels its columns `ROW 1 · BACK`,
 * `ROW 2 · MID`, `ROW 3 · FRONT` and then puts `ENEMY ROWS 4–6` immediately to
 * their right, which turns the reach rule into a direction you can see: left to
 * right *is* rows one through six. The old vertical stack drew the same six
 * seats with the axis nowhere on screen.
 */
const ROW_NUMBER: Readonly<Record<SquadRow, number>> = {
  back: 1,
  middle: 2,
  front: 3,
};

/** Left to right, toward the enemy. `SQUAD_ROWS` is front-first for the engine. */
const COLUMNS: readonly SquadRow[] = ['back', 'middle', 'front'];

export function SquadBuilder({
  allocation,
  heroName,
  kind,
  selectedHeroId,
  onSeatActivate,
}: SquadBuilderProps) {
  const at = (row: SquadRow, index: number): Seat | undefined =>
    allocation.seats.find((s) => s.row === row && s.index === index);

  return (
    <section aria-label={`${kind} squad formation`} className="rounded border border-line bg-surface p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-h2 tracking-widest uppercase text-parchment">Formation</h3>
        <p className="font-mono text-caption text-faint">
          {allocation.seats.length} / 6 · 2 front · 3 middle · 1 back
        </p>
      </header>

      {/**
       * **One column per row, back to front, and it cannot reflow** (017 T049).
       *
       * The trap this task names is a formation that wraps. The old layout was
       * three horizontal rows, and the middle one is the widest — at the column
       * width this panel actually gets, `flex-wrap` put two seats on one line
       * and the third underneath, which reads as a 2/2/1/1 formation that does
       * not exist. It was fixed by forbidding the wrap.
       *
       * The export's arrangement makes it **structurally** impossible instead:
       * each row is a vertical stack of its own seats in its own grid column,
       * so 1 · 3 · 2 is the shape of the grid rather than a constraint on it.
       * `grid-cols-3` is a fixed track count, so there is nothing to wrap.
       */}
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((row) => (
          <div key={row}>
            <p className="text-caption mb-2 font-mono tracking-widest uppercase text-faint">
              Row {ROW_NUMBER[row]} · {ROW_LABEL[row]}
            </p>
            <div className="flex flex-col gap-2">
              {Array.from({ length: ROW_CAPACITY[row] }, (_, index) => {
                const seat = at(row, index);
                return (
                  <button
                    key={`${row}-${index}`}
                    type="button"
                    // A grid of divs is unreachable by keyboard, and this game
                    // has no touch input — the keyboard IS an input method here,
                    // not an accommodation.
                    onClick={() => onSeatActivate(row, index)}
                    aria-label={
                      seat
                        ? `${ROW_LABEL[row]} seat ${index + 1}: ${heroName(seat.heroId)}`
                        : `${ROW_LABEL[row]} seat ${index + 1}, empty`
                    }
                    className={[
                      'h-16 min-w-0 truncate rounded border px-3 text-left text-body transition-colors',
                      seat
                        ? 'border-gold/60 bg-raised text-parchment'
                        : 'border-dashed border-line bg-void/40 text-faint',
                      selectedHeroId && !seat ? 'hover:border-gold' : '',
                    ].join(' ')}
                  >
                    {seat ? heroName(seat.heroId) : 'Empty'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/**
       * **The axis, and deliberately no in-range claim on it.**
       *
       * The export draws `ENEMY ROWS 4–6 · REACHABLE FROM ROW 3` beside the
       * formation, marking row 4 in range, row 5 reach-2 only and row 6 out of
       * reach. Every one of those is correct *at full formation* — and only
       * there. Distance counts **occupied** rows crossed, so the moment a row
       * empties the answer changes, and the honest computation is
       * `distance()` in `@lmntlz/sim/rules` over a real `BattleState`, which
       * a squad under construction does not have.
       *
       * Writing the three labels out here would be a second copy of the reach
       * rule living in a screen (Constitution XIV), correct on the day it was
       * typed and silently wrong for every battle after the first casualty. So
       * the axis is drawn and the rule is stated in words; the numbers belong
       * to the battle screen, which has the state to compute them.
       */}
      <p className="text-caption mt-4 font-mono text-faint">
        Rows 1–3 are yours · 4–6 are theirs. Reach counts <em>occupied</em> rows crossed, so
        range opens up as a battle wears on.
      </p>

      {/**
       * **The fault is shown, never used to block placement.** A squad under
       * construction is invalid almost all the time — that is the normal state
       * of the screen, not an error condition. Only the save is gated.
       */}
      <p role="status" className="mt-4 min-h-6 font-mono text-caption">
        {allocation.fault ? (
          <span className="text-slash-lit">{allocation.fault.detail}</span>
        ) : (
          <span className="text-earth-lit">Formation is legal.</span>
        )}
      </p>
    </section>
  );
}
