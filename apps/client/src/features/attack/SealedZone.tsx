/**
 * The Hidden Six — six seats you are told exist and are never shown (019).
 *
 * ### Drawing the sealed squad is not disclosing it
 *
 * `ScoutPanel` used to carry a comment worth keeping: *"there is no seats array
 * to render, because an empty one would still tell a scout the shape of what is
 * missing."* That is right about the **payload** — `ScoutView.hidden` is
 * `{ holdStreak }` and must never grow a `seats?`, because a served array of
 * length zero is a claim about a real squad.
 *
 * It is not an argument against drawing six placeholders. **Every squad in the
 * game is six champions in 2 front · 3 middle · 1 back** — that is in
 * `CLAUDE.md`, on the squad screen, and in every battle the player has ever
 * fought. Six sealed slots restate a constant everybody already has; they
 * disclose nothing, and they turn "the ambush mechanic" from a sentence into a
 * thing on screen that is visibly, deliberately closed.
 *
 * Nothing here reads a field the serialiser does not send. The placeholders are
 * a client-side constant, and if the payload ever did grow a `seats` key this
 * component would still not render it.
 *
 * ### The ambush numbers are displayed and never computed
 *
 * `+2%` and the `90%` cap are served (`AmbushState` carries `perWin` and `cap`
 * precisely so they can be *printed*), and the chance itself is the server's
 * roll to make. A client that multiplied a streak by two would be a second
 * source of truth for a tuning dial the design explicitly wants to move without
 * a Steam update — SC-008 greps this app for either value as a literal.
 */

/** 2 front · 3 middle · 1 back, in the order an attacker meets them. */
const SEALED_SEATS = ['front', 'front', 'middle', 'middle', 'middle', 'back'] as const;

export interface SealedZoneProps {
  /** The sealed wall's own hold streak — the one fact that IS disclosed. */
  readonly holdStreak: number;
  /** Percent, as served. Never derived from `consecutiveWins` here. */
  readonly ambushChance: number;
  /** Your attack streak — why the number above is what it is. */
  readonly consecutiveWins: number;
}

export function SealedZone({
  holdStreak,
  ambushChance,
  consecutiveWins,
}: SealedZoneProps): React.JSX.Element {
  return (
    <section
      aria-label="Hidden six"
      className="lz-empty flex flex-col gap-3 bg-raised/40 p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-h3 font-display tracking-widest text-muted uppercase">Hidden six</h4>
          <span
            data-chip="sealed"
            className="text-caption rounded-sm px-2 py-0.5 font-mono tracking-widest text-faint uppercase ring-1 ring-line ring-inset"
          >
            Sealed
          </span>
        </div>

        <span
          data-chip="ambush"
          className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-gold/50 ring-inset"
        >
          <span className="tracking-wider text-faint uppercase">Ambush</span>
          <span className="text-gold">{ambushChance}%</span>
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <span
          data-chip="hold"
          className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-line ring-inset"
        >
          <span className="tracking-wider text-faint uppercase">Hold</span>
          <span className={holdStreak > 0 ? 'text-gold' : 'text-faint'}>×{holdStreak}</span>
        </span>
        <span
          data-chip="attack-streak"
          className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-line ring-inset"
        >
          <span className="tracking-wider text-faint uppercase">Your streak</span>
          <span className="text-parchment">×{consecutiveWins}</span>
        </span>
      </div>

      {/**
       * Six seats, hatched. `lz-sealed` is dashed like an empty slot but filled
       * with a diagonal hatch, because *nothing is here* and *six champions are
       * here and you do not get to know which* are opposite facts.
       */}
      <ul aria-label="Sealed seats" className="grid flex-1 grid-cols-6 gap-1.5">
        {SEALED_SEATS.map((row, i) => (
          <li key={`${row}-${i}`}>
            <span
              aria-hidden
              data-sealed-seat={row}
              className="lz-sealed block aspect-3/4 min-h-16"
            />
          </li>
        ))}
      </ul>

      {/**
       * **The formation as one line, rather than a label over each seat.**
       *
       * This column is roughly 55px per seat and `MIDDLE` is not a 55px word —
       * the first build rendered `MIDD…` three times. Six labels for two
       * distinct facts was the wrong shape anyway: the interesting thing is the
       * *shape* of the formation, and it is the same shape every squad in the
       * game has.
       */}
      <p className="text-caption font-mono tracking-wider text-faint uppercase">
        2 front · 3 middle · 1 back, like every squad
      </p>

      <p className="text-caption leading-relaxed text-muted">
        Their Hidden squad is never shown and can never be chosen. The only way into it is to be
        ambushed — and the six you can see already narrows what the other zone can hold.
      </p>
      <p className="text-caption border-t border-line pt-3 leading-relaxed text-muted">
        On {consecutiveWins} straight attack {consecutiveWins === 1 ? 'win' : 'wins'} there is a{' '}
        <span className="text-gold">{ambushChance}%</span> chance the Hidden six answers instead of
        the wall you scouted. A Hidden battle pays more.
      </p>
    </section>
  );
}
