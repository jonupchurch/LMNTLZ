/**
 * Battle-state builders for the rules tests.
 *
 * **No mocks anywhere.** These build real states out of the real roster, which
 * is the whole reason the rules half is worth testing exhaustively: 27 heroes
 * and 9 types is a small enough world to enumerate rather than sample.
 */

import { getAllHeroes, getHero, type Hero } from '@lmntlz/content';
import type { BattleState, HeroState, Row, Side } from '../../rules/state.js';

export const ENGINE = 'e0.1.0-test';
export const CONTENT = 'c-test';

/** 2 front · 3 middle · 1 back, on the absolute axis. */
export const FORMATION: Readonly<Record<Side, readonly Row[]>> = Object.freeze({
  attacker: [3, 3, 2, 2, 2, 1],
  defender: [4, 4, 5, 5, 5, 6],
});

export function heroStateFor(
  hero: Hero,
  side: Side,
  row: Row,
  instanceId: string,
  patch: Partial<HeroState> = {},
): HeroState {
  const maxHp = hero.stats.toughness * 50;
  return {
    heroId: hero.id,
    instanceId,
    side,
    row,
    hp: maxHp,
    maxHp,
    accumulator: 0,
    cooldowns: {},
    statuses: [],
    statMods: {},
    reachMod: 0,
    ...patch,
  };
}

/** A squad of six in formation. Repeats the roster if given fewer than six ids. */
export function squad(side: Side, heroIds: readonly string[]): HeroState[] {
  const rows = FORMATION[side];
  return rows.map((row, i) =>
    heroStateFor(getHero(heroIds[i % heroIds.length]!), side, row, `${side}-${i}`),
  );
}

export function stateOf(heroes: readonly HeroState[], heroTurn = 1): BattleState {
  return {
    heroes,
    heroTurn,
    turnOfInstance: heroes[0]?.instanceId ?? null,
    engineVersion: ENGINE,
    contentVersion: CONTENT,
  };
}

/** Two full squads, six a side, everybody standing. */
export function fullBattle(
  attackerIds: readonly string[] = ['h01'],
  defenderIds: readonly string[] = ['h19'],
): BattleState {
  return stateOf([...squad('attacker', attackerIds), ...squad('defender', defenderIds)]);
}

/** One hero a side, both in the front line — the simplest state that resolves. */
export function duel(attackerHeroId: string, defenderHeroId: string): BattleState {
  return stateOf([
    heroStateFor(getHero(attackerHeroId), 'attacker', 3, 'a'),
    heroStateFor(getHero(defenderHeroId), 'defender', 4, 'd'),
  ]);
}

/** Every ordered pair of heroes, as a duel. 27 x 27 = 729. */
export function allPairings(): { attacker: Hero; defender: Hero; state: BattleState }[] {
  const heroes = getAllHeroes();
  const out: { attacker: Hero; defender: Hero; state: BattleState }[] = [];

  for (const attacker of heroes) {
    for (const defender of heroes) {
      out.push({ attacker, defender, state: duel(attacker.id, defender.id) });
    }
  }

  return out;
}

/** Replace one hero in a state, by instance id. */
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

/** Knock out every hero standing in the given rows. */
export function clearRows(state: BattleState, rows: readonly Row[]): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((h) => (rows.includes(h.row) ? { ...h, hp: 0 } : h)),
  };
}

export const percentile = (sorted: readonly number[], p: number): number => {
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index]!;
};
