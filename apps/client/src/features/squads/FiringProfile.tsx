/**
 * Which powers actually fire under the current ranking (T048, FR-022).
 *
 * ### This computes locally, and that is the design decision (research.md Q3)
 *
 * `firingProfile` is imported from **`@lmntlz/sim/rules`** and runs in the
 * browser on every drag of the ranking widget. It is not fetched, and there is
 * no endpoint for it.
 *
 * A firing profile looks like it belongs in `sim/ai` — it is about the defense
 * AI's behaviour — but **it is not a choice**. *A power fires only when
 * everything ranked above it is on cooldown* is arithmetic over the cooldown
 * ladder: a pure function of `(hero, ranking)` with no randomness and no server
 * state. Putting it in `ai/` would have forced an endpoint and a network round
 * trip onto every pointer move, to compute something the client can derive from
 * a package it already imports.
 *
 * ### Nine turns, not sixty
 *
 * A champion takes **~8.5 turns in a real 6v6** — a battle is about 102
 * hero-turns across twelve champions. A 60-turn horizon reports a tier-0
 * auto-attack firing 5% of the time when at battle length it usually never fires
 * at all. **The number on the screen has to describe the game the player is
 * about to play**, not an asymptote.
 */

import { useMemo } from 'react';
import type { Hero } from '@lmntlz/content';
import { BATTLE_TURNS, SWEEP_TURNS, firingProfile, type PowerRanking } from '@lmntlz/sim/rules';

export interface FiringProfileProps {
  readonly hero: Hero;
  readonly ranking: PowerRanking;
}

export function FiringProfile({ hero, ranking }: FiringProfileProps) {
  // `BATTLE_TURNS` is 9 and comes from the rules package — never a literal here,
  // so a change to the measured battle length reaches this screen for free.
  const profile = useMemo(() => firingProfile(hero, ranking, BATTLE_TURNS), [hero, ranking]);

  /**
   * **Two different things, and only one is a mistake.**
   *
   * A power that fires 0 times in 9 turns but does fire at 60 is *slow* — a real
   * cost, and the count says so. A power that fires at neither has been
   * **switched off** by the ranking and no battle length recovers it.
   *
   * Measured, because the difference is not intuitive: `5·4·3·2·1·0` — one of
   * the twelve orderings feature 004 found safe — leaves a 9-turn zero on **21
   * of 27 champions** and a 60-turn zero on none. Calling those "never fires"
   * would put a red warning on almost every squad built the recommended way.
   */
  const structural = useMemo(
    () => new Set(firingProfile(hero, ranking, SWEEP_TURNS).filter((e) => e.fires === 0).map((e) => e.powerId)),
    [hero, ranking],
  );
  const switchedOff = profile.filter((entry) => structural.has(entry.powerId));
  const slow = profile.filter((entry) => entry.fires === 0 && !structural.has(entry.powerId));

  return (
    <div className="rounded border border-line bg-void/40 p-3">
      <p className="mb-2 font-display text-[11px] tracking-widest uppercase text-faint">
        Over {BATTLE_TURNS} turns
      </p>

      <ul className="flex flex-col gap-1 font-mono text-[11px]">
        {profile.map((entry) => {
          const off = structural.has(entry.powerId);
          return (
            <li key={entry.powerId} className="flex items-baseline justify-between gap-3">
              <span className={off ? 'text-slash-lit' : 'text-muted'}>
                T{entry.tier} · {entry.powerId}
              </span>
              <span className={off ? 'text-slash-lit' : entry.fires === 0 ? 'text-faint' : 'text-parchment'}>
                {off ? 'never' : entry.fires === 0 ? 'rarely' : `${entry.fires}×`}
              </span>
            </li>
          );
        })}
      </ul>

      {/**
       * **Surfaced, never blocked.** A ranking that switches a power off is a
       * lever, not a mistake — and it is recoverable by reopening a dropdown.
       * The player cannot see it from the widget, which shows an order; the
       * consequence is arithmetic.
       */}
      {switchedOff.length > 0 && (
        <p role="status" className="mt-2 font-mono text-[11px] text-slash-lit">
          {switchedOff.length === 1 ? 'One power never fires' : `${switchedOff.length} powers never fire`}{' '}
          under this ranking, at any battle length.
        </p>
      )}

      {switchedOff.length === 0 && slow.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-faint">
          {slow.length === 1 ? 'One power is' : `${slow.length} powers are`} unlikely to come up in a
          typical battle. That is a cost, not a mistake.
        </p>
      )}
    </div>
  );
}
