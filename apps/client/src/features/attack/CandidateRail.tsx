/**
 * Everybody you may attack, as a rail down the left (019).
 *
 * ### The list is whole, and that is a rule rather than a simplification
 *
 * The export draws exactly three offerings under the heading *"Three courts
 * will hear you"*, with a `NEXT REFRESH 04:12` card under them. **Neither
 * exists.** `candidates.ts` takes one argument on purpose: *"every eligible
 * defender in the league is present, every time: no slate, no rotation, no
 * cooldown on re-attacking someone"* — a rule restricting who you may attack
 * restricts the playing itself, and the economy already bounds what volume
 * pays. So the card shape is the export's and the count is the server's.
 *
 * ### The three the card was missing, and where each of them came from
 *
 * They were named here as *"one server field each"* and left out rather than
 * approximated. All three landed in 019:
 *
 * | Drawn | Source |
 * |---|---|
 * | a 12-segment bar of the defender's Forces | `visibleHeroIds` on the wire; the **Forces are derived** client-side from `@lmntlz/content` (XV) |
 * | `WIN +18 / LOSE −12` | `winDelta`/`lossDelta`, computed by the same `ratingDeltas` the settlement uses — never a second ladder |
 * | a `HARD / EVEN / SOFT` risk chip | the rating gap, **here**, because it is a reading of two numbers the client already has rather than a rule |
 *
 * The split between the last two is the interesting one. The swing is the
 * **ladder's arithmetic** and a client copy would drift silently the first time
 * a K band moved. The chip is a *label on a subtraction* — no rule, nothing to
 * drift from, and putting it on the wire would mean a round trip to re-render a
 * word. Ask whether a number is a rule or a reading.
 */

import type { Candidate } from './types.js';
import { TypeSpread } from './TypeSpread.js';

/**
 * How this matchup reads, from the rating gap alone.
 *
 * The bands are deliberately wide. A rating gap is a **weak** predictor in a
 * game whose whole premise is that the roster is identical and the edge is the
 * matchup — so a chip implying precision would be lying about what it knows.
 * Three words, and `EVEN` is the widest of them.
 */
const RISK_BAND = 100;

function riskOf(theirs: number, mine: number): { label: string; tone: string } {
  const gap = theirs - mine;
  if (gap > RISK_BAND) return { label: 'hard', tone: 'text-danger ring-danger/50' };
  if (gap < -RISK_BAND) return { label: 'soft', tone: 'text-earth-lit ring-earth/50' };
  return { label: 'even', tone: 'text-faint ring-line' };
}

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export interface CandidateRailProps {
  readonly candidates: readonly Candidate[];
  readonly selected: string | null;
  readonly onSelect: (playerId: string) => void;
  /** The caller's own rating, for the risk chip's subtraction. */
  readonly myRating: number;
}

export function CandidateRail({
  candidates,
  selected,
  onSelect,
  myRating,
}: CandidateRailProps): React.JSX.Element {
  return (
    <section aria-label="Opponents" className="flex flex-col gap-3">
      <header>
        <h3 className="text-h3 font-display tracking-widest text-parchment uppercase">
          Match offerings
        </h3>
        <p className="text-caption mt-1 leading-relaxed text-muted">
          Every defender in your league with a full Visible squad. No rotation, no cooldown on
          fighting somebody twice.
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="text-body font-mono text-faint">
          Nobody in your league has a full Visible squad to attack yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((candidate) => (
            <li key={candidate.playerId}>
              <button
                type="button"
                aria-pressed={selected === candidate.playerId}
                onClick={() => onSelect(candidate.playerId)}
                data-candidate={candidate.playerId}
                className={[
                  'block w-full rounded-lg bg-raised px-3 py-2.5 text-left ring-inset transition-shadow duration-(--duration-fast)',
                  selected === candidate.playerId
                    ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold'
                    : 'ring-1 ring-line hover:shadow-(--shadow-glow-air)',
                ].join(' ')}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-body truncate font-display tracking-wide text-parchment">
                    {candidate.username}
                  </span>
                  {/* The export's risk chip, top-right beside the handle. */}
                  <span
                    data-risk={riskOf(candidate.rating, myRating).label}
                    className={`text-caption shrink-0 rounded-sm px-1.5 py-px font-mono tracking-wider uppercase ring-1 ring-inset ${
                      riskOf(candidate.rating, myRating).tone
                    }`}
                  >
                    {riskOf(candidate.rating, myRating).label}
                  </span>
                </span>

                <span className="text-caption mt-0.5 flex items-baseline justify-between gap-2 font-mono tabular-nums text-faint">
                  <span>{candidate.rating}</span>
                  {/*
                   * `WIN +18 / LOSE −12`, both from the server. The two are shown
                   * together because the question a player is weighing is the
                   * *trade*, and a screen showing only the upside would be
                   * selling the fight rather than describing it.
                   */}
                  <span className="flex gap-2">
                    <span className="text-earth-lit">win {signed(candidate.winDelta)}</span>
                    <span className="text-danger">lose {signed(candidate.lossDelta)}</span>
                  </span>
                </span>

                <TypeSpread heroIds={candidate.visibleHeroIds} />

                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-caption inline-flex items-center gap-1 rounded-sm px-1.5 py-px font-mono ring-1 ring-line ring-inset">
                    <span className="tracking-wider text-faint uppercase">Vis</span>
                    <span className={candidate.visibleHoldStreak > 0 ? 'text-gold' : 'text-faint'}>
                      ×{candidate.visibleHoldStreak}
                    </span>
                  </span>
                  <span className="text-caption inline-flex items-center gap-1 rounded-sm px-1.5 py-px font-mono ring-1 ring-line ring-inset">
                    <span className="tracking-wider text-faint uppercase">Hid</span>
                    <span className={candidate.hiddenHoldStreak > 0 ? 'text-gold' : 'text-faint'}>
                      ×{candidate.hiddenHoldStreak}
                    </span>
                  </span>
                  {/* Disclosed rather than hidden: a hold against a bot and a
                      hold against a person are different facts. */}
                  {candidate.isBot && (
                    <span className="text-caption rounded-sm px-1.5 py-px font-mono tracking-wider text-dark-lit uppercase ring-1 ring-dark/50 ring-inset">
                      bot
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
