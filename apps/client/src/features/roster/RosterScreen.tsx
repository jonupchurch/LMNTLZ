/**
 * `ROSTER` — its own destination, as the rail draws it (017 T045, re-laid out
 * against `LMNTLZ Roster.dc.html` in T048).
 *
 * ### This is a browsing screen, not the squad builder's hero list
 *
 * `features/squads/RosterView.tsx` looks similar and does a different job: it
 * is the **allocation control**, and clicking a hero there assigns them to a
 * zone. Lifting it out would have taken the selection mechanism away from the
 * builder and broken squad saving, so this is a new surface rather than a
 * moved one. The design draws both — `LMNTLZ Roster.dc.html` is a study
 * screen, and the builder row is in the Design System export.
 *
 * > **T048 names `RosterView` and that reference predates T045's split.** The
 * > Roster export is unmistakably this screen: it has a search box, a
 * > counter-build filter and a study drawer, and no seats. The builder row was
 * > ported under T049 against the Design System export, which is where it
 * > actually lives.
 *
 * ### It needs no API call
 *
 * **All 27 champions are unlocked from the start and identical for every
 * player**, so the roster is content, not player state — it comes from
 * `@lmntlz/content` in the bundle. There is nothing to fetch, nothing to
 * fail, and no loading state, which is why this screen has no
 * `onUnauthenticated`: it is readable signed out.
 *
 * ### What the export draws that this deliberately does not
 *
 * The export's filter rail carries a **COLLECTION** group — *All champions /
 * Recruited only / Unrecruited* — its header reads `COLLECTED {{ ownedCount }}
 * / 27`, and its tiles can render a `LOCKED` badge. All of that describes a
 * collection system, and **LMNTLZ does not have one**: nothing is collected,
 * so no player can out-roster another, and that is the competitive premise
 * rather than a feature that has not shipped. A greyed-out card here would be
 * its first pixel. Canon wins; logged in `resources/README.md`.
 *
 * The tile's `{{ h.epithet }}` is also absent, for a duller reason — there is
 * no epithet field in `AuthoredHero`. Nothing is invented for it.
 */

import {
  DAMAGE_TYPES,
  MAGIC_TYPES,
  MELEE_TYPES,
  getAllHeroes,
  type DamageType,
  type Hero,
  type HeroId,
} from '@lmntlz/content';
import { useMemo, useState } from 'react';
import {
  Button,
  HeroCard,
  HeroIcon,
  Panel,
  RelationshipStrip,
  TextField,
  TypeBadge,
} from '../../components/index.js';

export interface RosterScreenProps {
  readonly onInspect?: (hero: Hero) => void;
}

/** The export's sort control: `FORCE · NAME · POWER`. */
type Sort = 'force' | 'name' | 'power';
type ReachFilter = 'any' | 1 | 2;

/**
 * Total power, for the third sort. **Not a rule and not shown as a number** —
 * it orders the grid and nothing else reads it, so it cannot leak into balance.
 */
const totalStats = (hero: Hero): number =>
  Object.values(hero.stats).reduce((sum, value) => sum + value, 0);

export function RosterScreen({ onInspect }: RosterScreenProps): React.JSX.Element {
  const all = useMemo(() => getAllHeroes(), []);

  const [query, setQuery] = useState('');
  const [forces, setForces] = useState<readonly DamageType[]>([]);
  /** *Show champions whose Bane or Fault this Force opens* — the export's words. */
  const [weakTo, setWeakTo] = useState<DamageType | null>(null);
  const [reach, setReach] = useState<ReachFilter>('any');
  const [sort, setSort] = useState<Sort>('force');
  const [selected, setSelected] = useState<Hero | null>(null);

  const toggleForce = (type: DamageType): void =>
    setForces((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );

  /** Per-force champion counts, for the rail's tallies and the header's meters. */
  const counts = useMemo(() => {
    const map = new Map<DamageType, number>(DAMAGE_TYPES.map((t) => [t, 0]));
    for (const hero of all) {
      map.set(hero.primary, (map.get(hero.primary) ?? 0) + 1);
      map.set(hero.secondary, (map.get(hero.secondary) ?? 0) + 1);
    }
    return map;
  }, [all]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = all.filter((hero) => {
      if (needle && !hero.name.toLowerCase().includes(needle)) return false;
      /**
       * A hero matches on **either** force, not just the primary. Filtering on
       * `primary` alone hides every hero who answers a threat with their
       * secondary, which is most of the interesting counter-building.
       */
      if (forces.length > 0 && !forces.includes(hero.primary) && !forces.includes(hero.secondary)) {
        return false;
      }
      /**
       * **Both weaknesses, and both are derived.** `bane` and `fault` come off
       * the hero, which computed them from `counter(primary)` and
       * `counter(secondary)` — this screen never re-derives them (XV).
       */
      if (weakTo && hero.bane !== weakTo && hero.fault !== weakTo) return false;
      if (reach !== 'any' && hero.reach !== reach) return false;
      return true;
    });

    const ordered = [...filtered];
    if (sort === 'name') ordered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'power') ordered.sort((a, b) => totalStats(b) - totalStats(a));
    else {
      ordered.sort(
        (a, b) =>
          DAMAGE_TYPES.indexOf(a.primary) - DAMAGE_TYPES.indexOf(b.primary) ||
          a.name.localeCompare(b.name),
      );
    }
    return ordered;
  }, [all, query, forces, weakTo, reach, sort]);

  const filtered = query.trim() !== '' || forces.length > 0 || weakTo !== null || reach !== 'any';

  const clearAll = (): void => {
    setQuery('');
    setForces([]);
    setWeakTo(null);
    setReach('any');
  };

  return (
    <>
      {/* --- the filter rail, 264px in the export ≈ 3 of twelve ------------ */}
      <Panel span={3}>
        <div className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-4">
          <TextField
            label="Search champions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champions"
            /* The export's `{{ resultLabel }}` — the count lives in the field. */
            adornment={`${shown.length} / ${all.length}`}
          />

          <ForceGroup
            heading="Force · six arcane"
            types={MAGIC_TYPES}
            columns={2}
            counts={counts}
            selected={forces}
            onToggle={toggleForce}
          />
          <ForceGroup
            heading="Force · three martial"
            types={MELEE_TYPES}
            columns={1}
            counts={counts}
            selected={forces}
            onToggle={toggleForce}
          />

          <section aria-labelledby="weak-to-heading">
            <h3
              id="weak-to-heading"
              className="text-caption mb-1 font-mono tracking-[0.2em] uppercase text-faint"
            >
              Counter-build · weak to
            </h3>
            <p className="text-caption mb-2 text-muted">
              Show champions whose Bane or Fault this Force opens.
            </p>
            <div className="flex flex-wrap gap-1">
              {DAMAGE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={weakTo === type}
                  onClick={() => setWeakTo(weakTo === type ? null : type)}
                  className={weakTo === type ? 'opacity-100' : 'opacity-55 hover:opacity-100'}
                >
                  <TypeBadge type={type} size="sm" />
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="reach-heading">
            <h3
              id="reach-heading"
              className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint"
            >
              Reach
            </h3>
            <div className="flex gap-1" role="radiogroup" aria-label="Reach">
              {(['any', 1, 2] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={reach === value}
                  onClick={() => setReach(value)}
                  className={[
                    'text-caption flex-1 rounded border py-1 font-mono uppercase',
                    reach === value
                      ? 'border-gold bg-raised text-parchment'
                      : 'border-line text-faint',
                  ].join(' ')}
                >
                  {value === 'any' ? 'Any' : `R${value}`}
                </button>
              ))}
            </div>
          </section>

          {/* `Button` takes `state`, not `disabled` — the seven states are one
              closed union so a control cannot be half-disabled. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={clearAll}
            state={filtered ? 'rest' : 'disabled'}
          >
            Clear filters
          </Button>
        </div>
      </Panel>

      {/* --- the champions ------------------------------------------------ */}
      <Panel span={selected ? 6 : 9}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-h1 font-display uppercase tracking-wide">The Roster</h1>
            <p className="text-caption text-muted mt-1">
              {/* Says why a short list is short. "No champions match" alone reads
                  as a bug the first time a player narrows too far. */}
              {filtered
                ? `${shown.length} of ${all.length} champions match.`
                : `All ${all.length} champions, unlocked from the start and identical for every player.`}
            </p>
          </div>

          {/**
           * The export's nine meters. It heads them `COLLECTED n / 27`; there is
           * nothing to collect, so they are what each Force actually is — how
           * many champions carry it, counting both slots. 27 heroes × 2 forces
           * over 9 types, so the flat line is 6 and a tall bar is a Force that
           * is over-represented among *secondaries*.
           */}
          <div className="flex items-end gap-1" aria-hidden>
            {DAMAGE_TYPES.map((type) => (
              <span key={type} className="flex w-6 flex-col items-center gap-1">
                <span className="flex h-8 w-full items-end rounded-sm bg-raised">
                  <span
                    className="w-full rounded-sm bg-current"
                    style={{ height: `${((counts.get(type) ?? 0) / 9) * 100}%` }}
                  />
                </span>
                <span className="text-caption font-mono text-faint">{type.slice(0, 3)}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2" role="radiogroup" aria-label="Sort">
            <span className="text-caption font-mono tracking-[0.16em] uppercase text-faint">
              Sort
            </span>
            {(['force', 'name', 'power'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={sort === option}
                onClick={() => setSort(option)}
                className={[
                  'text-caption rounded px-2 py-1 font-display tracking-wide uppercase',
                  sort === option ? 'bg-gold text-void' : 'text-muted hover:text-parchment',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>
        </header>

        {shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-14 text-center">
            <p className="text-h3 font-display uppercase tracking-wide">No champions match</p>
            <p className="text-body text-muted mx-auto mt-2 max-w-md">
              Nine Forces, twenty-seven champions, and no overlap on these filters. Drop one and
              try again.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {shown.map((hero) => (
              <li key={hero.id}>
                <HeroCard
                  hero={hero}
                  scale="compact"
                  fill
                  onSelect={(picked) => {
                    setSelected(picked);
                    onInspect?.(picked);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/**
       * **The study drawer, as a third region rather than an overlay.**
       *
       * The export floats it `position:absolute` over the right of the grid.
       * Here it takes columns instead: the shell already caps and centres the
       * content, and an absolutely-positioned panel inside a capped column
       * would have to re-derive where the column ends. The grid narrows from 9
       * to 6 and the drawer occupies the difference, which is the same picture
       * without a second copy of the shell's arithmetic.
       */}
      {selected ? (
        <Panel span={3}>
          <aside
            aria-label={`${selected.name}, champion detail`}
            className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              <HeroIcon heroId={selected.id as HeroId} name={selected.name} size="detail" />
              <div className="min-w-0 flex-1">
                <h2 className="text-h2 font-display uppercase tracking-wide">{selected.name}</h2>
                <p className="text-caption text-muted font-mono uppercase">
                  {selected.role} · reach {selected.reach}
                </p>
              </div>
              <Button
                variant="icon"
                size="sm"
                aria-label="Close detail"
                onClick={() => setSelected(null)}
              >
                ✕
              </Button>
            </div>

            <RelationshipStrip hero={selected} />

            <section aria-label="Powers">
              <h3 className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
                Powers
              </h3>
              <ul className="flex flex-col gap-1">
                {selected.powers.map((power) => (
                  <li
                    key={power.id}
                    className="text-caption flex items-baseline justify-between gap-2 font-mono"
                  >
                    <span className="truncate text-parchment">{power.name}</span>
                    {/* Turns, never a clock (Constitution XIII). */}
                    <span className="shrink-0 text-faint">
                      T{power.tier} · {power.cooldown === 0 ? 'ready' : `${power.cooldown}t`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/**
             * **Derived here, never stored.** `CLAUDE.md` fixes `HP = Toughness
             * × 50`, and `maxHpOf` in the component layer is the one place it
             * is written down — this reads the same stats the card does.
             */}
            <dl className="grid grid-cols-2 gap-2">
              {(
                [
                  ['Might', selected.stats.might],
                  ['Speed', selected.stats.speed],
                  ['Toughness', selected.stats.toughness],
                  ['Luck', selected.stats.luck],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded bg-raised px-3 py-2">
                  <dt className="text-caption font-mono uppercase text-faint">{label}</dt>
                  <dd className="text-h3 font-mono text-parchment">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </Panel>
      ) : null}
    </>
  );
}

/**
 * One of the export's two Force groups. Arcane runs two-up, martial one-up,
 * because six and three are the counts and the export lays them out that way.
 */
function ForceGroup({
  heading,
  types,
  columns,
  counts,
  selected,
  onToggle,
}: {
  readonly heading: string;
  readonly types: readonly DamageType[];
  readonly columns: 1 | 2;
  readonly counts: ReadonlyMap<DamageType, number>;
  readonly selected: readonly DamageType[];
  readonly onToggle: (type: DamageType) => void;
}): React.JSX.Element {
  const id = heading.replace(/\W+/g, '-').toLowerCase();

  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
        {heading}
      </h3>
      {/* Written out, not interpolated — Tailwind scans source text. */}
      <div className={columns === 2 ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-1 gap-1'}>
        {types.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={selected.includes(type)}
            onClick={() => onToggle(type)}
            className={[
              'flex items-center gap-2 rounded border px-2 py-1 transition-colors',
              selected.includes(type) ? 'border-gold bg-raised' : 'border-line hover:border-faint',
            ].join(' ')}
          >
            <TypeBadge type={type} size="sm" />
            <span className="text-caption ml-auto font-mono text-faint">{counts.get(type)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
