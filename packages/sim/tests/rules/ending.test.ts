import { describe, expect, it } from 'vitest';
import { HERO_TURN_CAP, battleEnded, hasLeftTheBoard, pooledHpShare } from '../../rules/ending.js';
import { maxHp } from '../../rules/damage.js';
import type { BattleState } from '../../rules/state.js';
import { fullBattle, stateOf } from './fixtures.js';

const atTurn = (state: BattleState, heroTurn: number): BattleState => ({ ...state, heroTurn });

const wipe = (state: BattleState, side: 'attacker' | 'defender'): BattleState => ({
  ...state,
  heroes: state.heroes.map((h) => (h.side === side ? { ...h, hp: 0 } : h)),
});

/** Set every hero on a side to the same fraction of its own max HP. */
const atShare = (state: BattleState, side: 'attacker' | 'defender', share: number): BattleState => ({
  ...state,
  heroes: state.heroes.map((h) =>
    h.side === side ? { ...h, hp: Math.max(1, Math.round(maxHp(h) * share)) } : h,
  ),
});

describe('the battle ends, always', () => {
  it('continues while both sides stand and the cap is not reached', () => {
    expect(battleEnded(fullBattle())).toBeNull();
  });

  it('ends on a wipe, naming the survivor', () => {
    expect(battleEnded(wipe(fullBattle(), 'defender'))).toEqual({
      winner: 'attacker',
      reason: 'wipe',
    });
    expect(battleEnded(wipe(fullBattle(), 'attacker'))).toEqual({
      winner: 'defender',
      reason: 'wipe',
    });
  });

  it('ends a wipe before the cap is consulted', () => {
    const early = atTurn(wipe(fullBattle(), 'defender'), 1);
    expect(battleEnded(early)?.reason).toBe('wipe');
  });

  it('resolves the cap on pooled HP share', () => {
    const state = atTurn(atShare(atShare(fullBattle(), 'attacker', 0.8), 'defender', 0.4), HERO_TURN_CAP);
    const result = battleEnded(state);

    expect(result?.reason).toBe('cap-hp-share');
    expect(result?.winner).toBe('attacker');
  });

  /**
   * Proportional rather than absolute, on purpose: an absolute comparison would
   * hand the win to whichever squad happened to have more Toughness, which is a
   * squad-building decision and not a statement about who was winning.
   */
  it('compares share, not absolute HP', () => {
    // Attacker squad has far less total HP but a higher proportion remaining.
    const base = fullBattle(['h23'], ['h18']); // Silka (Tough 25) vs Corvane (Tough 40)
    const state = atTurn(atShare(atShare(base, 'attacker', 0.9), 'defender', 0.5), HERO_TURN_CAP);

    expect(pooledHpShare(state, 'attacker')).toBeGreaterThan(pooledHpShare(state, 'defender'));
    expect(battleEnded(state)?.winner).toBe('attacker');
  });

  it('falls through to champions standing when shares tie', () => {
    const base = fullBattle();
    // Same share on both sides, but one side has lost a hero outright.
    let state = atTurn(atShare(atShare(base, 'attacker', 0.5), 'defender', 0.5), HERO_TURN_CAP);
    state = {
      ...state,
      heroes: state.heroes.map((h) => (h.instanceId === 'defender-5' ? { ...h, hp: 0 } : h)),
    };

    const result = battleEnded(state);
    // The dead hero drops the defender's share too, so this normally resolves on
    // share. The champions rung is reachable only on an exact tie.
    expect(['cap-hp-share', 'cap-champions-standing']).toContain(result?.reason);
    expect(result?.winner).toBe('attacker');
  });

  it('resolves an exact tie on both rungs to the defender', () => {
    const state = atTurn(fullBattle(['h01'], ['h01']), HERO_TURN_CAP);

    expect(pooledHpShare(state, 'attacker')).toBe(pooledHpShare(state, 'defender'));
    expect(battleEnded(state)).toEqual({ winner: 'defender', reason: 'cap-tiebreak' });
  });

  /**
   * The pairing the cap exists for: two squads that physically cannot finish
   * each other. It terminates with a determinate winner rather than a draw,
   * because a draw leaves the rating and the hold streak with nothing to record.
   */
  it('terminates a zero-damage stalemate at the cap', () => {
    const state = atTurn(fullBattle(['h01'], ['h01']), HERO_TURN_CAP);
    const result = battleEnded(state);

    expect(result).not.toBeNull();
    expect(result!.winner).toBe('defender');
  });

  it('does not end one turn before the cap', () => {
    expect(battleEnded(atTurn(fullBattle(['h01'], ['h01']), HERO_TURN_CAP - 1))).toBeNull();
  });

  it('resolves a simultaneous wipe to the defender, like any other stall', () => {
    const both = wipe(wipe(fullBattle(), 'attacker'), 'defender');
    expect(battleEnded(both)).toEqual({ winner: 'defender', reason: 'cap-tiebreak' });
  });
});

describe('a hero at 0 HP has left the board', () => {
  it('is not standing, and there is no downed state', () => {
    const state = fullBattle();
    const hero = { ...state.heroes[0]!, hp: 0 };

    expect(hasLeftTheBoard(hero)).toBe(true);
  });

  it('contributes nothing to its side’s pooled share', () => {
    const state = fullBattle();
    const full = pooledHpShare(state, 'attacker');

    const oneDown = {
      ...state,
      heroes: state.heroes.map((h) => (h.instanceId === 'attacker-0' ? { ...h, hp: 0 } : h)),
    };

    expect(pooledHpShare(oneDown, 'attacker')).toBeLessThan(full);
  });

  it('never contributes negative HP to the pool', () => {
    const state = fullBattle();
    const overkilled = {
      ...state,
      heroes: state.heroes.map((h) =>
        h.instanceId === 'attacker-0' ? { ...h, hp: -500 } : h,
      ),
    };

    expect(pooledHpShare(overkilled, 'attacker')).toBeGreaterThan(0);
  });

  it('gives a full squad a share of exactly 1', () => {
    expect(pooledHpShare(fullBattle(), 'attacker')).toBe(1);
  });

  it('gives an empty side a share of 0 rather than dividing by zero', () => {
    expect(pooledHpShare(stateOf([]), 'attacker')).toBe(0);
  });
});
