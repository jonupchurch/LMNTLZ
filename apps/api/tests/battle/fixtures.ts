/**
 * Boards for the battle suite.
 *
 * **Built through `buildInitialState`, not hand-assembled.** A fixture that
 * constructs `HeroState` objects directly would let the tests pass while the
 * function every real battle goes through was wrong — the formation mapping,
 * the HP derivation and the opening `heroTurn` would all be untested and would
 * all look fine.
 */

import { getAllHeroes, getHero } from '@lmntlz/content';
import type { BattleState, HeroState, StatusInstance } from '@lmntlz/sim/rules';
import { buildInitialState, type SnapshotSeat } from '../../src/battle/board.js';

export const ROSTER: readonly string[] = getAllHeroes().map((h) => h.id);

/**
 * **Reach belongs to the hero**, so any test about rows and distance has to
 * name the reach it depends on. A mixed squad silently mixes two rules, and
 * the test then passes or fails on which champion happened to land in a seat.
 */
export const withReach = (reach: 1 | 2): readonly string[] =>
  getAllHeroes()
    .filter((h) => h.reach === reach)
    .map((h) => h.id);

export const REACH_1: string = withReach(1)[0]!;
export const REACH_2: string = withReach(2)[0]!;

/** 2 front · 3 middle · 1 back, filled from a list of six hero ids. */
export function squad(heroIds: readonly string[]): SnapshotSeat[] {
  if (heroIds.length !== 6) throw new Error('a squad is six heroes');
  return [
    { row: 'front', index: 0, heroId: heroIds[0]! },
    { row: 'front', index: 1, heroId: heroIds[1]! },
    { row: 'middle', index: 0, heroId: heroIds[2]! },
    { row: 'middle', index: 1, heroId: heroIds[3]! },
    { row: 'middle', index: 2, heroId: heroIds[4]! },
    { row: 'back', index: 0, heroId: heroIds[5]! },
  ];
}

/** Six of the same champion, so a test can reason about one power list. */
export const sixOf = (heroId: string): SnapshotSeat[] => squad(Array<string>(6).fill(heroId));

export function board(
  attackerIds: readonly string[] = ROSTER.slice(0, 6),
  defenderIds: readonly string[] = ROSTER.slice(6, 12),
): BattleState {
  return buildInitialState(squad(attackerIds), squad(defenderIds), {
    engineVersion: 'e-test',
    contentVersion: 'c-test',
  });
}

/** Replace one hero on the board. Returns a new state; nothing is mutated. */
/**
 * One status instance with every field defaulted (020).
 *
 * **A builder rather than object literals**, because `StatusInstance` gained four
 * fields when the status layer was implemented and every test that spelled the
 * shape out by hand had to be edited. The ones that came through here did not.
 */
export function status(
  kind: StatusInstance['kind'],
  patch: Partial<StatusInstance> = {},
): StatusInstance {
  return {
    kind,
    turnsRemaining: 1,
    magnitude: 0,
    stat: null,
    sourceInstanceId: 'd-front-0',
    sourcePowerId: 'test-power',
    escalation: 0,
    ticksDealt: 0,
    cleansable: true,
    ...patch,
  };
}

export function withHero(
  state: BattleState,
  instanceId: string,
  patch: Partial<HeroState>,
): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((h) => (h.instanceId === instanceId ? { ...h, ...patch } : h)),
  };
}

/** Remove heroes from the board by taking them to 0 HP (FR-029: they leave it). */
export function fell(state: BattleState, ...instanceIds: readonly string[]): BattleState {
  return instanceIds.reduce((s, id) => withHero(s, id, { hp: 0 }), state);
}

/** Put every power of a hero on cooldown except the ones named. */
export function onlyPowers(
  state: BattleState,
  instanceId: string,
  keep: readonly string[],
): BattleState {
  const hero = state.heroes.find((h) => h.instanceId === instanceId);
  if (!hero) throw new Error(`no instance ${instanceId}`);

  const cooldowns: Record<string, number> = {};
  for (const power of getHero(hero.heroId).powers) {
    if (!keep.includes(power.id)) cooldowns[power.id] = 99;
  }
  return withHero(state, instanceId, { cooldowns });
}

/** Every power of a champion, tier-ascending. */
export const powersOf = (heroId: string) => getHero(heroId).powers;

/** The tier-0 auto attack — always available, never gated, never on cooldown. */
export const autoPowerOf = (heroId: string): string =>
  getHero(heroId).powers.find((p) => p.tier === 0)!.id;
