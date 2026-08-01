/**
 * The wall you are about to hit, drawn as the six champions standing in it
 * (019, `LMNTLZ Matchmaking and Results.dc.html`).
 *
 * ### Why this stopped being a list of names
 *
 * The screen the whole design is about was a `<ul>` of six rows reading
 * `Bramwen · front · earth · fire · reach 2 · bane air · fault water`. Every
 * fact was present and the one thing a player actually does here — *look at a
 * formation and decide whether your six answer it* — was unsupported, because a
 * formation is a shape and the shape was not drawn.
 *
 * The export draws six portrait cards in seat order with the Bane printed under
 * each face, and it is right: a wall is a picture, and 27 champions are
 * recognisable by their art long before they are recognisable by a name in a
 * table.
 *
 * ### The seat label says FRONT, not ROW 1
 *
 * The export labels the columns `ROW 1 · BACK` … `ROW 3 · FRONT`, counting from
 * the defender's rear. **Our axis runs the other way** — a defender's front is
 * row 4 and its back is row 6 on the shared 1–6 axis, because the numbering
 * ascends toward the enemy for the attacker and away for the defender
 * (`board.ts`). Printing the export's numbers would put a number on screen that
 * contradicts the one reach is measured in. So the label is the seat's name,
 * which is unambiguous in both directions, and the numbers stay off the card.
 *
 * ### What is deliberately absent
 *
 * No stat values, base or runed. No indication of which stat a rune boosts. No
 * targeting rule and no power ranking. The payload carries none of it and this
 * file adds no field to it — the disclosure boundary is the serialiser's, and
 * moving a region cannot widen it (Constitution XVII).
 */

import type { DamageType, Hero, HeroId } from '@lmntlz/content';
import {
  BANE,
  FORCE_RING,
  FORCE_TEXT,
  HeroMarks,
  HeroPortrait,
  RunePips,
  TypeIcon,
} from '../../components/index.js';
import { bestAgainst, doorsOf, forcesOf } from './analysis.js';
import type { ScoutSeat } from './types.js';

/** Front first, because that is the row an attacker meets first. */
const ROW_ORDER: Readonly<Record<string, number>> = { front: 0, middle: 1, back: 2 };

export interface ScoutedWallProps {
  readonly seats: readonly ScoutSeat[];
  readonly holdStreak: number;
  readonly canDefend: boolean;
  /**
   * The squad you would send. Used only to mark which faces you have an answer
   * for — absent is honest while the roster is still arriving, and draws every
   * seat as un-answered rather than guessing.
   */
  readonly squad?: readonly Hero[];
}

export function ScoutedWall({
  seats,
  holdStreak,
  canDefend,
  squad,
}: ScoutedWallProps): React.JSX.Element {
  const ordered = [...seats].sort(
    (a, b) => (ROW_ORDER[a.row] ?? 9) - (ROW_ORDER[b.row] ?? 9) || a.index - b.index,
  );
  const forces = forcesOf(squad ?? []);
  const doors = doorsOf(seats).slice(0, 4);

  return (
    <section aria-label="Standing six" className="lz-surface flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-linear-to-r from-slash/15 to-transparent px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h4 className="text-h3 font-display tracking-widest text-parchment uppercase">
            Standing six
          </h4>
          <span className="text-caption font-mono tracking-wider text-faint uppercase">
            Visible · anyone may attack it
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* The hold streak is the wall's own record, and it is public: a
              defense that has stood eleven times is a different proposition
              from one that has never been tested. */}
          <span className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-line ring-inset">
            <span className="tracking-wider text-faint uppercase">Hold</span>
            <span className={holdStreak > 0 ? 'text-gold' : 'text-faint'}>×{holdStreak}</span>
          </span>
        </div>
      </header>

      {/**
       * **Six equal columns, in seat order.** The export gives each champion its
       * own column with the seat repeated above it rather than grouping the
       * three middles under one heading — so every card is the same width and a
       * player's eye can run straight along the row without re-measuring.
       */}
      <ul aria-label="Visible squad" className="grid grid-cols-6 gap-1.5 px-3 py-3">
        {ordered.map((seat) => (
          <WallSeat
            key={`${seat.row}-${seat.index}`}
            seat={seat}
            answered={bestAgainst(forces, seat.hero) >= BANE}
          />
        ))}
      </ul>

      {doors.length > 0 && (
        <ul aria-label="Doors in this wall" className="flex flex-wrap gap-1.5 px-3 pb-3">
          {doors.map((door) => (
            <li
              key={door.type}
              data-door={door.type}
              /* The ring takes the force's own colour; the glyph beside it is
                 what carries the meaning for anyone who cannot read the colour. */
              className={`text-caption inline-flex items-center gap-1.5 rounded-full bg-parchment/5 px-2 py-1 font-mono ring-1 ring-inset ${FORCE_RING[door.type]}`}
            >
              <TypeIcon type={door.type} size="pip" />
              <span className="tracking-wider text-parchment uppercase">
                {door.banes > 0
                  ? `${door.banes}× bane ${door.type}`
                  : `${door.faults}× fault ${door.type}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!canDefend && (
        <p role="status" className="text-caption px-4 pb-3 font-mono text-slash-lit">
          This wall is not at full strength.
        </p>
      )}
    </section>
  );
}

/**
 * One champion in the wall: the face, who she is, and the door she leaves open.
 *
 * `answered` is *you brought her Bane*, not *you will win* — it marks the ×1.50
 * and nothing more. Gold ring plus a changed word, so the mark survives for a
 * player who cannot tell gold from the House colour behind it.
 */
function WallSeat({
  seat,
  answered,
}: {
  readonly seat: ScoutSeat;
  readonly answered: boolean;
}): React.JSX.Element {
  const { hero } = seat;
  const bane = hero.bane as DamageType;
  const stages = seat.runes.map((rune) => rune.stages);

  return (
    <li
      data-seat={`${seat.row}-${seat.index}`}
      data-answered={answered}
      /* The reading, as data rather than as prose to be re-parsed. A test
         asserting on text would break every time the label was reworded, which
         it has been twice on width grounds alone. */
      data-bane={bane}
      className="flex flex-col gap-1"
    >
      <span className="text-caption block truncate text-center font-mono tracking-wider text-faint uppercase">
        {seat.row}
      </span>

      <span
        className={[
          'relative block aspect-[3/4] overflow-hidden rounded-lg bg-raised ring-inset',
          answered ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold' : `ring-1 ${FORCE_RING[hero.primary as DamageType]}`,
        ].join(' ')}
      >
        {/**
         * **No scrim.** The scrim is a bottom-up ramp to `void` so a label can
         * sit *over* the art — and this card's label sits in a strip *below* it,
         * as the squad picker's does. Passing it anyway darkened the lower half
         * of six portraits to make room for text that was never there, and the
         * champions read as murky scenery rather than faces.
         */}
        <HeroPortrait
          heroId={hero.id as HeroId}
          force={hero.primary as DamageType}
          fill
          sizes="(min-width: 1600px) 120px, 96px"
        />

        <span className="absolute top-1 left-1">
          <HeroMarks
            heroId={hero.id as HeroId}
            primary={hero.primary as DamageType}
            secondary={hero.secondary as DamageType}
          />
        </span>

        {/**
         * **Commitment, never power.** At an identical spend the best
         * allocation scores ~3.35× the worst, so a full set of pips means this
         * player committed, not that they committed well. That gap is what
         * makes bluffing real — and the server has been serving these stages
         * since the scout route was fixed, with nothing on the client drawing
         * them.
         */}
        <span className="absolute right-1 bottom-1">
          <RunePips stages={stages} name={hero.name} />
        </span>
      </span>

      <span className="block px-0.5">
        {/**
         * **The one label on this card allowed to ellipsis**, marked so, because
         * `Auriel Dawnkeep` was never going to fit a sixth of the panel and the
         * portrait and emblem already answer *who*. The export makes the same
         * call — `text-overflow: ellipsis` on exactly this element. Everything
         * else in the panel is measured by `attack.spec.ts`.
         */}
        <span
          data-may-ellipsis
          className="text-caption block truncate font-display tracking-wide text-parchment uppercase"
        >
          {hero.name}
        </span>
        {/**
         * **The state and the force on two lines, because one line does not
         * fit.** Six columns give this label about 94px at 12px mono, and it
         * was measured: `open earth` is 94px exactly and `bane pierce` is over
         * 100. The first build wrote `OPEN · EARTH` and shipped `OPEN · EA…` on
         * half the cards — the one word here a player actually needs.
         *
         * Split, the widest either line can be is `pierce` at roughly 60px, so
         * there is no force in the game that can clip this. Stacking is also a
         * better read: *what state* over *which force*, rather than a sentence
         * to parse six times across a row.
         */}
        <span data-door-read>
          <span className="text-caption block font-mono tracking-wider text-faint uppercase">
            {answered ? 'open' : 'bane'}
          </span>
          <span
            className={[
              'text-caption block font-mono tracking-wider uppercase',
              answered ? 'text-gold' : FORCE_TEXT[bane],
            ].join(' ')}
          >
            {bane}
          </span>
        </span>
      </span>
    </li>
  );
}
