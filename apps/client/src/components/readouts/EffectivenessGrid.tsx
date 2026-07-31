/**
 * `EffectivenessGrid` — the nine-type heat readout (017 T029).
 *
 * ### What the export actually draws, and how it differs from the contract
 *
 * `contracts/components.md` sketches this as `{ attacker?, defender? }` — a 9×9
 * matrix. **The export draws something else and something better**: *"Squad
 * vulnerability · 9-type heat — how many of the six bleed to each Force"*, with
 * a warning line when a bar passes half the squad.
 *
 * A 9×9 type-vs-type matrix could not be correct anyway. Effectiveness is not a
 * function of two damage types; it is a function of an attack type and a
 * **hero**, because bane and fault derive from that hero's two authored forces.
 * There is no cell to fill in for "fire vs water" without asking *which water
 * hero*. So the readout is per-squad, which is both what the design shows and
 * the only version that can be computed.
 *
 * It is also the component that expresses the whole game: LMNTLZ is
 * counter-building, and this is the screen that says *"three of yours bleed to
 * Air"* before an opponent notices it first.
 *
 * ### Every value is computed, none transcribed
 *
 * `effectiveness()` comes from `@lmntlz/content`. Constitution XV and
 * `CLAUDE.md` both forbid hand-authoring the matrix, and a transcribed table
 * would drift the moment a hero's forces changed.
 */

import { DAMAGE_TYPES, effectiveness, NEUTRAL, type DamageType, type Hero } from '@lmntlz/content';
import { FORCE_ABBR, FORCE_FILL } from '../type/forceClasses.js';

export interface EffectivenessGridProps {
  /** The squad being read. Six in practice; the component does not require it. */
  readonly squad: readonly Hero[];
}

export interface ForceExposure {
  readonly type: DamageType;
  /** How many of the squad take *more* than neutral damage from this force. */
  readonly bleeding: number;
  readonly total: number;
}

/**
 * Anything above neutral is "bleeding" — that folds Bane (×1.50) and Fault
 * (×1.25) together on purpose, because the question the readout answers is
 * *"who is exposed here"* rather than *"how badly"*. The strip on the hero
 * card is where the degree is read.
 */
export function exposure(squad: readonly Hero[]): readonly ForceExposure[] {
  return DAMAGE_TYPES.map((type) => ({
    type,
    bleeding: squad.filter((hero) => effectiveness(type, hero) > NEUTRAL).length,
    total: squad.length,
  }));
}

/** The export's rule: over half the squad flips the bar to danger. */
export const isConcentrated = (e: ForceExposure): boolean =>
  e.total > 0 && e.bleeding * 2 > e.total;

export function EffectivenessGrid({ squad }: EffectivenessGridProps): React.JSX.Element {
  const rows = exposure(squad);
  const worst = rows.filter(isConcentrated);

  return (
    <div className="flex flex-col gap-2" data-testid="effectiveness-grid">
      <ol className="flex items-end gap-1">
        {rows.map((row) => {
          const height = row.total === 0 ? 0 : (row.bleeding / row.total) * 100;
          return (
            <li key={row.type} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-caption font-mono tabular-nums">{row.bleeding}</span>
              <span
                className="flex h-16 w-full items-end rounded-sm bg-void ring-1 ring-line"
                role="img"
                aria-label={`${row.type}: ${row.bleeding} of ${row.total} vulnerable`}
              >
                <span
                  className={[
                    'w-full rounded-sm transition-[height] duration-(--duration-slow) ease-in-out',
                    isConcentrated(row) ? 'bg-danger' : FORCE_FILL[row.type].split(' ')[0]!,
                  ].join(' ')}
                  style={{ height: `${height}%` }}
                />
              </span>
              <span className="text-caption text-muted font-display tracking-tight">
                {FORCE_ABBR[row.type]}
              </span>
            </li>
          );
        })}
      </ol>
      {worst.length > 0 && (
        <p className="text-caption text-danger">
          {worst.map((w) => `${w.bleeding} of yours bleed to ${w.type}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
