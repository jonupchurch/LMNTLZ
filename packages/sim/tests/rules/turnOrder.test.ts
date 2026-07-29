import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { TICK_BASE, afterTick, gainPerTick, turnQueue } from '../../rules/turnOrder.js';
import { heroStateFor, stateOf, withHero } from './fixtures.js';

/** Two heroes with nothing different about them but Speed. */
const speedDuel = (fast: number, slow: number) => {
  const hero = getHero('h01');
  const base = hero.stats.speed;
  return stateOf([
    { ...heroStateFor(hero, 'attacker', 3, 'fast'), statMods: { speed: fast - base } },
    { ...heroStateFor(hero, 'defender', 4, 'slow'), statMods: { speed: slow - base } },
  ]);
};

const actCounts = (state: ReturnType<typeof speedDuel>, turns: number) => {
  const queue = turnQueue(state, turns);
  return {
    fast: queue.filter((id) => id === 'fast').length,
    slow: queue.filter((id) => id === 'slow').length,
  };
};

/**
 * T017 — the ratios the design is built on (SC-007).
 *
 * `50 + Speed` per tick is what bounds the whole system. Without the base
 * constant the ratio would be Speed 45 / Speed 15 = 3×, and a Speed rune would
 * be the only rune anyone bought.
 */
describe('the bounded accumulator', () => {
  it('gains 50 + Speed per tick', () => {
    const state = speedDuel(45, 15);
    const fast = state.heroes.find((h) => h.instanceId === 'fast')!;
    const slow = state.heroes.find((h) => h.instanceId === 'slow')!;

    expect(gainPerTick(fast)).toBe(TICK_BASE + 45);
    expect(gainPerTick(slow)).toBe(TICK_BASE + 15);
  });

  it('gives Speed 45 about 1.46x the acts of Speed 15', () => {
    const { fast, slow } = actCounts(speedDuel(45, 15), 10_000);
    expect(fast / slow).toBeCloseTo(1.46, 2);
  });

  it('gives Speed 75 about 1.92x the acts of Speed 15 — the geared ceiling', () => {
    const { fast, slow } = actCounts(speedDuel(75, 15), 10_000);
    expect(fast / slow).toBeCloseTo(1.92, 2);
  });

  it('bounds the reachable Speed range inside 2x', () => {
    // Stated over the range that actually exists: the slowest authored hero
    // against a fully geared 75. Speed 0 is not reachable and the ratio there
    // IS above 2 (125/50 = 2.5) — the bound is a claim about the roster, not
    // about the formula in the abstract.
    const speeds = getAllHeroes().map((h) => h.stats.speed);
    const slowest = Math.min(...speeds);

    expect(slowest).toBeGreaterThan(0);

    const { fast, slow } = actCounts(speedDuel(75, slowest), 10_000);
    expect(fast / slow).toBeLessThan(2.0);
  });

  it('records the roster’s authored Speed range', () => {
    // If this moves, the 1.46x and 1.92x figures above need re-deriving.
    const speeds = getAllHeroes().map((h) => h.stats.speed);
    expect(Math.min(...speeds)).toBe(15);
    expect(Math.max(...speeds)).toBe(45);
  });

  /**
   * FR-013 — **drain in a loop, never test once.**
   *
   * A Speed 75 hero gains 125 per tick, so two ticks put it at 250: that is two
   * actions owed, not one. An implementation that subtracted 100 once per tick
   * would cap everyone at one action per tick and silently delete the top of the
   * Speed curve.
   */
  it('lets a Speed 75 hero act twice before a Speed 15 hero acts once', () => {
    const state = withHero(speedDuel(75, 15), 'slow', { accumulator: 0 });
    const queue = turnQueue(state, 3);

    const firstSlow = queue.indexOf('slow');
    const fastBeforeSlow = queue.slice(0, firstSlow === -1 ? queue.length : firstSlow).length;

    expect(fastBeforeSlow).toBeGreaterThanOrEqual(2);
  });

  it('reports multiple owed actions from a single tick', () => {
    const hero = getHero('h01');
    const state = stateOf([
      {
        ...heroStateFor(hero, 'attacker', 3, 'x'),
        statMods: { speed: 75 - hero.stats.speed },
        accumulator: 95,
      },
    ]);

    // 95 + 125 = 220 -> two actions, 20 left over.
    const { acts, accumulator } = afterTick(state.heroes[0]!);
    expect(acts).toBe(2);
    expect(accumulator).toBe(20);
  });
});

describe('the projected queue', () => {
  it('returns exactly the requested lookahead', () => {
    for (const n of [1, 5, 20, 100]) {
      expect(turnQueue(speedDuel(45, 15), n)).toHaveLength(n);
    }
  });

  it('returns nothing for a non-positive lookahead', () => {
    expect(turnQueue(speedDuel(45, 15), 0)).toEqual([]);
    expect(turnQueue(speedDuel(45, 15), -3)).toEqual([]);
  });

  it('is deterministic — the same state projects the same queue every time', () => {
    const state = speedDuel(45, 15);
    const first = turnQueue(state, 50);
    for (let i = 0; i < 20; i++) {
      expect(turnQueue(state, 50)).toEqual(first);
    }
  });

  it('never queues a fallen hero', () => {
    const state = withHero(speedDuel(45, 15), 'slow', { hp: 0 });
    expect(turnQueue(state, 20).every((id) => id === 'fast')).toBe(true);
  });

  it('applies Speed modifications as flat points', () => {
    // FR-015 — a percentage would hand the fastest hero the largest absolute
    // gain, which is the opposite of what a buff of a fixed size should do.
    const slowBuffed = actCounts(speedDuel(25, 15), 10_000);
    const fastBuffed = actCounts(speedDuel(75, 65), 10_000);

    // +10 Speed is worth the same number of extra ticks either way, so the
    // RATIO shrinks as the pair gets faster rather than staying constant.
    expect(slowBuffed.fast / slowBuffed.slow).toBeGreaterThan(
      fastBuffed.fast / fastBuffed.slow,
    );
  });
});
