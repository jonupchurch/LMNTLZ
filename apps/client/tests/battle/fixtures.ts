/** A board the battle screen can render, built from the real roster. */

import { getAllHeroes } from '@lmntlz/content';
import { HP_PER_TOUGHNESS } from '@lmntlz/sim/rules';
import type { BattleState, HeroState } from '@lmntlz/sim/rules';
import type { StartedBattle } from '../../src/features/battle/types.js';

const ROSTER = getAllHeroes().map((h) => h.id);

/** 2 front · 3 middle · 1 back on the shared 1–6 axis. */
const SEATS = [
  { row: 'front', index: 0 },
  { row: 'front', index: 1 },
  { row: 'middle', index: 0 },
  { row: 'middle', index: 1 },
  { row: 'middle', index: 2 },
  { row: 'back', index: 0 },
] as const;

const ROW_OF = {
  attacker: { front: 3, middle: 2, back: 1 },
  defender: { front: 4, middle: 5, back: 6 },
} as const;

function squad(side: 'attacker' | 'defender', heroIds: readonly string[]): HeroState[] {
  return SEATS.map((seat, i) => {
    const heroId = heroIds[i]!;
    const hp = getAllHeroes().find((h) => h.id === heroId)!.stats.toughness * HP_PER_TOUGHNESS;

    return {
      heroId,
      instanceId: `${side === 'attacker' ? 'a' : 'd'}-${seat.row}-${seat.index}`,
      side,
      row: ROW_OF[side][seat.row],
      hp,
      maxHp: hp,
      accumulator: side === 'attacker' && i === 0 ? 99 : 0,
      cooldowns: {},
      statuses: [],
      statMods: {},
      reachMod: 0,
    };
  });
}

export function board(turnOfInstance: string | null = 'a-front-0'): BattleState {
  return {
    heroes: [...squad('attacker', ROSTER.slice(0, 6)), ...squad('defender', ROSTER.slice(6, 12))],
    heroTurn: 1,
    turnOfInstance,
    engineVersion: 'e0.1.0-splitmix64',
    contentVersion: 'test',
  };
}

export function started(over: Partial<StartedBattle> = {}): StartedBattle {
  return {
    battleId: 'btl-test',
    zone: 'visible',
    ambushed: false,
    sequence: 0,
    packet: { events: [], state: board(), conclusion: null },
    ...over,
  };
}
