/**
 * The 2/3/1 placement board (T019 · 019 US2), for both defense zones and all
 * three attack squads.
 *
 * **One component, `kind` as a prop.** Visible and Hidden differ in visibility
 * and reward and in nothing this renders; offense differs only in having no
 * per-champion configuration. Three components would be three formation grids,
 * and the one that drifts is Hidden — because it is the one nobody looks at.
 *
 * ### 019 — the board is portrait-led, and the shape of the grid IS the formation
 *
 * The design draws one tall card in the back column, three short ones stacked
 * in the middle and two in the front, all three columns the same height. That
 * is not decoration: **1 · 3 · 2 is the shape of the grid rather than a
 * constraint on it**, so there is no arrangement of these seats that could
 * render a 2/2/1/1 formation that does not exist. The previous version was
 * three horizontal rows and the middle one wrapped at this panel's real width.
 *
 * ### The reach captions are computed, not written
 *
 * `HITS ROW 4` under a seated champion comes from `reachPreview.ts`, which
 * calls `inReach()` in `@lmntlz/sim/rules` against a fabricated opening
 * position. This file states no reach rule of its own — see that module's
 * header for why that distinction is the whole point.
 */

import type { Hero, HeroId } from '@lmntlz/content';
import { ROW_CAPACITY, type Seat, type SquadRow } from '@lmntlz/sim/rules';
import { FORCE_RING, HeroIcon, HeroPortrait, TypeIcon } from '../../components/index.js';
import type { AllocationView } from './hooks/useAllocation.js';
import { enemyReach, ROW_NUMBER, seatReach } from './reachPreview.js';

export interface SquadBuilderProps {
  readonly allocation: AllocationView;
  readonly heroName: (id: string) => string;
  readonly kind: 'defense' | 'offense';
  readonly selectedHeroId: string | null;
  /** The seat waiting for a champion, lit so it is obvious what a click did. */
  readonly armedSeat?: { readonly row: SquadRow; readonly index: number } | null;
  /** Present only when the armed seat is occupied — see `RemoveArmed`. */
  readonly onRemoveArmed?: (() => void) | undefined;
  readonly onSeatActivate: (row: SquadRow, index: number) => void;
  /**
   * Resolves a seated id to the whole champion, for the art and the emblem.
   *
   * **Optional, and the board degrades to names without it.** A seat is still a
   * seat when the roster has not arrived; a card that cannot draw a portrait
   * draws the name it already has rather than a hole.
   */
  readonly heroById?: (id: string) => Hero | undefined;
}

/** Front is nearest the enemy, so it renders last — left to right is rows 1→6. */
const ROW_LABEL: Readonly<Record<SquadRow, string>> = {
  front: 'Front',
  middle: 'Middle',
  back: 'Back',
};

/** Left to right, toward the enemy. `SQUAD_ROWS` is front-first for the engine. */
const COLUMNS: readonly SquadRow[] = ['back', 'middle', 'front'];

export function SquadBuilder({
  allocation,
  heroName,
  kind,
  selectedHeroId,
  armedSeat = null,
  onRemoveArmed,
  onSeatActivate,
  heroById,
}: SquadBuilderProps) {
  const at = (row: SquadRow, index: number): Seat | undefined =>
    allocation.seats.find((s) => s.row === row && s.index === index);

  const enemy = enemyReach(allocation.seats);
  const armedName = armedSeat
    ? (() => {
        const seat = at(armedSeat.row, armedSeat.index);
        return seat ? heroName(seat.heroId) : null;
      })()
    : null;

  return (
    <section aria-label={`${kind} squad formation`} className="lz-surface lz-bloom-gold p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-caption font-mono tracking-widest text-faint uppercase">
          Formation · 1 back / 3 middle / 2 front · rows 1&ndash;6 on one axis
        </h3>

        {/**
         * **The instruction now describes what the screen does.**
         *
         * It read *"Click a seat, then a champion"* while the code required a
         * champion first and returned silently otherwise — so following the
         * instruction did nothing at all, and the honest report was that heroes
         * could not be changed. Both orders work; the line says so, and it says
         * which one is currently in progress.
         *
         * The export also writes *"or drag a champion onto a seat"*. **Drag is
         * not built**, and an instruction for an interaction that does nothing
         * is exactly the defect above wearing a different hat.
         */}
        <p className="text-caption flex items-baseline gap-2">
          {armedSeat ? (
            <span className="text-gold">
              Seat ready — now pick a champion below
              {armedName ? ` to replace ${armedName}` : ''}.
            </span>
          ) : selectedHeroId ? (
            <span className="text-gold">Champion in hand — now click a seat.</span>
          ) : (
            <span className="text-faint">Click a seat, then a champion — or the reverse.</span>
          )}

          {/**
           * **Only when the armed seat is occupied**, because it is the only
           * single-seat removal in the app: `CLEAR` empties all six, and until
           * now the sole way to get one champion off a squad was to cover her
           * with another. It renders nowhere else, so the board is still six
           * buttons in every other state.
           */}
          {onRemoveArmed ? (
            <button
              type="button"
              onClick={onRemoveArmed}
              className="text-caption rounded border border-line px-2 py-0.5 font-mono tracking-wider text-slash-lit uppercase hover:border-slash"
            >
              Remove
            </button>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)] gap-4">
        {/* --- rows 1-3, yours ------------------------------------------- */}
        <div className="grid grid-cols-3 gap-2">
          {COLUMNS.map((row) => (
            <div key={row} className="flex min-w-0 flex-col">
              <p
                className={[
                  'text-caption mb-1.5 font-mono tracking-widest uppercase',
                  row === 'front' ? 'text-air' : 'text-faint',
                ].join(' ')}
              >
                Row {ROW_NUMBER[row]} · {ROW_LABEL[row]}
              </p>
              <div className="flex h-72 flex-col gap-1.5">
                {Array.from({ length: ROW_CAPACITY[row] }, (_, index) => (
                  <SeatCard
                    key={`${row}-${index}`}
                    row={row}
                    index={index}
                    seat={at(row, index)}
                    seats={allocation.seats}
                    heroName={heroName}
                    heroById={heroById}
                    inHand={selectedHeroId !== null}
                    lit={armedSeat?.row === row && armedSeat.index === index}
                    onActivate={() => onSeatActivate(row, index)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* --- the contact line ------------------------------------------- */}
        <div aria-hidden className="flex flex-col items-center justify-center self-stretch">
          <span className="w-px flex-1 bg-linear-to-b from-transparent via-line to-transparent" />
          <span className="text-caption my-2 font-mono tracking-widest text-decor uppercase [writing-mode:vertical-rl]">
            Contact line
          </span>
          <span className="w-px flex-1 bg-linear-to-b from-transparent via-line to-transparent" />
        </div>

        {/* --- rows 4-6, theirs ------------------------------------------- */}
        <div className="flex min-w-0 flex-col">
          <p className="text-caption mb-1.5 font-mono tracking-widest text-faint uppercase">
            Enemy rows 4&ndash;6 · reachability preview
          </p>
          <ul className="grid h-72 grid-cols-3 gap-2">
            {enemy.map((e) => {
              const live = e.reachers > 0;
              return (
                <li
                  key={e.row}
                  data-enemy-row={e.row}
                  data-in-range={live}
                  className={[
                    'flex flex-col items-center justify-center gap-1 rounded-lg text-center transition-colors duration-(--duration-fast)',
                    live
                      ? 'border border-gold/70 bg-linear-to-b from-gold/12 to-transparent shadow-(--shadow-glow-gold)'
                      : 'lz-empty',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'text-h1 font-display tabular-nums',
                      live ? 'text-gold' : 'text-decor',
                    ].join(' ')}
                  >
                    {e.row}
                  </span>
                  <span
                    className={[
                      'text-caption font-mono tracking-widest uppercase',
                      live ? 'text-parchment' : 'text-decor',
                    ].join(' ')}
                  >
                    {live ? 'In range' : 'Out of reach'}
                  </span>
                  <span className="text-caption font-mono tracking-wider text-faint uppercase">
                    {e.name} · {e.seats} {e.seats === 1 ? 'seat' : 'seats'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/**
       * **The assumption behind every label above, stated rather than implied.**
       *
       * Distance counts *occupied* rows crossed, so the preview is true of the
       * opening position and generous from there on — a reach-1 champion who
       * cannot touch row 4 today reaches it the moment the enemy front rank
       * falls. Leaving that unsaid would make the board look like a promise.
       */}
      <p className="text-caption mt-3 font-mono text-faint">
        Both sides at full six. Reach counts <em>occupied</em> rows crossed, so range opens up as a
        battle wears on.
      </p>

      {/**
       * **The fault is shown, never used to block placement.** A squad under
       * construction is invalid almost all the time — that is the normal state
       * of the screen, not an error condition. Only the save is gated.
       */}
      <p role="status" className="text-caption mt-2 min-h-5 font-mono">
        {allocation.fault ? (
          <span className="text-slash-lit">{allocation.fault.detail}</span>
        ) : (
          <span className="text-earth-lit">Formation is legal.</span>
        )}
      </p>
    </section>
  );
}

/**
 * One seat: a portrait with the champion's Force on its rim, or a dashed hole.
 *
 * A `button` and not a div — a grid of divs is unreachable by keyboard, and
 * this game has no touch input, so the keyboard **is** an input method here
 * rather than an accommodation.
 */
function SeatCard({
  row,
  index,
  seat,
  seats,
  heroName,
  heroById,
  inHand,
  lit,
  onActivate,
}: {
  readonly row: SquadRow;
  readonly index: number;
  readonly seat: Seat | undefined;
  readonly seats: readonly Seat[];
  readonly heroName: (id: string) => string;
  /* Explicitly `| undefined` rather than `?`: `exactOptionalPropertyTypes` is
     on, so an optional prop forwarded from an optional prop must say so. */
  readonly heroById: ((id: string) => Hero | undefined) | undefined;
  /** A champion is selected, so this seat is a place to put her. */
  readonly inHand: boolean;
  /** This is the armed seat — it is what the next champion clicked will fill. */
  readonly lit: boolean;
  readonly onActivate: () => void;
}): React.JSX.Element {
  const label = seat
    ? `${ROW_LABEL[row]} seat ${index + 1}: ${heroName(seat.heroId)}`
    : `${ROW_LABEL[row]} seat ${index + 1}, empty`;

  const hero = seat && heroById ? heroById(seat.heroId) : undefined;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={label}
      aria-pressed={lit}
      data-seat={`${row}-${index}`}
      data-armed={lit || undefined}
      className={[
        'relative min-h-0 flex-1 overflow-hidden rounded-lg text-left transition-shadow duration-(--duration-fast)',
        seat ? 'bg-void' : 'lz-empty',
        /* Armed beats everything: it is the answer to "did my click land?" */
        lit
          ? 'shadow-(--shadow-glow-gold)'
          : inHand
            ? 'hover:shadow-(--shadow-glow-gold)'
            : 'hover:shadow-(--shadow-glow-air)',
      ].join(' ')}
    >
      {seat ? (
        <>
          {hero ? (
            <HeroPortrait
              heroId={hero.id as HeroId}
              force={hero.primary}
              scrim
              fill
              sizes="(min-width: 1600px) 220px, 160px"
            />
          ) : null}

          <span
            aria-hidden
            className={[
              'pointer-events-none absolute inset-0 rounded-lg ring-inset',
              lit ? 'ring-2 ring-gold' : `ring-1 ${hero ? FORCE_RING[hero.primary] : 'ring-line'}`,
            ].join(' ')}
          />

          <span className="relative flex h-full flex-col justify-between p-1.5">
            <span className="flex items-start justify-between gap-1">
              {/* The Force as a SHAPE. `badge` because this sits on art — the
                  variant `resources/damage-types/README.md` draws for exactly
                  this case, and the only one that holds at 20px over a
                  painting. */}
              {hero ? <TypeIcon type={hero.primary} variant="badge" size="pip" /> : <span />}
              {hero ? (
                <span className="text-caption rounded-sm bg-void/70 px-1 font-mono text-parchment">
                  R{hero.reach}
                </span>
              ) : null}
            </span>

            <span className="min-w-0">
              <span className="flex items-center gap-1">
                {hero ? <HeroIcon heroId={hero.id as HeroId} size="chip" /> : null}
                <span className="text-body min-w-0 flex-1 truncate font-display tracking-wide text-parchment uppercase">
                  {heroName(seat.heroId)}
                </span>
              </span>
              {hero ? <ReachCaption seats={seats} seat={seat} /> : null}
            </span>
          </span>
        </>
      ) : (
        <span className="text-caption flex h-full items-center justify-center font-mono tracking-widest text-decor uppercase">
          Empty
        </span>
      )}
    </button>
  );
}

/**
 * `HITS ROW 4,5` / `OWN ROWS 1,3 ONLY`.
 *
 * **Own rows are reported in both directions**, which is one row more than the
 * export draws. Reach is one rule for enemies and allies alike — a heal is
 * range-limited exactly as an attack is — so a middle seat that can cover the
 * back seat is telling the truth about a support champion's whole job. The
 * export's forward-only reading would hide it.
 */
function ReachCaption({
  seats,
  seat,
}: {
  readonly seats: readonly Seat[];
  readonly seat: Seat;
}): React.JSX.Element {
  const reach = seatReach(seats, seat);
  const own = reach.ownRows.filter((r) => r !== ROW_NUMBER[seat.row]);

  return (
    <span className="text-caption block truncate font-mono tracking-wider text-faint uppercase">
      {reach.enemyRows.length > 0
        ? `Hits row ${reach.enemyRows.join(',')}`
        : own.length > 0
          ? `Own rows ${own.join(',')} only`
          : 'Reaches nobody yet'}
    </span>
  );
}
