/**
 * A defender's wall as twelve coloured bars (019).
 *
 * `LMNTLZ Matchmaking and Results.dc.html` puts one of these on every offering
 * — six champions × two Forces — and it is what turns the rail from a list of
 * names into a decision. A player scanning six opponents is asking one question,
 * *"do I have answers to this?"*, and the spread answers it before a click.
 *
 * ### Twelve bars, not nine
 *
 * It is **not** a histogram of the nine Forces. It is the wall in seat order,
 * two bars per champion, so a squad running three Fire champions shows three
 * adjacent Fire pairs rather than one tall Fire column. That distinction is the
 * whole value: *where* the concentration sits is what a striking six is built
 * against, and a nine-bucket tally throws the ordering away.
 *
 * ### The Forces are derived here, never sent
 *
 * `/matchmaking/candidates` sends **hero ids**. The Forces come from
 * `@lmntlz/content`, which is already in the bundle and is the single source for
 * a champion's `primary` and `secondary` — Constitution XV. A server that sent
 * nine colours would be shipping derived data twice and would go out of step
 * with the roster the first time a champion was re-authored.
 *
 * The `secondary` bar is dimmed. Both Forces are real and both are dealt, but
 * `primary` is the House and the source of the Bane; a flat pair would say the
 * two rank equally, which is the same call `HeroMarks` makes.
 */

import { getHero, type DamageType } from '@lmntlz/content';
import { FORCE_FILL } from '../../components/type/forceClasses.js';

export interface TypeSpreadProps {
  /** The defender's Visible six, in seat order. */
  readonly heroIds: readonly string[];
}

interface Bar {
  readonly key: string;
  readonly force: DamageType;
  readonly dim: boolean;
}

export function TypeSpread({ heroIds }: TypeSpreadProps): React.JSX.Element | null {
  const bars: Bar[] = [];

  for (const [seat, heroId] of heroIds.entries()) {
    /*
     * A champion the client cannot resolve is skipped rather than thrown on. The
     * roster and the server's ids come from the same generated source, so this
     * is unreachable — but a rail that crashes because one id drifted would take
     * out the whole screen to report a cosmetic problem.
     */
    let hero;
    try {
      hero = getHero(heroId);
    } catch {
      continue;
    }
    bars.push({ key: `${seat}-p`, force: hero.primary, dim: false });
    bars.push({ key: `${seat}-s`, force: hero.secondary, dim: true });
  }

  if (bars.length === 0) return null;

  return (
    <span
      data-type-spread
      className="mt-2 flex gap-px"
      /*
       * One label for the strip, not twelve. A screen reader walking twelve bare
       * Force names says nothing a player can use; the sentence says what the
       * strip is for. The bars themselves are decorative once it is read.
       */
      role="img"
      aria-label={`Their wall deals: ${bars
        .filter((b) => !b.dim)
        .map((b) => b.force)
        .join(', ')}`}
    >
      {bars.map((bar) => (
        <span
          key={bar.key}
          data-force-bar={bar.force}
          className={`h-3.5 flex-1 rounded-xs ${FORCE_FILL[bar.force]} ${bar.dim ? 'opacity-45' : ''}`}
        />
      ))}
    </span>
  );
}
