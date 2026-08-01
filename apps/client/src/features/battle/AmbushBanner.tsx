/**
 * **The ambush, announced** (2026-08-01, reported from live play).
 *
 * ### Why this exists
 *
 * The ambush already worked. It rolled correctly, it paid double, it doubled the
 * rating on a win, and the odds were displayed on three screens beforehand — and
 * the first player to actually get one said *"I think I got my first ambush, but
 * there's no notification that it's an ambush other than the different squad."*
 *
 * All of it was true and none of it arrived. The announcement was a 12px caption
 * sitting under a heading that already said **Hidden zone**, so it read as a
 * subtitle rather than as something that had just happened; it never said what
 * an ambush was worth, so there was nothing to feel; and `BattleView` did not
 * carry the flag at all, so one reload erased it permanently.
 *
 * ### It is a state, not a toast, and that is the load-bearing decision
 *
 * A toast fires once and is gone, which is what the resume path was reasoning
 * about when it suppressed the announcement on reload — repeating an *event*
 * every time the page loads would read as a fresh ambush each time.
 *
 * So this is not an event. It says **you are in their Hidden six**, which is
 * true for the whole battle, and stays up for the whole battle. That is the only
 * version that survives a reload, and reload is exactly when the old one was
 * lost. It also happens to be the more useful one: a player mid-fight deciding
 * whether to spend a cooldown wants to know this is the double-paying zone, and
 * that question comes up on turn forty, not turn one.
 *
 * ### Nothing here computes what an ambush is worth
 *
 * `×2` appears twice on this screen and is typed nowhere. Both multipliers come
 * off `GET /v1/me/shards` — `hiddenMultiplier` and `hiddenRatingMultiplier`,
 * which are two different constants that presently agree. A component that wrote
 * `×2` would keep saying it after either one moved, and the screen would be
 * quoting a payout the server no longer makes.
 *
 * **The rewards are optional, deliberately.** The announcement is the ask; the
 * numbers are what make it land. If that request is slow or fails, the player is
 * still told they were ambushed — a banner that waited for a config fetch to say
 * *anything* would reintroduce the exact bug, silently, on a bad connection.
 */

import type { JSX } from 'react';
import type { AmbushRewards } from './types.js';

export interface AmbushBannerProps {
  /**
   * The two multipliers, served. `null` while `GET /v1/me/shards` is in flight
   * or after it failed — the banner degrades to the announcement alone rather
   * than to nothing.
   */
  readonly rewards?: AmbushRewards | null;
}

export function AmbushBanner({ rewards = null }: AmbushBannerProps): JSX.Element {
  return (
    <section
      data-testid="ambush-banner"
      aria-label="Ambush"
      /**
       * `role="status"` rather than `alert`: it is a standing condition of the
       * screen, not an interruption, and an assertive live region would talk
       * over the turn announcements for the rest of the battle.
       */
      role="status"
      className="lz-surface-raised lz-bloom-gold shadow-glow-gold flex items-stretch gap-4 overflow-hidden"
    >
      {/**
       * **The hatch is the callback.** `.lz-sealed` draws the six seats the
       * player was shown and could not scout, on the screen where they chose
       * this fight; the same diagonal here is what connects *that sealed panel*
       * to *these six champions in front of me now*. Without it the banner is a
       * gold box that could be announcing anything.
       *
       * ⚠️ Gold, not `.lz-hatch-dark`. That one is built to lie over a portrait
       * — dark on darker — and against this surface it vanished completely. The
       * first screenshot showed a plain strip where the band was supposed to be,
       * which is a defect only an eye can find.
       */}
      <span aria-hidden className="lz-hatch-gold w-12 shrink-0 border-r border-gold/40" />

      <div className="flex flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 pr-4">
        <div>
          <h3 className="text-h2 font-display tracking-widest text-gold uppercase">Ambushed</h3>
          <p className="text-caption mt-0.5 text-muted">
            Their <strong className="text-parchment">Hidden six</strong> answered instead of the wall
            you scouted — the squad nobody can choose to attack, and nobody has seen.
          </p>
        </div>

        {rewards && (
          <ul className="flex shrink-0 flex-wrap gap-2" aria-label="What a Hidden battle is worth">
            <li
              data-chip="hidden-shards"
              className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-gold/50 ring-inset"
            >
              <span className="tracking-wider text-faint uppercase">Shards</span>
              <span className="text-gold">×{rewards.shardMultiplier}</span>
            </li>
            <li
              data-chip="hidden-rating"
              className="text-caption inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono ring-1 ring-gold/50 ring-inset"
            >
              {/**
               * **"on a win" is not padding.** The rating double is the winner's
               * positive delta only — a Hidden loss costs exactly what a Visible
               * one costs. Dropping the qualifier would promise a symmetric
               * swing and make the ladder look broken the first time somebody
               * lost one.
               */}
              <span className="tracking-wider text-faint uppercase">Rating on a win</span>
              <span className="text-gold">×{rewards.ratingMultiplier}</span>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
