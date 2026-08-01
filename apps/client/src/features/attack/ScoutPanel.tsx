/**
 * What one opponent looks like from the outside, and what answers them (019).
 *
 * ### This is the screen the whole design is about
 *
 * *"The game is counter-building: read the enemy's weaknesses, don't stack your
 * own."* Every hero's Bane and Fault are a pure function of its two authored
 * types, so a scout can compute them from the Codex regardless — which is
 * exactly why disclosing them is safe, and why **counting** them is the useful
 * thing this panel does that a list of six names does not.
 *
 * ### Composition, not layout
 *
 * The panel itself now decides almost nothing. `ScoutedWall` draws the six
 * standing champions, `SealedZone` draws the six you are not allowed to see,
 * and `ScoutReadout` does the arithmetic across both against your own squad.
 * Each of those is a separate claim with a separate disclosure rule, and they
 * were previously interleaved in one function where the rules were comments.
 *
 * ### What is deliberately absent, still
 *
 * No stat values, base or runed. No indication of which stat a rune boosts. No
 * targeting rule and no power ranking, in either zone. And for the Hidden
 * squad, **the hold streak and nothing else** — `ScoutView.hidden` carries no
 * seats array, and `SealedZone` draws a client-side constant rather than
 * anything served (Constitution XVII).
 */

import type { Hero } from '@lmntlz/content';
import { ScoutedWall } from './ScoutedWall.js';
import { SealedZone } from './SealedZone.js';
import { ScoutReadout } from './ScoutReadout.js';
import type { ScoutView } from './types.js';

export interface ScoutPanelProps {
  readonly scout: ScoutView;
  /** Their rating, from the candidate row that opened this panel. */
  readonly rating?: number;
  /** Percent, as served by `/matchmaking/candidates`. Never computed here. */
  readonly ambushChance: number;
  readonly consecutiveWins: number;
  /** The squad you would send, resolved to champions. Empty until one is ready. */
  readonly squad: readonly Hero[];
  readonly squadName: string | null;
  /** The attack control and the profile link, so the choice sits beside its reasons. */
  readonly children?: React.ReactNode;
}

export function ScoutPanel({
  scout,
  rating,
  ambushChance,
  consecutiveWins,
  squad,
  squadName,
  children,
}: ScoutPanelProps): React.JSX.Element {
  return (
    <section aria-label={`Scouting ${scout.username}`} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-caption font-mono tracking-widest text-gold uppercase">
            Scouting · {scout.league}
          </p>
          <h3 className="text-h1 font-display tracking-wide text-parchment uppercase">
            {scout.username}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          {rating !== undefined && (
            <div className="text-right">
              <p className="text-caption font-mono tracking-widest text-faint uppercase">
                Their rating
              </p>
              <p className="text-h2 font-mono tabular-nums text-parchment">{rating}</p>
            </div>
          )}
          {children}
        </div>
      </header>

      {/**
       * **The two zones side by side, 60/40**, which is the export's
       * `minmax(0,1.5fr) minmax(0,1fr)`. Drawing them together is the point:
       * one wall is the fight you chose and the other is the fight that might
       * happen instead, and a screen that showed only the first would make the
       * ambush a surprise rather than a stated risk.
       */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <ScoutedWall
          seats={scout.visible.seats}
          holdStreak={scout.visible.holdStreak}
          canDefend={scout.visible.canDefend}
          squad={squad}
        />
        <SealedZone
          holdStreak={scout.hidden.holdStreak}
          ambushChance={ambushChance}
          consecutiveWins={consecutiveWins}
        />
      </div>

      <ScoutReadout seats={scout.visible.seats} squad={squad} squadName={squadName} />
    </section>
  );
}
