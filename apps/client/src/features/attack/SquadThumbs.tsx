/**
 * Six faces in a row — a squad, small enough to sit on a card (019).
 *
 * Six portraits at thumb scale is the cheapest possible answer to *which squad
 * is this*, and it is the answer a name cannot give: a player recognises their
 * own six on sight and does not reliably remember what they called them.
 *
 * **Six slots always, filled or not.** A squad that has lost a champion to
 * defense draws an empty seat rather than five thumbs, because five faces and
 * six faces differ only in *width* otherwise — and "this squad is short" is
 * exactly the fact that decides whether it can attack at all.
 */

import type { DamageType, Hero, HeroId } from '@lmntlz/content';
import { FORCE_RING, HeroPortrait } from '../../components/index.js';

const SQUAD_SIZE = 6;

export interface SquadThumbsProps {
  readonly squad: readonly Hero[];
  /** Names the group for a screen reader when it stands on its own. */
  readonly label?: string;
}

export function SquadThumbs({ squad, label }: SquadThumbsProps): React.JSX.Element {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="flex gap-1"
    >
      {Array.from({ length: SQUAD_SIZE }, (_, i) => {
        const hero = squad[i];
        return hero ? (
          <span
            key={hero.id}
            data-thumb={hero.id}
            className={`relative block h-10 flex-1 overflow-hidden rounded-sm ring-1 ring-inset ${FORCE_RING[hero.primary as DamageType]}`}
          >
            <HeroPortrait
              heroId={hero.id as HeroId}
              force={hero.primary as DamageType}
              fill
              sizes="56px"
            />
          </span>
        ) : (
          <span key={`empty-${i}`} data-thumb="" className="lz-empty block h-10 flex-1" />
        );
      })}
    </span>
  );
}
