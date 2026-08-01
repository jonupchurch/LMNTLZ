/**
 * `ReachAxis` — the shared 1–6 axis, drawn so the reach rule can be read off it
 * (019, `LMNTLZ Codex.dc.html` · the `showSquads` view).
 *
 * ### The Codex states the rules and was missing the central one
 *
 * Reach gates all targeting. It is one of the settled decisions in `CLAUDE.md`,
 * it is the thing that makes a back-line champion a liability at full formation
 * and a threat once the line collapses, and the Codex explained the counter ring
 * and the effectiveness ladder while saying nothing about it. The export always
 * had this panel; the built screen simply never got it.
 *
 * ### Nothing here is authored — not the numbers, not the labels, not the sides
 *
 * Every seat comes from `AXIS` in `@lmntlz/sim/rules`, which is the same table
 * `board.ts` builds a real battle from. That matters more here than anywhere
 * else on the screen, because **an axis diagram is the one thing that can be
 * exactly backwards and still look right**: the attacker's numbers ascend toward
 * the enemy and the defender's ascend away, so a transcription that mirrors the
 * far side draws a perfectly plausible picture of a rule the engine does not
 * have. A player would build against it and lose.
 *
 * The two rows nearest each other are found with `frontRowOf`, not by knowing
 * they are 3 and 4.
 *
 * ### Dashed is the export's own signal, and it means something specific here
 *
 * `lz-empty` says *a champion could stand here*. The two front rows are drawn
 * solid because they are the rows that are always in contact — everything else
 * is a seat whose occupancy is what opens and closes range as a battle wears on.
 */

import { AXIS, frontRowOf, type Row, type Side } from '@lmntlz/sim/rules';
import { ContactSeam } from '../../components/index.js';

/** Whose half a column belongs to, in the export's two tones. */
const SIDE_LABEL: Readonly<Record<Side, string>> = {
  attacker: 'Attackers',
  defender: 'Defenders',
};

const SIDE_TEXT: Readonly<Record<Side, string>> = {
  attacker: 'text-faint',
  defender: 'text-slash-lit',
};

/**
 * The contact rows carry their side's colour; the rest are empty seats.
 *
 * The export uses cyan for the attacker's front rank and red for the
 * defender's — `water-lit` and `slash` here, the tokens those hexes already
 * resolve to.
 */
const CONTACT_STYLE: Readonly<Record<Side, string>> = {
  attacker: 'border border-water-lit text-water-lit',
  defender: 'border border-slash text-slash-lit',
};

function AxisSeat({
  row,
  side,
  squadRow,
  seats,
  contact,
}: {
  readonly row: Row;
  readonly side: Side;
  readonly squadRow: string;
  readonly seats: number;
  readonly contact: boolean;
}): React.JSX.Element {
  return (
    <li
      data-axis-row={row}
      data-axis-side={side}
      data-axis-contact={contact ? 'yes' : 'no'}
      className={[
        'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-5',
        contact ? CONTACT_STYLE[side] : 'lz-empty text-muted',
      ].join(' ')}
    >
      <span className="font-mono text-h3 font-bold tabular-nums">{row}</span>
      <span className="text-caption font-mono tracking-wider text-faint uppercase">
        {squadRow} · {seats}
      </span>
    </li>
  );
}

export function ReachAxis(): React.JSX.Element {
  const halves: readonly Side[] = ['attacker', 'defender'];
  const contactRows = new Set<Row>(halves.map(frontRowOf));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2">
        {halves.map((side, at) => (
          <div key={side} className="contents">
            {/* Injected once, between the halves — never at an edge. */}
            {at > 0 && <ContactSeam />}

            <div className="flex flex-1 flex-col gap-1.5">
              <p
                className={`text-caption text-center font-mono tracking-widest uppercase ${SIDE_TEXT[side]}`}
              >
                {SIDE_LABEL[side]}
              </p>
              <ul className="flex gap-1.5">
                {AXIS.filter((a) => a.side === side).map((a) => (
                  <AxisSeat
                    key={a.row}
                    row={a.row}
                    side={a.side}
                    squadRow={a.squadRow}
                    seats={a.seats}
                    contact={contactRows.has(a.row)}
                  />
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/*
       * The export's own caption, and it is the sentence that stops the diagram
       * being misread: the numbers are not each side counting from its own back
       * line, they are one board.
       */}
      <p className="text-caption border-t border-line pt-3 font-mono text-faint uppercase">
        The axis is absolute, not per-side · row {AXIS[0]?.row} is the attackers&rsquo; rearmost ·
        row {AXIS[AXIS.length - 1]?.row} the defenders&rsquo;
      </p>
    </div>
  );
}
