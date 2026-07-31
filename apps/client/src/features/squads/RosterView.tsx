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
  FORCE_TEXT,
  HeroIcon,
  HeroPortrait,
  TypeIcon,
} from '../../components/index.js';
import type { RosterResponse, Zone } from './types.js';
import { ATTACK_SQUADS, DEFENSE_TOTAL } from './hooks/useAllocation.js';

/** The two zones and the three slots, in the header's own numbering. */
const ZONE_LABEL: Readonly<Record<Zone, string>> = { visible: 'Zone I', hidden: 'Zone II' };
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
        /* 168 rather than 150: the card gained both forces, the Bane and the
           commitment, and four text lines under a name need the width or every
           one of them truncates to an ellipsis. */
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
          {shown.map((hero: Hero) => (
            <li key={hero.id}>
              <PickerCard
                hero={hero}
                state={commitment.get(hero.id)}
                selected={hero.id === selectedHeroId}
                seated={seatedIds?.has(hero.id) ?? false}
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
 * One champion: the art, the House on the rim, and what she is committed to.
 *
 * The **portrait is the card** — a name in a bordered box was legible and told
 * a player nothing, and 27 of them side by side was a spreadsheet. The emblem
 * stays in the corner because at this size the wash gives the Force and the
 * emblem gives the champion.
 */
function PickerCard({
  hero,
  state,
  selected,
  seated,
  onSelect,
}: {
  readonly hero: Hero;
  readonly state: Commitment | undefined;
  readonly selected: boolean;
  readonly seated: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-hero={hero.id}
      className={[
        'relative block aspect-3/4 w-full overflow-hidden rounded-lg bg-void text-left transition-shadow duration-(--duration-fast)',
        selected ? 'shadow-(--shadow-glow-gold)' : 'hover:shadow-(--shadow-glow-air)',
      ].join(' ')}
    >
      <HeroPortrait
        heroId={hero.id as HeroId}
        force={hero.primary}
        scrim
        sizes="(min-width: 1600px) 200px, 150px"
        className="absolute inset-0 h-full w-full"
      />

      <span
        aria-hidden
        className={[
          'pointer-events-none absolute inset-0 rounded-lg ring-inset',
          selected ? 'ring-2 ring-gold' : `ring-1 ${FORCE_RING[hero.primary]}`,
        ].join(' ')}
      />

      <span className="relative flex h-full flex-col justify-between p-2">
        <span className="flex items-start justify-between gap-1">
          {/* The Force as a SHAPE, not only a colour — `badge` is the variant
              drawn to hold against portrait art. */}
          <TypeIcon type={hero.primary} variant="badge" size="pip" />
          {seated ? (
            <span className="text-caption rounded-sm bg-gold px-1 font-mono tracking-wider text-void uppercase">
              In squad
            </span>
          ) : null}
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1">
            <HeroIcon heroId={hero.id as HeroId} size="chip" />
            <span className="text-body min-w-0 flex-1 truncate font-display tracking-wide text-parchment uppercase">
              {hero.name}
            </span>
            <span className="text-caption shrink-0 font-mono text-faint">R{hero.reach}</span>
          </span>

          {/* Both authored forces, because coverage is the union of the two and
              a card showing only the House hides half of what she can open. */}
          <span className="text-caption flex items-center gap-1 font-mono tracking-wider uppercase">
            <span className={FORCE_TEXT[hero.primary]}>{hero.primary}</span>
            <span className="text-decor">·</span>
            <span className={FORCE_TEXT[hero.secondary]}>{hero.secondary}</span>
          </span>

          {/**
           * **The Bane, which is the whole reason to read this card.**
           *
           * LMNTLZ is counter-building, and until now nothing on the squad
           * screen said what a champion bleeds to — the one fact that decides
           * whether she belongs beside the other five. Derived, never authored:
           * `hero.bane` is `counter(primary)` from `@lmntlz/content`.
           */}
          <span className="text-caption flex items-center gap-1 font-mono tracking-wider uppercase">
            <span className="text-decor">Bane</span>
            <TypeIcon type={hero.bane} size="pip" />
            <span className={FORCE_TEXT[hero.bane]}>{hero.bane}</span>
          </span>

          {/**
           * **Where she is committed, always** — not only when she is on some
           * other squad. A player scanning 27 cards for somebody free needs to
           * see *free*, and an absent tag is indistinguishable from a tag that
           * failed to render.
           */}
          <span className="text-caption block truncate font-mono tracking-wider uppercase">
            {state?.zone ? (
              /* Name the zone. "Unavailable" alone sends the player hunting. */
              <span className="text-dark-lit">Defending · {ZONE_LABEL[state.zone]}</span>
            ) : state?.squads.length ? (
              <span className="text-gold">
                Striking · {state.squads.map((s) => ROMAN[s] ?? s + 1).join(', ')}
              </span>
            ) : (
              <span className="text-decor">Unassigned</span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
