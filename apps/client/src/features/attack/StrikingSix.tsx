/**
 * Choosing which of your attack squads goes at this wall (019).
 *
 * ### Why the squads are drawn rather than named
 *
 * This used to be a row of text radios: `Vanguard`, `Second Wind`. A player
 * with three attack squads has three names they chose weeks ago and no memory
 * of who is in them — so the choice was being made blind, on the one screen
 * where it is the whole decision.
 *
 * The export draws each squad as its six faces with a fit label over them, and
 * that is right twice over: the faces answer *which squad is this*, and the fit
 * answers *does it work here* — scored against the wall actually on screen,
 * which is a reading no other screen in the game can offer.
 *
 * ### At most three, and no fourth
 *
 * The export draws five saved squads and a `5 SAVED` counter. **There are three
 * attack squads**, drawn from whoever is not on defense — `CLAUDE.md` is
 * explicit and so is the roster route. The export's fixture is wrong and this
 * renders what the server sends.
 *
 * ### Only a squad that is six and valid is offered
 *
 * The server refuses the rest with `squad_incomplete`, but the likeliest reason
 * a squad is short is **our own eviction rule** — moving a champion to defense
 * empties it — so a battle lost to it would be a loss the game caused. Offered
 * here rather than refused there.
 */

import type { Hero } from '@lmntlz/content';
import { VERDICT_LABEL, readWall } from './analysis.js';
import { SquadThumbs } from './SquadThumbs.js';
import type { ScoutSeat } from './types.js';
import type { OffenseSquadState } from '../squads/types.js';

const FIT_CLASS = {
  favourable: 'text-success ring-success',
  workable: 'text-gold ring-gold',
  uphill: 'text-slash-lit ring-slash',
} as const;

export interface StrikingSixProps {
  /** Already filtered to the complete and valid ones by the caller. */
  readonly squads: readonly OffenseSquadState[];
  readonly heroesById: ReadonlyMap<string, Hero>;
  /** The wall being scouted, so each squad can be scored against it. */
  readonly wall: readonly ScoutSeat[];
  readonly chosen: number | null;
  readonly onChoose: (slot: number) => void;
}

export function StrikingSix({
  squads,
  heroesById,
  wall,
  chosen,
  onChoose,
}: StrikingSixProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="text-caption font-mono tracking-widest text-muted uppercase">
          Choose your striking six
        </h4>
        <p className="text-caption font-mono tracking-wider text-faint uppercase">
          {squads.length} ready · fit scored against the wall above
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Attack squad"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {squads.map((squad) => (
          <SquadCard
            key={squad.slot}
            squad={squad}
            heroesById={heroesById}
            wall={wall}
            chosen={chosen === squad.slot}
            onChoose={() => onChoose(squad.slot)}
          />
        ))}
      </div>
    </div>
  );
}

function SquadCard({
  squad,
  heroesById,
  wall,
  chosen,
  onChoose,
}: {
  readonly squad: OffenseSquadState;
  readonly heroesById: ReadonlyMap<string, Hero>;
  readonly wall: readonly ScoutSeat[];
  readonly chosen: boolean;
  readonly onChoose: () => void;
}): React.JSX.Element {
  const name = squad.name ?? `Attack ${squad.slot + 1}`;
  const six = squad.seats
    .map((seat) => heroesById.get(seat.heroId))
    .filter((hero): hero is Hero => hero !== undefined);

  const reading = readWall(wall, six);
  const fitId = `squad-fit-${squad.slot}`;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      /**
       * **The name alone is the accessible name**, and the fit is a
       * *description*. A label of "Second Wind, favourable read, 4 doors" would
       * make the control's identity change every time the opponent changed —
       * which is what a description is for and what a name is not.
       */
      aria-label={name}
      aria-describedby={fitId}
      onClick={onChoose}
      data-squad={squad.slot}
      className={[
        'flex flex-col gap-2 rounded-lg bg-raised p-2.5 text-left ring-inset transition-shadow duration-(--duration-fast)',
        chosen
          ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold'
          : 'ring-1 ring-line hover:shadow-(--shadow-glow-air)',
      ].join(' ')}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={[
            'text-body truncate font-display tracking-wide uppercase',
            chosen ? 'text-parchment' : 'text-muted',
          ].join(' ')}
        >
          {name}
        </span>
        <span
          data-fit={reading.verdict}
          className={`text-caption shrink-0 rounded-sm px-1.5 py-px font-mono tracking-wider uppercase ring-1 ring-inset ${FIT_CLASS[reading.verdict]}`}
        >
          {VERDICT_LABEL[reading.verdict]}
        </span>
      </span>

      <SquadThumbs squad={six} />

      <span id={fitId} className="text-caption flex justify-between gap-2 font-mono text-faint">
        <span className="tracking-wider uppercase">Squad {squad.slot + 1}</span>
        <span>
          {reading.opened} {reading.opened === 1 ? 'door' : 'doors'} · {reading.unanswered}{' '}
          unanswered
        </span>
      </span>
    </button>
  );
}
