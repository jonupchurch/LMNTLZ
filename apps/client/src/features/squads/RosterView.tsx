/**
 * All 27 champions with their assignment status (T018, FR-002).
 *
 * **Every hero is always listed.** There is no locked state, no silhouette and
 * no "not yet recruited" — the roster is identical for every player and that is
 * the competitive premise. A greyed-out card here would be the first pixel of a
 * collection system.
 *
 * What varies is *commitment*: a champion is free, defending a zone, or in one
 * or more attack squads. A defender is unavailable to offense, and the card says
 * which zone rather than only that she is unavailable — "Bramwen cannot attack"
 * leaves the player hunting for her.
 */

import { useMemo } from 'react';
import type { Hero, HeroId } from '@lmntlz/content';
import { HeroIcon } from '../../components/index.js';
import type { RosterResponse, Zone } from './types.js';
import { ATTACK_SQUADS, DEFENSE_TOTAL } from './hooks/useAllocation.js';

export interface RosterViewProps {
  readonly roster: RosterResponse;
  readonly selectedHeroId: string | null;
  readonly onSelect: (heroId: string) => void;
}

interface Commitment {
  readonly zone?: Zone;
  readonly squads: number[];
}

export function RosterView({ roster, selectedHeroId, onSelect }: RosterViewProps) {
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

  const committed = roster.assignments.defense.visible.seats.length +
    roster.assignments.defense.hidden.seats.length;

  return (
    <section aria-label="Champion roster">
      <header className="mb-4 flex items-baseline justify-between gap-6">
        <h2 className="font-display text-xl tracking-widest uppercase text-parchment">
          Champions
        </h2>

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
        <p className="font-mono text-xs">
          <span className="text-faint">Ambush </span>
          <span className="text-gold">{roster.ambush.chance}%</span>
          <span className="text-faint">
            {' '}
            · +{roster.ambush.perWin}% per win, up to {roster.ambush.cap}%
            {roster.ambush.chance >= roster.ambush.cap ? ' · at cap' : ''}
          </span>
        </p>

        <p className="font-mono text-xs text-faint">
          {/**
           * **The sentence that makes the constraint legible.** 15 heroes for 3
           * squads of 6 is why overlap keeps happening, and no per-squad message
           * conveys it.
           */}
          {committed} / {DEFENSE_TOTAL} on defense · {roster.available.forOffense.length} left for{' '}
          {ATTACK_SQUADS} squads of 6
        </p>
      </header>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        {roster.heroes.map((hero: Hero) => {
          const state = commitment.get(hero.id);
          const selected = hero.id === selectedHeroId;

          return (
            <li key={hero.id}>
              <button
                type="button"
                onClick={() => onSelect(hero.id)}
                aria-pressed={selected}
                className={[
                  'w-full rounded border px-3 py-2 text-left transition-colors',
                  selected ? 'border-gold bg-raised' : 'border-line bg-surface hover:border-faint',
                ].join(' ')}
              >
                {/* 017 T042 — the roster is where all 27 emblems appear at once. */}
                <span className="flex items-center gap-2">
                  <HeroIcon heroId={hero.id as HeroId} size="chip" />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm tracking-wide text-parchment">
                      {hero.name}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] tracking-wider uppercase text-faint">
                      {hero.primary} · {hero.secondary} · reach {hero.reach}
                    </span>
                  </span>
                </span>

                <span className="mt-2 block font-mono text-[11px]">
                  {state?.zone ? (
                    // Name the zone. "Unavailable" alone sends the player hunting.
                    <span className="text-dark-lit">Defending · {state.zone}</span>
                  ) : state?.squads.length ? (
                    <span className="text-gold">
                      Attack {state.squads.map((s) => s + 1).join(', ')}
                    </span>
                  ) : (
                    <span className="text-faint">Unassigned</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
