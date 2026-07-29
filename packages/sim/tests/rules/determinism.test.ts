import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import {
  availablePowers,
  battleEnded,
  critChance,
  damagePreview,
  distance,
  healPreview,
  hitProbability,
  legalTargets,
  mustPass,
  pooledHpShare,
  riderLandProbability,
  turnQueue,
} from '../../rules/index.js';
import { fullBattle } from './fixtures.js';

/**
 * T008 — SC-003. The same state, a thousand times, **byte-identical**.
 *
 * This is not a restatement of "the functions are pure". It is the guard against
 * the three ways a pure-looking function stops being deterministic: a cache
 * keyed on object identity, a memo that survives between calls, and `Set` or
 * `Map` iteration order leaking into a result.
 *
 * `toEqual` would miss the third. `JSON.stringify` catches key order too, which
 * matters the moment any of this is hashed or compared as a string.
 */
describe('every exported function is byte-identical across 1,000 evaluations', () => {
  const state = fullBattle(['h01'], ['h19']);
  const attacker = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;
  const defender = state.heroes.find((h) => h.side === 'defender' && h.row === 4)!;
  const power = getHero(attacker.heroId).powers[1]!;

  const ITERATIONS = 1_000;

  const stable = (label: string, fn: () => unknown): void => {
    it(label, () => {
      const first = JSON.stringify(fn() ?? null);
      for (let i = 0; i < ITERATIONS; i++) {
        expect(JSON.stringify(fn() ?? null), `iteration ${i}`).toBe(first);
      }
    });
  };

  stable('hitProbability', () => hitProbability(state, attacker.instanceId, defender.instanceId));
  stable('riderLandProbability', () =>
    riderLandProbability(state, attacker.instanceId, defender.instanceId, 30),
  );
  stable('critChance', () => critChance(state, attacker.instanceId));
  stable('distance', () => distance(state, 1, 6));
  stable('turnQueue', () => turnQueue(state, 40));
  stable('damagePreview', () =>
    damagePreview(state, attacker.instanceId, power.id, defender.instanceId),
  );
  stable('healPreview', () => {
    const healerState = fullBattle(['h17'], ['h01']);
    const healer = healerState.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;
    const heal = getHero('h17').powers.find((p) => p.friendly)!;
    return healPreview(healerState, healer.instanceId, heal.id, healer.instanceId);
  });
  stable('legalTargets', () => legalTargets(state, attacker.instanceId, power.id));
  stable('mustPass', () => mustPass(state, attacker.instanceId));
  stable('availablePowers', () =>
    availablePowers(state, attacker.instanceId).map((p) => p.id),
  );
  stable('pooledHpShare', () => pooledHpShare(state, 'attacker'));
  stable('battleEnded', () => battleEnded(state));

  it('produces identical results from two independently built identical states', () => {
    // Distinct object identities, same content. A cache keyed on identity would
    // pass every test above and fail this one.
    const a = fullBattle(['h01'], ['h19']);
    const b = fullBattle(['h01'], ['h19']);

    expect(a).not.toBe(b);
    expect(JSON.stringify(damagePreview(a, 'attacker-0', power.id, 'defender-0'))).toBe(
      JSON.stringify(damagePreview(b, 'attacker-0', power.id, 'defender-0')),
    );
    expect(turnQueue(a, 50)).toEqual(turnQueue(b, 50));
  });

  it('does not mutate the state it is given', () => {
    const before = JSON.stringify(state);

    hitProbability(state, attacker.instanceId, defender.instanceId);
    turnQueue(state, 100);
    damagePreview(state, attacker.instanceId, power.id, defender.instanceId);
    legalTargets(state, attacker.instanceId, power.id);
    battleEnded(state);

    expect(JSON.stringify(state)).toBe(before);
  });
});
