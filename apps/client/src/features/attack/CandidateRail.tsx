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
 * ### Three things the export's card carries that this one cannot
 *
 * | Drawn there | Why not here |
 * |---|---|
 * | a 12-segment bar of the defender's damage types | `/matchmaking/candidates` does not serve squad composition, and teaching it to would put a scoutable fact on a route nobody has scouted through |
 * | `WIN +34 / LOSE −22` | the rating swing is the server's arithmetic (K bands 40/20/10, doubled on a Hidden win) and the client must not do it a second time |
 * | a `HARD / EVEN / SOFT` risk chip | derived from the above; a difficulty word this screen invented would read as the server's opinion |
 *
 * All three are worth having and all three are **one server field each**. They
 * are named here rather than approximated.
 */

import type { Candidate } from './types.js';

export interface CandidateRailProps {
  readonly candidates: readonly Candidate[];
  readonly selected: string | null;
  readonly onSelect: (playerId: string) => void;
}

export function CandidateRail({
  candidates,
  selected,
  onSelect,
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
                  <span className="text-caption shrink-0 font-mono tabular-nums text-faint">
                    {candidate.rating}
                  </span>
                </span>

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
