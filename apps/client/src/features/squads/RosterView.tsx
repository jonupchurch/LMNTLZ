/**
 * The picker — all 27 champions with their assignment status (T018, FR-002 ·
 * 019 US2).
 *
 * **Every hero is always listed.** There is no locked state, no silhouette and
 * no "not yet recruited" — the roster is identical for every player and that is
 * the competitive premise. A greyed-out card here would be the first pixel of a
 * collection system.
 *
 * What varies is *commitment*: a champion is free, defending a zone, or in one
 * or more attack squads. A defender is unavailable to offense, and the card
 * says which zone rather than only that she is unavailable — "Bramwen cannot
 * attack" leaves the player hunting for her.
 *
 * ### 019 — art, one filter, and a readout that is not a filter
 *
 * `resources/03-squad-builder.md` asks for a picker *"filterable by type and by
 * weakness, so players can counter-build"*, and the design draws two rows: nine
 * House chips, then nine `COVERS BANE` swatches.
 *
 * The first pass made both of them filters and split them on `primary` versus
 * `strengths`. **That was wrong twice.** A Force chip has to match a champion
 * who carries that Force *at all* — an Earth champion with a Fire secondary
 * deals Fire, and a filter that hides her from a player hunting for Fire is
 * simply broken. And once the chip matches both authored forces, a second
 * "has this force" filter beside it is the same filter with a different label.
 *
 * So `COVERS BANE` is read as what it literally says: **which enemy Banes the
 * squad on the board can already strike.** It is a readout, which is also why
 * the design draws it as nine small squares rather than nine pressable chips —
 * and it earns its place beside the picker, because *what am I still missing*
 * is the question a player is asking while they choose.
 */

import { useMemo, useState } from 'react';
import { DAMAGE_TYPES, type DamageType, type Hero, type HeroId } from '@lmntlz/content';
import {
  FORCE_RING,
  HeroMarks,
  HeroPortrait,
  RunePips,
  TypeIcon,
} from '../../components/index.js';
import type { RosterResponse, Zone } from './types.js';
import { ATTACK_SQUADS, DEFENSE_TOTAL } from './hooks/useAllocation.js';

/**
 * The two zones and the three slots, in the header's own numbering.
 *
 * **Roman, because the rest of the screen is.** The header's squad chips read
 * `I · II · III`, so a card saying `In squad 2` would be the same screen
 * counting two different ways about the same six champions.
 */
const ZONE_LABEL: Readonly<Record<Zone, string>> = { visible: 'I', hidden: 'II' };
const ROMAN = ['I', 'II', 'III'] as const;

export interface RosterViewProps {
  readonly roster: RosterResponse;
  readonly selectedHeroId: string | null;
  readonly onSelect: (heroId: string) => void;
  /** Who is already seated in the squad on screen, for the `IN SQUAD` tag. */
  readonly seatedIds?: ReadonlySet<string>;
  /**
   * A seat on the board is armed and waiting for a champion.
   *
   * The picker says so at the top, because the board can be scrolled past and
   * a player who has forgotten they armed a seat will read the next click as
   * the screen misbehaving.
   */
  readonly awaitingSeat?: boolean;
  /** Which of the Nine the squad on the board can already strike. */
  readonly covers?: ReadonlySet<DamageType>;
}

interface Commitment {
  readonly zone?: Zone;
  readonly squads: number[];
}

export function RosterView({
  roster,
  selectedHeroId,
  onSelect,
  seatedIds,
  awaitingSeat = false,
  covers,
}: RosterViewProps) {
  const [search, setSearch] = useState('');
  const [forces, setForces] = useState<ReadonlySet<DamageType>>(new Set());

  /**
   * Rune stages by champion, so a card is a lookup rather than a scan of 27.
   *
   * Served as a list because that is the order the server iterates the roster
   * in; the card wants it by id.
   */
  const runes = useMemo(
    () => new Map(roster.runes.map((entry) => [entry.heroId, entry.stages])),
    [roster.runes],
  );

  const commitment = useMemo(() => {
    const map = new Map<string, Commitment>();
    for (const zone of ['visible', 'hidden'] as const) {
      for (const seat of roster.assignments.defense[zone].seats) {
        map.set(seat.heroId, { zone, squads: [] });
      }
    }
    for (const squad of roster.assignments.offense) {
      for (const seat of squad.seats) {
        const existing = map.get(seat.heroId);
        if (existing) existing.squads.push(squad.slot);
        else map.set(seat.heroId, { squads: [squad.slot] });
      }
    }
    return map;
  }, [roster]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return roster.heroes.filter((hero: Hero) => {
      if (needle !== '' && !hero.name.toLowerCase().includes(needle)) return false;
      /**
       * **`strengths`, not `primary`.** `strengths` is `{primary, secondary}`,
       * and a champion deals both — so a Fire filter that skipped an Earth
       * champion with a Fire secondary would hide her from precisely the player
       * looking for Fire. Coverage is the union of the two everywhere else in
       * this feature, and the filter has to agree with it.
       */
      if (forces.size > 0 && !hero.strengths.some((force) => forces.has(force))) return false;
      return true;
    });
  }, [roster.heroes, search, forces]);

  const committed =
    roster.assignments.defense.visible.seats.length +
    roster.assignments.defense.hidden.seats.length;

  return (
    <section aria-label="Champion roster" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2
          className={[
            'text-caption font-mono tracking-widest uppercase',
            awaitingSeat ? 'text-gold' : 'text-faint',
          ].join(' ')}
        >
          {awaitingSeat ? 'Picker · seat waiting' : 'Picker'}
        </h2>

        <label className="min-w-40 flex-1">
          <span className="sr-only">Search champions</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search champions"
            className="text-body w-full rounded-full border border-line bg-void px-3 py-1 text-parchment placeholder:text-decor"
          />
        </label>

        {/**
         * **The ambush chance is always displayed** (FR-015), not on hover and
         * not behind a tooltip. It is the odds of someone reaching your Hidden
         * squad, it rises with every attack win you take, and a player who
         * cannot see it cannot decide whether to keep pushing a streak.
         *
         * Every number here is read from the server. The client does no
         * arithmetic on `perWin` or `cap` — they are shown as text so the rule
         * is legible, and SC-008 greps this app to prove neither is a literal.
         */}
        <p className="text-caption font-mono">
          <span className="text-faint">Ambush </span>
          <span className="text-gold">{roster.ambush.chance}%</span>
          <span className="text-faint">
            {' '}
            · +{roster.ambush.perWin}% per win, up to {roster.ambush.cap}%
            {roster.ambush.chance >= roster.ambush.cap ? ' · at cap' : ''}
          </span>
        </p>

        <p className="text-caption font-mono tabular-nums text-faint">
          {shown.length} / {roster.heroes.length} champions
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ul className="flex flex-wrap gap-1.5" aria-label="Filter by Force">
          {DAMAGE_TYPES.map((type) => (
            <li key={type}>
              <FilterChip
                type={type}
                on={forces.has(type)}
                label={type}
                onToggle={() => setForces(toggled(forces, type))}
              />
            </li>
          ))}
        </ul>

        {/**
         * **A readout, not a filter** — see the header. Nine squares saying
         * which enemy Banes this squad can already open, lit from the board
         * rather than from anything clicked here. `role="img"` with a sentence
         * for a label, because a screen reader offered nine unlabelled squares
         * gets nothing at all from them.
         */}
        {covers ? (
          <div className="flex items-center gap-1.5">
            <span className="text-caption font-mono tracking-widest text-faint uppercase">
              Covers bane
            </span>
            <span
              role="img"
              aria-label={
                covers.size === 0
                  ? 'This squad covers no Banes yet'
                  : `This squad can strike ${[...covers].join(', ')}`
              }
              className="flex gap-1"
            >
              {DAMAGE_TYPES.map((type) => (
                <span
                  key={type}
                  data-covers={covers.has(type)}
                  className={covers.has(type) ? 'opacity-100' : 'opacity-25 grayscale'}
                >
                  <TypeIcon type={type} size="pip" />
                </span>
              ))}
            </span>
          </div>
        ) : null}

        <p className="text-caption font-mono text-faint">
          {/**
           * **The sentence that makes the constraint legible.** 15 heroes for 3
           * squads of 6 is why overlap keeps happening, and no per-squad message
           * conveys it.
           */}
          {committed} / {DEFENSE_TOTAL} on defense · {roster.available.forOffense.length} left for{' '}
          {ATTACK_SQUADS} squads of 6
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="lz-empty text-body p-6 text-center text-muted">
          No champion matches those filters.
        </p>
      ) : (
        /* Back down to 140 from 168. The Force words and the Bane line left the
           title card for the corner marks, so the card no longer needs width
           for four text rows — and the export's own grid is 112. */
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
          {shown.map((hero: Hero) => (
            <li key={hero.id}>
              <PickerCard
                hero={hero}
                state={commitment.get(hero.id)}
                selected={hero.id === selectedHeroId}
                seated={seatedIds?.has(hero.id) ?? false}
                runes={runes.get(hero.id)}
                onSelect={() => onSelect(hero.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function toggled(set: ReadonlySet<DamageType>, type: DamageType): ReadonlySet<DamageType> {
  const next = new Set(set);
  if (!next.delete(type)) next.add(type);
  return next;
}

function FilterChip({
  type,
  on,
  label,
  onToggle,
}: {
  readonly type: DamageType;
  readonly on: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={[
        'text-caption inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-1 font-mono tracking-wider uppercase transition-colors duration-(--duration-fast)',
        on ? 'border-parchment bg-raised text-parchment' : 'border-line text-faint hover:text-muted',
      ].join(' ')}
    >
      {/* Was a coloured dot. A dot is one channel, and it is the channel a
          colour-blind player cannot read — on the game's central mechanic. */}
      <TypeIcon type={type} size="pip" />
      {label}
    </button>
  );
}

/**
 * One champion: art above, a title card below.
 *
 * ### The card is two regions, and that is the design rather than a detail
 *
 * The export draws a square of illustration and then a **solid title card**
 * under it — not a scrim over the bottom of the art. The distinction is
 * load-bearing at this size: a name laid over a painting is legible only as
 * long as the pixels behind it stay dark, and the bottom edge of 27 different
 * illustrations is not something a designer controls. The strip is a surface,
 * so every name reads the same.
 *
 * ### What lives where
 *
 * - **Corner marks** — the emblem and both Forces (`HeroMarks`). *Who* and
 *   *what she deals*, in the one place a player's eye lands first.
 * - **Corner badge** — the commitment, and it names the squad rather than only
 *   reporting that she is spoken for.
 * - **Title card** — name, then rune pips and reach.
 *
 * The Force used to be printed as words in the title card. It moved to the
 * corner as marks, which is what freed the second row for the rune pips: a
 * champion's investment is the only fact on this screen that differs between
 * two players, and it had no home outside the Forge until now.
 */
function PickerCard({
  hero,
  state,
  selected,
  seated,
  runes,
  onSelect,
}: {
  readonly hero: Hero;
  readonly state: Commitment | undefined;
  readonly selected: boolean;
  readonly seated: boolean;
  /** Stage per slot. Absent while the roster is still arriving, never faked. */
  readonly runes: readonly number[] | undefined;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const badge = commitmentBadge(state);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-hero={hero.id}
      className={[
        'block w-full overflow-hidden rounded-lg bg-raised text-left ring-inset transition-shadow duration-(--duration-fast)',
        selected
          ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold'
          : `ring-1 ${FORCE_RING[hero.primary]} hover:shadow-(--shadow-glow-air)`,
      ].join(' ')}
    >
      {/* --- the art ------------------------------------------------------ */}
      <span className="relative block aspect-square">
        <HeroPortrait
          heroId={hero.id as HeroId}
          force={hero.primary}
          scrim
          fill
          sizes="(min-width: 1600px) 200px, 150px"
        />

        <span className="absolute top-1.5 left-1.5">
          <HeroMarks
            heroId={hero.id as HeroId}
            primary={hero.primary}
            secondary={hero.secondary}
          />
        </span>

        {/**
         * **The badge names the squad.** "Unavailable" alone sends a player
         * hunting through two defense zones and three attack squads to find out
         * where their champion went; `IN SQUAD II` answers it on the card.
         *
         * Filled gold when it is the squad currently on the board, outlined
         * otherwise — so *this one is already placed in what I am editing* and
         * *this one is spoken for elsewhere* are different states rather than the
         * same tag on two different cards.
         */}
        {badge ? (
          <span
            data-commitment={badge.kind}
            className={[
              'text-caption absolute top-1.5 right-1.5 rounded-sm px-1 py-px font-mono tracking-wider uppercase',
              seated
                ? 'bg-gold text-void'
                : 'bg-void/85 text-gold ring-1 ring-gold/40 ring-inset',
            ].join(' ')}
          >
            {badge.label}
          </span>
        ) : null}
      </span>

      {/* --- the title card ------------------------------------------------ */}
      <span className="block px-2 py-1.5">
        <span className="text-body block truncate font-display tracking-wide text-parchment uppercase">
          {hero.name}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2">
          {/**
           * **Three marks, always three.** The empty slots are the information —
           * see `RunePips`. Until the roster's `runes` arrive there is nothing
           * honest to draw, so nothing is drawn rather than three empty tracks
           * that would read as "no runes" while the answer is still in flight.
           */}
          {runes ? <RunePips stages={runes} /> : <span />}
          <span
            className={[
              'text-caption shrink-0 font-mono',
              /* Reach 2 is the one worth spotting across 27 cards — it decides
                 who can act from the middle row on turn one. */
              hero.reach === 2 ? 'text-air' : 'text-faint',
            ].join(' ')}
          >
            R{hero.reach}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * What a champion is committed to, as a corner badge — or nothing.
 *
 * **Absent means free**, and that is deliberate now that the badge names its
 * squad. The earlier card printed `UNASSIGNED` on the reasoning that a missing
 * tag is indistinguishable from a tag that failed to render; that held when the
 * tag was the only thing in that corner, and it does not now — a card whose
 * marks, name, pips and reach are all present is visibly a card that rendered.
 * Twenty-seven cards each carrying the word `UNASSIGNED` is noise on the screen
 * whose whole job is to make six of them stand out.
 */
function commitmentBadge(
  state: Commitment | undefined,
): { readonly kind: string; readonly label: string } | null {
  if (state?.zone) return { kind: 'defense', label: `In squad ${ZONE_LABEL[state.zone]}` };
  if (state?.squads.length) {
    return { kind: 'offense', label: `Striking ${state.squads.map(roman).join(',')}` };
  }
  return null;
}

const roman = (slot: number): string => ROMAN[slot] ?? String(slot + 1);
