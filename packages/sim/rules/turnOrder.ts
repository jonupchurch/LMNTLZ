/**
 * Turn order — a bounded accumulator (FR-012 … FR-015).
 *
 * Every standing hero gains `50 + Speed` per tick and acts at 100. The base
 * constant is what bounds the whole system: Speed 45 acts **1.46×** as often as
 * Speed 15, and the geared ceiling at Speed 75 is **1.92×**. Without the 50 the
 * ratio would be Speed 45 / Speed 15 = 3×, and a speed rune would be the only
 * rune anyone bought.
 */

import { getHero } from '@lmntlz/content';
import {
  effectiveStat,
  isStanding,
  type BattleState,
  type HeroState,
} from './state.js';

/** The constant that normalizes Speed. Changing it changes the whole game. */
export const TICK_BASE = 50;
export const ACT_THRESHOLD = 100;

export function speedOf(hero: HeroState): number {
  return effectiveStat(hero, getHero(hero.heroId).stats, 'speed');
}

export function gainPerTick(hero: HeroState): number {
  return TICK_BASE + speedOf(hero);
}

/**
 * **Drain the accumulator in a loop, never test it once** (FR-013).
 *
 * A hero at Speed 75 gains 125 per tick, so it crosses 100 with 25 left over —
 * and after two ticks it is at 150, which is *two* actions owed, not one. An
 * implementation that subtracted 100 once per tick would silently cap every hero
 * at one action per tick and delete the top half of the Speed curve.
 *
 * Ties break on the higher accumulator, then on board order, so the result is
 * total and deterministic.
 */
function drain(accumulator: number): { acts: number; remainder: number } {
  const acts = Math.floor(accumulator / ACT_THRESHOLD);
  return { acts, remainder: accumulator - acts * ACT_THRESHOLD };
}

interface Pending {
  readonly instanceId: string;
  readonly accumulator: number;
  readonly order: number;
}

/**
 * The projected order of the next `lookahead` hero-turns (FR-014).
 *
 * **Ticks stay internal.** A player sees a queue of names; they never see an
 * accumulator, and no part of the client needs to know one exists.
 */
export function turnQueue(state: BattleState, lookahead: number): readonly string[] {
  if (lookahead <= 0) return [];

  const live: Pending[] = state.heroes
    .filter(isStanding)
    .map((h, order) => ({ instanceId: h.instanceId, accumulator: h.accumulator, order }));

  if (live.length === 0) return [];

  const gains = new Map(
    state.heroes.filter(isStanding).map((h) => [h.instanceId, gainPerTick(h)]),
  );

  const queue: string[] = [];
  const current = new Map(live.map((p) => [p.instanceId, p.accumulator]));
  const orderOf = new Map(live.map((p) => [p.instanceId, p.order]));

  // A hard bound so a pathological state cannot spin. Every tick advances every
  // hero by at least TICK_BASE, so this is far more than enough.
  const maxTicks = lookahead * 4 + 16;

  for (let tick = 0; tick < maxTicks && queue.length < lookahead; tick++) {
    for (const id of current.keys()) {
      current.set(id, current.get(id)! + gains.get(id)!);
    }

    const ready = [...current.entries()]
      .map(([instanceId, accumulator]) => ({ instanceId, ...drain(accumulator) }))
      .filter((r) => r.acts > 0)
      .sort(
        (a, b) =>
          b.acts - a.acts ||
          current.get(b.instanceId)! - current.get(a.instanceId)! ||
          orderOf.get(a.instanceId)! - orderOf.get(b.instanceId)!,
      );

    for (const r of ready) {
      for (let n = 0; n < r.acts && queue.length < lookahead; n++) {
        queue.push(r.instanceId);
      }
      current.set(r.instanceId, r.remainder);
    }
  }

  return queue;
}

/** The accumulator after one tick, for a caller stepping the battle forward. */
export function afterTick(hero: HeroState): { acts: number; accumulator: number } {
  const { acts, remainder } = drain(hero.accumulator + gainPerTick(hero));
  return { acts, accumulator: remainder };
}
