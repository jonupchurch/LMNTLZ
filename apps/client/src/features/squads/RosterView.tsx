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
 * ### 019 — art, and two filters that are not the same filter
 *
 * `resources/03-squad-builder.md` asks for a picker *"filterable by type and by
 * weakness, so players can counter-build"*, and the design draws both rows: nine
 * House chips, then nine `COVERS BANE` swatches. They read as duplicates and
 * are not —
 *
 * - a **House** chip matches `primary`: which of the Nine a champion belongs to.
 * - a **covers-bane** swatch matches `strengths`, which is `{primary,
 *   secondary}`: who can punish an enemy whose Bane is that force.
 *
 * An Earth champion with a Fire secondary opens a Fire-baned door and is not in
 * the Fire House. Filtering on `primary` alone would hide her from exactly the
 * player who needs her, which is the whole counter-building loop.
 */

import { useMemo, useState } from 'react';
import { DAMAGE_TYPES, type DamageType, type Hero, type HeroId } from '@lmntlz/content';
import { FORCE_FILL, FORCE_RING, FORCE_TEXT, HeroIcon, HeroPortrait } from '../../components/index.js';
import type { RosterResponse, Zone } from './types.js';
import { ATTACK_SQUADS, DEFENSE_TOTAL } from './hooks/useAllocation.js';

export interface RosterViewProps {
  readonly roster: RosterResponse;
  readonly selectedHeroId: string | null;
  readonly onSelect: (heroId: string) => void;
  /** Who is already seated in the squad on screen, for the `IN SQUAD` tag. */
  readonly seatedIds?: ReadonlySet<string>;
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
}: RosterViewProps) {
  const [search, setSearch] = useState('');
  const [houses, setHouses] = useState<ReadonlySet<DamageType>>(new Set());
  const [covers, setCovers] = useState<ReadonlySet<DamageType>>(new Set());

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
      if (houses.size > 0 && !houses.has(hero.primary)) return false;
      if (covers.size > 0 && !hero.strengths.some((force) => covers.has(force))) return false;
      return true;
    });
  }, [roster.heroes, search, houses, covers]);

  const committed =
    roster.assignments.defense.visible.seats.length +
    roster.assignments.defense.hidden.seats.length;

  return (
    <section aria-label="Champion roster" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-caption font-mono tracking-widest text-faint uppercase">Picker</h2>

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
        <ul className="flex flex-wrap gap-1.5" aria-label="Filter by House">
          {DAMAGE_TYPES.map((type) => (
            <li key={type}>
              <FilterChip
                type={type}
                on={houses.has(type)}
                label={type}
                onToggle={() => setHouses(toggled(houses, type))}
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5">
          <span className="text-caption font-mono tracking-widest text-faint uppercase">
            Covers bane
          </span>
          <ul className="flex gap-1">
            {DAMAGE_TYPES.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  aria-pressed={covers.has(type)}
                  aria-label={`Show champions who can strike ${type}`}
                  onClick={() => setCovers(toggled(covers, type))}
                  className={[
                    'size-4 rounded-sm border transition-shadow duration-(--duration-fast)',
                    covers.has(type)
                      ? `${FORCE_FILL[type].split(' ')[0]!} border-parchment shadow-(--shadow-glow-gold-strong)`
                      : 'border-line bg-void hover:border-faint',
                  ].join(' ')}
                />
              </li>
            ))}
          </ul>
        </div>

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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
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
        'text-caption inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono tracking-wider uppercase transition-colors duration-(--duration-fast)',
        on ? 'border-parchment bg-raised text-parchment' : 'border-line text-faint hover:text-muted',
      ].join(' ')}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${FORCE_FILL[type].split(' ')[0]!}`} />
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
        'relative block aspect-4/5 w-full overflow-hidden rounded-lg bg-void text-left transition-shadow duration-(--duration-fast)',
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
          <HeroIcon heroId={hero.id as HeroId} size="chip" />
          {seated ? (
            <span className="text-caption rounded-sm bg-gold px-1 font-mono tracking-wider text-void uppercase">
              In squad
            </span>
          ) : state?.zone ? (
            /* **Name the zone.** "Unavailable" alone sends the player hunting.
               `DEF ·` prefixes it because `visible` on its own, in a corner tag
               at 10px, reads as a property of the card rather than a place. */
            <span className="text-caption rounded-sm bg-void/80 px-1 font-mono tracking-wider text-dark-lit uppercase">
              Def · {state.zone}
            </span>
          ) : state?.squads.length ? (
            <span className="text-caption rounded-sm bg-void/80 px-1 font-mono tracking-wider text-gold uppercase">
              Atk {state.squads.map((s) => s + 1).join(',')}
            </span>
          ) : null}
        </span>

        <span className="min-w-0">
          <span className="text-body block truncate font-display tracking-wide text-parchment uppercase">
            {hero.name}
          </span>
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`text-caption truncate font-mono tracking-wider uppercase ${FORCE_TEXT[hero.primary]}`}
            >
              {hero.primary}
            </span>
            <span className="text-caption shrink-0 font-mono text-faint">R{hero.reach}</span>
          </span>
        </span>
      </span>
    </button>
  );
}
