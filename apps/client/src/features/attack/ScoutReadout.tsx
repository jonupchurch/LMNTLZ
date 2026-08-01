/**
 * Your six against their wall, in three columns (019).
 *
 * ### This is the counting the whole design is about
 *
 * *"The game is counter-building: read the enemy's weaknesses, don't stack your
 * own."* Bane and Fault are a pure function of two authored fields, so a player
 * with the Codex open can work every one of these out by hand — and doing it
 * across six champions and nine forces, twice, is exactly the arithmetic that
 * makes people not bother. Counting it is the feature; the six names were never
 * the feature.
 *
 * ### Both halves, and the second one is the one people skip
 *
 * *Doors you can open* is the lever. *Walls you cannot move* is the trap: a
 * squad built to open three of their champions can still be hard-resisted by
 * the other three, and a player who only reads the first column will pick it
 * every time. The verdict subtracts one from the other for the same reason —
 * see `readWall`.
 *
 * Nothing here is a rule. The multipliers come from `@lmntlz/content`; the only
 * invented numbers are the two verdict thresholds, and they decide a word.
 */

import type { Hero } from '@lmntlz/content';
import { FORCE_TEXT, TypeIcon } from '../../components/index.js';
import { VERDICT_LABEL, readWall } from './analysis.js';
import type { ScoutSeat } from './types.js';

const VERDICT_CLASS = {
  favourable: 'text-success',
  workable: 'text-gold',
  uphill: 'text-slash-lit',
} as const;

export interface ScoutReadoutProps {
  readonly seats: readonly ScoutSeat[];
  /** The squad you would send. Empty until one is chosen — never guessed. */
  readonly squad: readonly Hero[];
  /** What the chosen squad is called, so the reading names what it is about. */
  readonly squadName: string | null;
}

export function ScoutReadout({ seats, squad, squadName }: ScoutReadoutProps): React.JSX.Element {
  const reading = readWall(seats, squad);

  return (
    <section aria-label="Scout readout" className="lz-surface p-4">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="text-caption font-mono tracking-widest text-muted uppercase">
          Scout readout · {squadName ?? 'your six'} against their standing six
        </h4>
        <p
          data-verdict={reading.verdict}
          className={`text-h3 font-display tracking-widest uppercase ${VERDICT_CLASS[reading.verdict]}`}
        >
          {VERDICT_LABEL[reading.verdict]}
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h5 className="text-caption mb-2 font-mono tracking-widest text-success uppercase">
            Doors you can open
          </h5>
          <ul aria-label="Doors you can open" className="flex flex-col gap-1.5">
            {reading.opens.length === 0 ? (
              <li className="text-caption text-faint">
                None of your forces Banes anybody on this wall.
              </li>
            ) : (
              reading.opens.map((entry) => (
                <li key={entry.type} data-opens={entry.type} className="flex items-center gap-2">
                  <TypeIcon type={entry.type} variant="badge" size="pip" />
                  <span className="text-caption flex-1 text-muted">
                    Your <span className={FORCE_TEXT[entry.type]}>{entry.type}</span> opens{' '}
                    {entry.count} {entry.count === 1 ? 'Bane' : 'Banes'}
                  </span>
                  <span className="text-caption font-mono text-gold">×{entry.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h5 className="text-caption mb-2 font-mono tracking-widest text-slash-lit uppercase">
            Walls you cannot move
          </h5>
          <ul aria-label="Walls you cannot move" className="flex flex-col gap-1.5">
            {reading.resisted.length === 0 ? (
              <li className="text-caption text-faint">
                Nothing you bring is resisted outright by this wall.
              </li>
            ) : (
              reading.resisted.map((entry) => (
                <li
                  key={entry.type}
                  data-resisted={entry.type}
                  className="flex items-center gap-2"
                >
                  <TypeIcon type={entry.type} variant="badge" size="pip" />
                  <span className="text-caption flex-1 text-muted">
                    Your <span className={FORCE_TEXT[entry.type]}>{entry.type}</span> is resisted by{' '}
                    {entry.count}
                  </span>
                  <span className="text-caption font-mono text-slash-lit">×{entry.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h5 className="text-caption mb-2 font-mono tracking-widest text-muted uppercase">
            What their twelve implies
          </h5>
          {/**
           * **Read off the surfaced wall, and honest about the other one.** Two
           * Light champions standing here means at most one is left for their
           * offense — that inference is available to anybody who knows the
           * roster is 27 shared champions, and it is the sort of thing the
           * design wants a player thinking about. What it never does is claim
           * to know the Hidden squad.
           */}
          <p className="text-caption leading-relaxed text-muted">
            {implication(reading, seats.length)}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * One sentence about what the surfaced wall costs them elsewhere.
 *
 * Composed from counts the reading already holds rather than authored per
 * opponent — the export writes a bespoke line for each of its three fixture
 * players, which is not a thing a live screen can do.
 */
function implication(reading: ReturnType<typeof readWall>, wallSize: number): string {
  if (wallSize === 0) return 'Nothing is standing in this zone.';

  const spent = `Every champion standing here is one they cannot send at you`;

  if (reading.opened === 0 && reading.nicked === 0) {
    return `${spent} — but nothing in your six answers this wall at all. A different squad, or a different opponent.`;
  }
  if (reading.unanswered > reading.opened) {
    return `${spent}. More of them are unanswered than you Bane, so expect a long fight even where you do open a door.`;
  }
  if (reading.opened >= 3) {
    return `${spent}, and you open ${reading.opened} of their ${wallSize}. Their sealed zone cannot also hold answers to what you brought.`;
  }
  return `${spent}. You open ${reading.opened} of ${wallSize} outright — enough to matter, not enough to carry the fight on its own.`;
}
