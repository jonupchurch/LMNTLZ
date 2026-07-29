/**
 * Board builders for the defense-AI tests.
 *
 * **No mocks.** Real heroes, real rows, real cooldown ladders — the roster is 27
 * heroes and the board is six rows, which is small enough to enumerate rather
 * than stub. A mocked hero here would be a hero whose cooldowns nobody checked.
 */

import { getAllHeroes, getHero, type Hero, type Role } from '@lmntlz/content';
import type { BattleState, HeroState, Row, Side } from '../../rules/state.js';
import { restoreSeed, type Seed } from '../../resolver/seed.js';
import type { SquadMemberConfig } from '../../ai/types.js';

export const FORMATION: Readonly<Record<Side, readonly Row[]>> = Object.freeze({
  attacker: [3, 3, 2, 2, 2, 1],
  defender: [4, 4, 5, 5, 5, 6],
});

/** A fixed seed, so every expectation here is reproducible by hand. */
export function fixedSeed(n = 0x0123456789abcdefn): Seed {
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) bytes[i] = Number((n >> BigInt((7 - i) * 8)) & 0xffn);
  return restoreSeed(bytes);
}

export function heroState(
  heroId: string,
  side: Side,
  row: Row,
  instanceId: string,
  patch: Partial<HeroState> = {},
): HeroState {
  const hp = getHero(heroId).stats.toughness * 50;
  return {
    heroId,
    instanceId,
    side,
    row,
    hp,
    maxHp: hp,
    accumulator: 0,
    cooldowns: {},
    statuses: [],
    statMods: {},
    reachMod: 0,
    ...patch,
  };
}

/**
 * Two squads in formation. The **defender** is the side the engine plays, which
 * is the whole feature — a defense squad is never the one a player commands.
 */
export function board(
  attackerIds: readonly string[] = ['h01'],
  defenderIds: readonly string[] = ['h19'],
  heroTurn = 1,
): BattleState {
  const heroes = [
    ...FORMATION.attacker.map((row, i) =>
      heroState(attackerIds[i % attackerIds.length]!, 'attacker', row, `a${i}`),
    ),
    ...FORMATION.defender.map((row, i) =>
      heroState(defenderIds[i % defenderIds.length]!, 'defender', row, `d${i}`),
    ),
  ];

  return {
    heroes,
    heroTurn,
    turnOfInstance: 'd0',
    engineVersion: 'e0.1.0-test',
    contentVersion: 'c-test',
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

export function atTurn(state: BattleState, heroTurn: number): BattleState {
  return { ...state, heroTurn };
}

/** Knock out every hero standing in the given rows. */
export function clearRows(state: BattleState, rows: readonly Row[]): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((h) => (rows.includes(h.row) ? { ...h, hp: 0 } : h)),
  };
}

/** A config with everything spelled out, for tests that vary one field. */
export function config(patch: Partial<SquadMemberConfig> = {}): SquadMemberConfig {
  return {
    targeting: ['lowest-current-hp', 'nearest'],
    ranking: [5, 4, 3, 2, 1, 0],
    ...patch,
  };
}

export const powerOfTier = (heroId: string, tier: number): string =>
  getHero(heroId).powers.find((p) => p.tier === tier)!.id;

export const firstOfRole = (role: Role): Hero => getAllHeroes().find((h) => h.role === role)!;

/** Serialise anything, including BigInt, stably — `toEqual` is too weak for a
 *  determinism claim, passing on Sets that iterate differently. */
export const bytes = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v));
