/**
 * `ROSTER` — its own destination, as the rail draws it (017 T045).
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
 * ### It needs no API call
 *
 * **All 27 champions are unlocked from the start and identical for every
 * player**, so the roster is content, not player state — it comes from
 * `@lmntlz/content` in the bundle. There is nothing to fetch, nothing to
 * fail, and no loading state, which is why this screen has no
 * `onUnauthenticated`: it is readable signed out.
 *
 * Filtering is by force, because that is the question the game asks. Counter
 * building means "who do I have that beats Air", and the answer is a filter
 * over the nine.
 */

import { DAMAGE_TYPES, getAllHeroes, type DamageType, type Hero } from '@lmntlz/content';
import { useMemo, useState } from 'react';
import { HeroCard, Panel, TypeBadge } from '../../components/index.js';

export interface RosterScreenProps {
  readonly onInspect?: (hero: Hero) => void;
}

export function RosterScreen({ onInspect }: RosterScreenProps): React.JSX.Element {
  const all = useMemo(() => getAllHeroes(), []);
  const [force, setForce] = useState<DamageType | null>(null);

  /**
   * A hero matches on **either** force, not just the primary. Filtering on
   * `primary` alone hides every hero who answers a threat with their
   * secondary, which is most of the interesting counter-building.
   */
  const shown = force
    ? all.filter((h) => h.primary === force || h.secondary === force)
    : all;

  return (
    <>
      <Panel span={12}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1 mr-4 font-display uppercase tracking-wide">Roster</h1>

          <button
            type="button"
            aria-pressed={force === null}
            onClick={() => setForce(null)}
            className={`text-caption h-6 rounded-sm px-2 font-display tracking-wide uppercase ${
              force === null ? 'bg-gold text-void' : 'bg-surface text-muted'
            }`}
          >
            All {all.length}
          </button>

          {DAMAGE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={force === type}
              onClick={() => setForce(force === type ? null : type)}
              className={force === type ? 'opacity-100' : 'opacity-60 hover:opacity-100'}
            >
              <TypeBadge type={type} size="sm" />
            </button>
          ))}
        </div>

        <p className="text-caption text-muted mt-2">
          {/* Says why a short list is short. "No champions match" alone reads as
              a bug the first time a player narrows too far. */}
          {force
            ? `${shown.length} of ${all.length} champions carry ${force} as a Force.`
            : `All ${all.length} champions, unlocked from the start and identical for every player.`}
        </p>
      </Panel>

      <Panel span={12}>
        {shown.length === 0 ? (
          <p className="text-body text-muted">No champions match. Clear the filter and try again.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {shown.map((hero) => (
              <li key={hero.id}>
                <HeroCard
                  hero={hero}
                  scale="standard"
                  {...(onInspect ? { onSelect: onInspect } : {})}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
