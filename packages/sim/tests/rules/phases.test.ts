import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import {
  EFFECT_ORDER,
  PHASE_ORDER,
  availablePowers,
  cooldownsAfterResolution,
  gateTurnFor,
  isIncapacitated,
  phasesFor,
} from '../../rules/phases.js';
import { duel, stateOf, withHero } from './fixtures.js';

const stunned = (turns = 2) => ({
  kind: 'stun',
  turnsRemaining: turns,
  potency: 10,
  sourceInstanceId: 'd',
});

describe('the five-phase turn', () => {
  it('runs Upkeep, Attack, Defense, Additional effects, Resolution in that order', () => {
    expect(PHASE_ORDER).toEqual(['upkeep', 'attack', 'defense', 'effects', 'resolution']);
  });

  it('runs all five for an unimpeded hero', () => {
    const hero = duel('h01', 'h19').heroes[0]!;
    expect(phasesFor(hero)).toEqual(PHASE_ORDER);
  });

  /**
   * **The case FR-025 exists for.**
   *
   * A hero that loses its turn to crowd control skips 2–4 and **still reaches
   * Resolution**, so its cooldowns still tick. Skipping Resolution as well would
   * make a one-turn stun quietly cost two — the stun turn, plus a turn of the
   * cooldown it did not pay down.
   */
  it('skips phases 2-4 for a stunned hero but never phase 5', () => {
    const state = withHero(duel('h01', 'h19'), 'a', { statuses: [stunned()] });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;

    expect(isIncapacitated(hero)).toBe(true);
    expect(phasesFor(hero)).toEqual(['upkeep', 'resolution']);
    expect(phasesFor(hero)).toContain('resolution');
  });

  it('ticks cooldowns for a stunned hero exactly as for an active one', () => {
    const powers = getHero('h01').powers;
    const cooldowns = { [powers[1]!.id]: 2, [powers[2]!.id]: 1 };

    const active = withHero(duel('h01', 'h19'), 'a', { cooldowns });
    const stunnedState = withHero(active, 'a', { statuses: [stunned()] });

    expect(cooldownsAfterResolution(stunnedState, 'a')).toEqual(
      cooldownsAfterResolution(active, 'a'),
    );
  });

  it('drops a cooldown that reaches zero rather than keeping it at 0', () => {
    const powers = getHero('h01').powers;
    const state = withHero(duel('h01', 'h19'), 'a', { cooldowns: { [powers[1]!.id]: 1 } });

    expect(cooldownsAfterResolution(state, 'a')).toEqual({});
  });

  it('ends the turn at Upkeep when the hero dies there — the only early exit', () => {
    const hero = duel('h01', 'h19').heroes[0]!;
    expect(phasesFor(hero, { diesInUpkeep: true })).toEqual(['upkeep']);
  });

  it('skips Defense for a power that deals neither damage nor healing', () => {
    const cirrolan = getHero('h05');
    const whisper = cirrolan.powers.find((p) => p.multiplier === null)!;
    const hero = duel('h05', 'h19').heroes[0]!;

    expect(phasesFor(hero, { power: whisper })).toEqual([
      'upkeep',
      'attack',
      'effects',
      'resolution',
    ]);
  });
});

describe('additional effects run in a fixed order', () => {
  it('resolves riders, triggers, reactions, self-effects, then a second death check', () => {
    expect(EFFECT_ORDER).toEqual([
      'riders',
      'on-hit-triggers',
      'reactions',
      'attacker-self-effects',
      'second-death-check',
    ]);
  });

  it('places reactions before the attacker’s self-effects', () => {
    // Every one of these can kill, and the order decides who is standing to act.
    expect(EFFECT_ORDER.indexOf('reactions')).toBeLessThan(
      EFFECT_ORDER.indexOf('attacker-self-effects'),
    );
  });

  it('ends with a death check, so nothing acts after it should have fallen', () => {
    expect(EFFECT_ORDER[EFFECT_ORDER.length - 1]).toBe('second-death-check');
  });

  it('contains reactions exactly once — a reaction cannot trigger a reaction', () => {
    // What bounds the phase. Two reaction steps would be an unbounded chain.
    expect(EFFECT_ORDER.filter((s) => s === 'reactions')).toHaveLength(1);
  });
});

describe('power gates', () => {
  it('opens tier 4 at turn 3 and tier 5 at turn 5', () => {
    expect(gateTurnFor(4)).toBe(3);
    expect(gateTurnFor(5)).toBe(5);
    for (const tier of [0, 1, 2, 3]) expect(gateTurnFor(tier)).toBe(1);
  });

  it('agrees with the gateTurn content already carries', () => {
    for (const power of getHero('h01').powers) {
      expect(gateTurnFor(power.tier)).toBe(power.gateTurn);
    }
  });

  it('withholds the top two tiers on turn 1', () => {
    const state = stateOf(duel('h01', 'h19').heroes, 1);
    const tiers = availablePowers(state, 'a').map((p) => p.tier);

    expect(tiers).toEqual([0, 1, 2, 3]);
  });

  it('opens tier 4 on turn 3 and tier 5 on turn 5', () => {
    const at3 = stateOf(duel('h01', 'h19').heroes, 3);
    expect(availablePowers(at3, 'a').map((p) => p.tier)).toEqual([0, 1, 2, 3, 4]);

    const at5 = stateOf(duel('h01', 'h19').heroes, 5);
    expect(availablePowers(at5, 'a').map((p) => p.tier)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('withholds a power that is off gate but on cooldown', () => {
    const powers = getHero('h01').powers;
    const state = stateOf(
      withHero(duel('h01', 'h19'), 'a', { cooldowns: { [powers[1]!.id]: 2 } }).heroes,
      5,
    );

    expect(availablePowers(state, 'a').map((p) => p.id)).not.toContain(powers[1]!.id);
  });
});
