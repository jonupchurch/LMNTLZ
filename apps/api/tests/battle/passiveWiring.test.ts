/**
 * ⭐ **T041 — the wiring, and it is the task that matters most.**
 *
 * `packages/sim` owns what a passive *does*; this file asserts that the API's turn
 * loop actually *invokes* it. Those are different claims, and this project has
 * shipped the gap between them before: `legalTargets` accepted taunt and fade
 * filters for four features while `resolveOne` passed three arguments of five.
 * 393 tests passed the whole time.
 *
 * Four of US3's hooks fire nowhere else. `onUpkeep`, `onAct` and the cooldown
 * penalty are called **only** from `turnLoop.ts`, and `lethalGuard` has a second
 * doorway here that `resolveOne` cannot see. A unit test in `packages/sim` proves
 * every one of them correct and none of them reachable.
 *
 * > **The tell is a hook with no caller.** Each test below drives the real turn
 * > loop and reads the board, rather than calling the rule directly.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { PASSIVE_MAGNITUDES, heroStateOf, inReach, maxHp } from '@lmntlz/sim/rules';
import { applyResolution, applyUpkeep } from '../../src/battle/turnLoop.js';
import { ROSTER, board, withHero } from './fixtures.js';

const M = PASSIVE_MAGNITUDES;

/** Whichever hero carries a given unique, in the attacker's front seat. */
const BRAMWEN = 'h01'; // The Long Patience — onUpkeep
const ZEPHYRINE = 'h04'; // Out of Reach — onAct
const LUCEN = 'h14'; // Nothing Casts Twice — cooldownPenalty
const AURIEL = 'h15'; // Still Burning — lethalGuard, upkeep doorway

/** A board whose attacker front seat is the named hero. */
const leading = (heroId: string, defenders?: readonly string[]) =>
  board([heroId, 'h19', 'h20', 'h21', 'h22', 'h23'], defenders ?? ['h07', 'h08', 'h09', 'h10', 'h11', 'h12']);

const SEAT = 'a-front-0';

const mightPoints = (state: ReturnType<typeof board>, id: string): number =>
  heroStateOf(state, id)
    .statuses.filter((s) => s.kind === 'buff' && s.stat === 'might')
    .reduce((sum, s) => sum + s.magnitude, 0);

describe('Upkeep invokes the passive tick', () => {
  /**
   * 🔴 **The early return was the trap.** `applyUpkeep` skipped everything when a
   * hero had no damage-over-time effect and no statuses — which is exactly the
   * turn `The Long Patience` is supposed to grow on. A hook called after that
   * guard would fire only for champions who were already burning.
   */
  it('grows The Long Patience on a turn where nothing else happens', () => {
    const state = leading(BRAMWEN);
    expect(mightPoints(state, SEAT)).toBe(0);

    const { state: after } = applyUpkeep(state, SEAT);
    expect(mightPoints(after, SEAT)).toBe(M.longPatienceStep);
  });

  it('leaves a champion without the passive exactly as it found it', () => {
    const state = leading('h19');
    const { state: after } = applyUpkeep(state, SEAT);

    expect(heroStateOf(after, SEAT).statuses).toEqual([]);
  });
});

describe('Resolution invokes the end-of-turn passive', () => {
  /**
   * 🔴 **Order, and it is the whole passive.** A one-turn grant written before
   * `tickDurations` is counted down by the same Resolution that created it and
   * never exists. This asserts it survives its own turn.
   */
  it('grants Out of Reach a row that outlives the tick that created it', () => {
    const state = leading(ZEPHYRINE);
    const after = applyResolution(state, SEAT, null);

    const granted = heroStateOf(after, SEAT).statuses.filter((s) => s.kind === 'reach');
    expect(granted, 'the reach grant did not survive its own Resolution').toHaveLength(1);
    expect(granted[0]!.magnitude).toBe(M.outOfReachRows);
  });

  it('actually widens what the hero can touch', () => {
    /* Zephyrine is reach 1. In the front seat, row 5 is two occupied rows away. */
    const state = leading(ZEPHYRINE);
    expect(inReach(state, SEAT, 5)).toBe(false);

    const after = applyResolution(state, SEAT, null);
    expect(inReach(after, SEAT, 5)).toBe(true);
  });
});

describe('Resolution invokes the cooldown penalty', () => {
  /**
   * Lucen sits on the **defending** side, so the attacker's cooldown is the one
   * he taxes. The control is the same board with him replaced.
   */
  const power = getHero('h19').powers.find((p) => p.cooldown > 0)!;

  it('lengthens the cooldown an enemy just started', () => {
    const withLucen = board(['h19', 'h20', 'h21', 'h22', 'h23', 'h24'], [
      LUCEN,
      'h07',
      'h08',
      'h09',
      'h10',
      'h11',
    ]);
    const after = applyResolution(withLucen, SEAT, power.id);

    expect(heroStateOf(after, SEAT).cooldowns[power.id]).toBe(
      power.cooldown + M.nothingCastsTwiceTurns,
    );
  });

  it('leaves it alone with no Lucen on the board', () => {
    const without = board(['h19', 'h20', 'h21', 'h22', 'h23', 'h24'], [
      'h13',
      'h07',
      'h08',
      'h09',
      'h10',
      'h11',
    ]);
    const after = applyResolution(without, SEAT, power.id);

    expect(heroStateOf(after, SEAT).cooldowns[power.id]).toBe(power.cooldown);
  });
});

describe('Upkeep is the second doorway a death can come through', () => {
  /**
   * 🔴 **A burn kills, and `Still Burning` has to see it.**
   *
   * `resolveOne` guards the killing blow. If that were the only call site, Auriel
   * would refuse a sword and not a poison — a passive silently conditional on
   * *how* she died, which is the kind of gap that reads as a balance complaint
   * rather than a bug.
   */
  const lethalBurn = (state: ReturnType<typeof board>, id: string) => {
    const hero = heroStateOf(state, id);
    return withHero(state, id, {
      hp: 5,
      statuses: [
        {
          kind: 'burn' as const,
          turnsRemaining: 3,
          magnitude: 999,
          stat: null,
          sourceInstanceId: 'd-front-0',
          sourcePowerId: 'test',
          escalation: 0,
          ticksDealt: 0,
          cleansable: true,
        },
      ],
      maxHp: maxHp(hero),
    });
  };

  it('refuses a lethal tick once', () => {
    const state = lethalBurn(leading(AURIEL), SEAT);
    const { state: after, died } = applyUpkeep(state, SEAT);

    expect(died, 'Still Burning did not reach the Upkeep doorway').toBe(false);
    expect(heroStateOf(after, SEAT).hp).toBe(1);
  });

  it('lets the second one through', () => {
    const state = lethalBurn(leading(AURIEL), SEAT);
    const first = applyUpkeep(state, SEAT).state;

    /* Back to a survivable pool, then burned again — the guard is already spent. */
    const second = applyUpkeep(withHero(first, SEAT, { hp: 5 }), SEAT);

    expect(second.died).toBe(true);
    expect(heroStateOf(second.state, SEAT).hp).toBe(0);
  });

  it('lets a champion without the passive fall the first time', () => {
    const state = lethalBurn(leading('h19'), SEAT);
    const { died } = applyUpkeep(state, SEAT);

    expect(died).toBe(true);
  });
});

/**
 * 🔴 **A squad of six is what a battle actually runs**, and the seats above are
 * hand-picked. This walks the whole roster through one Upkeep and one Resolution
 * to prove no passive throws when it meets a real board.
 *
 * It is not a claim about correctness — the per-passive suites in `packages/sim`
 * are that. It is a claim that every one of the 27 is *reachable* from the API's
 * turn loop, which is the half a unit test cannot see.
 */
describe('⭐ every champion survives a real turn', () => {
  it('runs Upkeep and Resolution for all 27 without throwing', () => {
    expect(ROSTER).toHaveLength(27);

    for (const heroId of ROSTER) {
      const others = ROSTER.filter((id) => id !== heroId).slice(0, 5);
      const state = board([heroId, ...others]);
      expect(() => {
        const upkept = applyUpkeep(state, SEAT).state;
        applyResolution(upkept, SEAT, null);
      }, `${heroId} threw during a turn`).not.toThrow();
    }
  });
});
