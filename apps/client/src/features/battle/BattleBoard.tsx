/**
 * The battlefield as one 1–6 axis, drawn left to right (019).
 *
 * ### Why the axis turned sideways
 *
 * 017 put the six rows on screen as six stacked horizontal bands, which fixed
 * the real defect — *which row is this champion in* had been invisible — and
 * left the axis reading top-to-bottom while every rule about it is written
 * left-to-right. `board.ts` draws the picture the engine actually uses:
 *
 * ```
 *   attacker                          defender
 *   1        2        3     |     4        5        6
 *   back    middle   front  |   front    middle    back
 * ```
 *
 * The export draws exactly that, and it earns its keep: the two front lines end
 * up **next to each other in the middle**, which is where the fighting is, and
 * the two back seats end up at opposite edges. Reach is a count of rows crossed
 * along this line, so a player can now see the count instead of doing it.
 *
 * ### The contact seam is a real object
 *
 * A gap column between rows 3 and 4 marks where the two halves meet. It is not
 * decoration — it is the only place on screen that says which direction is
 * "toward the enemy", and getting that backwards inverts every reach test while
 * still looking plausible.
 *
 * ### An empty row keeps its column
 *
 * Distance counts *occupied* rows crossed, so a cleared row is what opens the
 * back seat's range later in a battle. A column that vanished when its last
 * champion fell would hide the mechanic at the exact moment it starts to
 * matter.
 */

import { AXIS, frontRowOf } from '@lmntlz/sim/rules';
import type { BattleState, Row } from '@lmntlz/sim/rules';
import { ContactSeam } from '../../components/index.js';
import { Combatant } from './Combatant.js';

/**
 * Left to right along the shared axis: the player's back seat to the enemy's.
 *
 * **This file used to spell all of it out** — a `ROWS` array of 1–6, a `LABEL`
 * table mapping each row to `back`/`middle`/`front`, and `row >= 4` for whose
 * side it is. Three restatements of a rule that lives in `AXIS_ROW_OF`, and the
 * `LABEL` table in particular is the one that could invert without failing
 * anything: the board would draw, the battle would resolve, and every column
 * would be captioned with the wrong row name.
 */
const LABEL: Readonly<Record<Row, string>> = Object.freeze(
  Object.fromEntries(AXIS.map((a) => [a.row, a.squadRow])) as Record<Row, string>,
);

export interface BattleBoardProps {
  readonly state: BattleState;
  readonly activeInstanceId: string | null;
  /** Instance ids the engine would accept right now. */
  readonly targets: readonly string[];
  /** Enemies the chosen power cannot reach, with how far away they are. */
  readonly unreachable: ReadonlyMap<string, number>;
  readonly onTarget: (instanceId: string) => void;
  readonly onHover?: ((instanceId: string | null) => void) | undefined;
  readonly busy: boolean;
}

export function BattleBoard({
  state,
  activeInstanceId,
  targets,
  unreachable,
  onTarget,
  onHover,
  busy,
}: BattleBoardProps): React.JSX.Element {
  const legal = new Set(targets);

  return (
    <section
      aria-label="Battle board"
      /* The two ambient blooms the export lays under the field, one per side.
         They say where the halves are without spending a border on it. */
      className="lz-surface flex flex-col gap-2 p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-caption font-mono tracking-widest text-muted uppercase">
          Battlefield axis · rows 1–6
        </h3>
        <p className="text-caption font-mono text-faint">
          Reach counts occupied rows crossed — an emptied row shortens every distance over it.
        </p>
      </header>

      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto_repeat(3,minmax(0,1fr))] gap-1.5">
        {AXIS.map(({ row, side }) => {
          const here = state.heroes.filter((h) => h.row === row);
          const theirs = side === 'defender';

          return (
            <div key={row} className="contents">
              {/* The seam, injected where the sides change hands. */}
              {row === frontRowOf('defender') && <ContactSeam outlined />}

              <div
                data-row={row}
                data-side={theirs ? 'defender' : 'attacker'}
                className={[
                  'flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 ring-1 ring-inset',
                  theirs ? 'bg-slash/5 ring-slash/20' : 'bg-void/30 ring-line',
                ].join(' ')}
              >
                <p className="text-caption flex items-baseline justify-center gap-1.5 font-mono tracking-wider uppercase">
                  <span className={theirs ? 'text-slash-lit' : 'text-gold'}>{row}</span>
                  <span className="text-faint">{LABEL[row]}</span>
                </p>

                <div className="flex flex-1 flex-col justify-center gap-1.5">
                  {here.length === 0 ? (
                    <p className="lz-empty text-caption flex flex-1 items-center justify-center px-1 py-4 text-center font-mono text-faint">
                      empty — nothing to cross
                    </p>
                  ) : (
                    here.map((hero) => (
                      <Combatant
                        key={hero.instanceId}
                        hero={hero}
                        scale="board"
                        active={hero.instanceId === activeInstanceId}
                        targetable={legal.has(hero.instanceId) && !busy}
                        unreachable={unreachable.has(hero.instanceId)}
                        rows={unreachable.get(hero.instanceId)}
                        onSelect={() => onTarget(hero.instanceId)}
                        onHover={onHover}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

