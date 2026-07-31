/**
 * The eviction confirm (T029–T031).
 *
 * **This is the one thing feature 006 blocks.** Everywhere else the design is
 * *surface, do not prevent* — a reach-1 champion in the back seat is priced, a
 * self-defeating power ranking is a lever, and both are recoverable by reopening
 * a dropdown. Eviction is neither: it is destructive and it is non-obvious,
 * because the squads it breaks are not the one on screen.
 *
 * Three rules in the copy, each from a different failure:
 *
 * 1. **Count first, then name.** A player scanning past a wall of squad names
 *    still reads the number.
 * 2. **Name every squad, never "and 2 others".** Truncation is how somebody
 *    discovers the third squad mid-battle.
 * 3. **State the remaining pool.** `14 champions left for 3 squads of 6` is
 *    *why* this keeps happening, and no per-squad message conveys it.
 *
 * **Plural is the default and singular is the branch**, because 18 seats drawn
 * from 15 heroes means the common case is a champion in all three. A component
 * written for one squad and scaled up reads wrong exactly when it fires most.
 */

import type { EvictionPreview } from './types.js';

export interface EvictionWarningProps {
  readonly heroName: string;
  readonly zoneLabel: string;
  readonly preview: EvictionPreview;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function EvictionWarning({
  heroName,
  zoneLabel,
  preview,
  onConfirm,
  onCancel,
}: EvictionWarningProps) {
  const { evicts, poolAfter, streakAtRisk } = preview;
  const count = evicts.length;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="eviction-title"
      className="rounded border border-gold/50 bg-surface p-6"
    >
      <h2 id="eviction-title" className="font-display text-h2 tracking-wide text-parchment">
        Move {heroName} to {zoneLabel} defense?
      </h2>

      {count > 0 && (
        <>
          {/* Rule 1 — the count leads. */}
          <p className="mt-4 text-muted">
            {count === 1 ? (
              <>
                {heroName} is in <strong className="text-parchment">1 of your attack squads</strong>.
                Moving her to defense removes her from it, and it becomes incomplete:
              </>
            ) : (
              <>
                {heroName} is in{' '}
                <strong className="text-parchment">{count} of your attack squads</strong>. Moving her
                to defense removes her from all {count === 2 ? 'both' : 'three'}, and all{' '}
                {count === 2 ? 'both' : 'three'} become incomplete:
              </>
            )}
          </p>

          {/* Rule 2 — every squad, by name. */}
          <ul className="mt-3 font-mono text-body">
            {evicts.map((squad) => (
              <li key={squad.slot} className="flex items-baseline gap-3 py-0.5">
                <span className="w-40 text-parchment">{squad.name ?? `Attack ${squad.slot + 1}`}</span>
                <span className="text-muted">{squad.wouldBe} of 6</span>
                {squad.wasComplete && <span className="text-faint">← was ready</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Rule 3 — the sentence that explains the whole constraint. */}
      <p className="mt-4 font-mono text-body text-faint">
        You have {poolAfter.heroes} champions left for {poolAfter.squads} squads of{' '}
        {poolAfter.seatsNeeded / poolAfter.squads}.
      </p>

      {/* FR-014 — the streak cost is stated BEFORE the commit, not after. */}
      {streakAtRisk > 0 && (
        <p className="mt-3 text-body text-dark-lit">
          Your {zoneLabel} hold streak of {streakAtRisk}{' '}
          {streakAtRisk === 1 ? 'day' : 'days'} resets, because the squad changes.
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-line px-4 py-2 font-display text-body tracking-wide text-muted hover:border-faint"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-gold px-4 py-2 font-display text-body tracking-wide text-void hover:bg-gold/90"
        >
          Move {heroName}
        </button>
      </div>
    </div>
  );
}
