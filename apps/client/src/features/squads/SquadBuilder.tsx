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

import { ROW_CAPACITY, SQUAD_ROWS, type Seat, type SquadRow } from '@lmntlz/sim/rules';
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

      <div className="flex flex-col gap-3">
        {SQUAD_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-caption font-display tracking-widest uppercase text-faint">
              {ROW_LABEL[row]}
            </span>
            {/**
             * **`flex-wrap` was wrong here, and it looked like a rendering bug.**
             * The formation is 2 front · 3 middle · 1 back, and the middle row is
             * the widest — so at the column width this panel actually gets, wrapping
             * put two seats on one line and the third underneath, which reads as a
             * 2/2/1/1 formation that does not exist. A squad's shape is a rule, not
             * a layout preference: it never reflows. The seats shrink instead, and
             * the panel scrolls if it must.
             */}
            <div className="flex min-w-0 gap-3">
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
                      // `w-32` was a fixed width and it is what forced the wrap:
                      // three of them plus two gaps exceed the column this panel
                      // gets, even at the 1600px target. Flexible up to that same
                      // width instead, so every seat stays the same size as every
                      // other and the three-wide row fits at the 1280px floor.
                      'h-20 min-w-0 flex-1 basis-0 max-w-32 rounded border px-3 text-left text-body transition-colors',
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
