/**
 * 🔴 **A ward has to be spent by the same board write that used it** (021 US2).
 *
 * ### The bug this exists for, which was written and then caught by reading
 *
 * `Turned Aside` refuses the first critical hit against its bearer and pays with a
 * permanent mark, exactly as `Still Burning` does. In `resolveOne` the per-target
 * loop originally read the defender **once**, at the top:
 *
 * ```ts
 * const current = heroStateOf(next, target.instanceId);   // ← read here
 * const refusal = critRefusal(next, current);
 * next = applyPassiveEffects(next, refusal.paid, maxHp);  // ← mark written here
 * next = replaceHero(next, { ...current, hp, statuses }); // ← and erased here
 * ```
 *
 * The mark lands and is then overwritten by a `current` captured before it
 * existed. The ward refuses **every** crit for the rest of the battle, permanent
 * invulnerability to critical hits from a 200-shard purchase, and **nothing
 * fails**: the refusal works, the payment is returned, the hook is correct, and
 * every hook-level test passes. The defect lives entirely in the order of two
 * writes.
 *
 * ### Why it is tested here and not at the hook
 *
 * Every other `Turned Aside` test asks the hook whether it refuses, and the hook
 * is right. Only a resolved action can show the write being lost, because only the
 * resolver does both writes. This is the level where the failure is observable —
 * the same lesson as the header-crash test that had to move into an error
 * boundary before it could see anything.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { resolveOne } from '../../resolver/resolve.js';
import { markCount } from '../../rules/status.js';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { autoPower, battle, fixedSeed } from './fixtures.js';

const WARD = 'turned-aside';
const WARD_POWER_ID = `rune:${WARD}`;

/** The board, with one defender carrying the ward. */
function warded(state: BattleState, instanceId: string): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((h: HeroState) =>
      h.instanceId === instanceId ? { ...h, runeEffects: [WARD] } : h,
    ),
  };
}

/**
 * A seed whose first action against `d0` **critically hits**.
 *
 * Searched rather than asserted, because crit chance is `Luck × 0.5%` and no
 * particular seed is guaranteed to produce one. A search that finds nothing fails
 * loudly rather than leaving the test to pass on a board where no crit ever
 * happened — which would be the vacuous version of this whole file.
 */
function critSeed(state: BattleState): ReturnType<typeof fixedSeed> {
  const powerId = autoPower(getHero(heroStateOf(state, 'a0').heroId).id);

  for (let n = 1n; n < 4000n; n++) {
    const seed = fixedSeed(n);
    const { packet } = resolveOne(
      seed,
      state,
      { sequence: 0, actorInstanceId: 'a0', powerId, targetInstanceId: 'd0' },
      0n,
    );
    if (packet.crit) return seed;
  }

  throw new Error('no seed in 4,000 produced a crit — the search, not the ward, is broken');
}

describe('Turned Aside, spent through the resolver', () => {
  const base = battle();
  const powerId = autoPower(getHero(heroStateOf(base, 'a0').heroId).id);

  const strike = (state: BattleState, seed: ReturnType<typeof fixedSeed>) =>
    resolveOne(
      seed,
      state,
      { sequence: 0, actorInstanceId: 'a0', powerId, targetInstanceId: 'd0' },
      0n,
    );

  it('finds a crit at all — otherwise everything below is vacuous', () => {
    const seed = critSeed(base);
    expect(strike(base, seed).packet.crit).toBe(true);
  });

  /**
   * 🔴 **The guard.** Restoring the stale read in `resolveOne` leaves the ward
   * unmarked, and this goes red.
   */
  it('leaves the spent mark on the board, not overwritten by a stale read', () => {
    const seed = critSeed(base);
    const armed = warded(base, 'd0');
    const after = strike(armed, seed).state;

    expect(
      markCount(heroStateOf(after, 'd0'), 'd0', WARD_POWER_ID),
      'the charge was spent and the write was lost — the ward now refuses forever',
    ).toBe(1);
  });

  it('🔴 marks nobody without the rune — the control', () => {
    const seed = critSeed(base);
    const after = strike(base, seed).state;

    expect(markCount(heroStateOf(after, 'd0'), 'd0', WARD_POWER_ID)).toBe(0);
  });

  /**
   * 🔴 **The consequence, stated as damage rather than as a mark.**
   *
   * A crit refused lands for the ordinary number, so the warded defender takes
   * strictly less than the unwarded one from the same seed and the same blow. This
   * is the assertion a player would recognise; the mark above is how it is bounded.
   */
  it('takes an ordinary blow where an unwarded champion takes a critical one', () => {
    const seed = critSeed(base);

    const bare = strike(base, seed);
    const armed = strike(warded(base, 'd0'), seed);

    expect(armed.packet.crit, 'the packet still reports the roll').toBe(true);
    expect(armed.packet.damage, 'the ward turned it into an ordinary hit').toBeLessThan(
      bare.packet.damage,
    );
  });
});
