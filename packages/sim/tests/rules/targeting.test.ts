import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { legalTargets, mustPass, type Compulsion, type TargetFilter } from '../../rules/targeting.js';
import type { HeroState } from '../../rules/state.js';
import { clearRows, fullBattle, withHero } from './fixtures.js';

const ATTACK = getHero('h01').powers[0]!.id; // tier-0 auto, hostile, single
const HEAL = getHero('h17').powers.find((p) => p.friendly)!.id;

/** A `fade`-shaped restriction: removes the named instances if any others remain. */
const excluding = (name: string, ids: readonly string[]): TargetFilter => ({
  name,
  permits: (candidates: readonly HeroState[]) =>
    candidates.filter((c) => !ids.includes(c.instanceId)),
});

const taunt = (instanceId: string): Compulsion => ({ name: 'taunt', instanceId });

/**
 * T034/T035 — every combination of filter and compulsion, asserting a legal
 * action always exists.
 *
 * **Targeting cannot deadlock**, and that is a stronger claim than "it usually
 * works". A hero with no legal move stalls a battle that has no way to advance
 * past it, so the two non-emptying invariants are not politeness — they are what
 * makes the 300-turn cap reachable.
 */
describe('targeting never deadlocks', () => {
  const state = fullBattle();
  const attacker = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;
  const enemies = state.heroes.filter((h) => h.side === 'defender').map((h) => h.instanceId);

  it('finds a legal target under every subset of restrictions', () => {
    // Every subset of the enemy squad as a fade set: 2^6 = 64 combinations.
    for (let mask = 0; mask < 64; mask++) {
      const faded = enemies.filter((_, i) => (mask & (1 << i)) !== 0);
      const result = legalTargets(state, attacker.instanceId, ATTACK, [
        excluding('fade', faded),
      ]);

      const reachable = state.heroes.filter(
        (h) => h.side === 'defender' && h.row === 4,
      ).length;

      if (reachable > 0) {
        expect(result.candidates.length, `mask ${mask}`).toBeGreaterThan(0);
      }
    }
  });

  it('finds a legal target under every combination of restriction and compulsion', () => {
    for (let mask = 0; mask < 64; mask++) {
      const faded = enemies.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const compelled of enemies) {
        const result = legalTargets(
          state,
          attacker.instanceId,
          ATTACK,
          [excluding('fade', faded)],
          taunt(compelled),
        );

        expect(result.candidates.length).toBeGreaterThan(0);
        if (result.compelled !== null) {
          expect(result.candidates).toContain(result.compelled);
        }
      }
    }
  });
});

describe('the four interaction cases', () => {
  const state = fullBattle();
  const attacker = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;
  const reachable = state.heroes
    .filter((h) => h.side === 'defender' && h.row === 4)
    .map((h) => h.instanceId);

  it('ignores a filter that would empty the set, and says which', () => {
    const result = legalTargets(state, attacker.instanceId, ATTACK, [
      excluding('fade', reachable),
    ]);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.filtersIgnored).toEqual(['fade']);
  });

  it('does not apply a compulsion naming a hero outside the set', () => {
    // A taunting tank in row 6 is out of reach; the taunt is simply not in force.
    const outOfReach = state.heroes.find((h) => h.side === 'defender' && h.row === 6)!;
    const result = legalTargets(
      state,
      attacker.instanceId,
      ATTACK,
      [],
      taunt(outOfReach.instanceId),
    );

    expect(result.compelled).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('cancels a compulsion and a restriction naming the same hero', () => {
    // The filter runs first and removes the hero; the compulsion then finds its
    // target absent. The cancellation falls out of the ordering rather than
    // being a special case anybody wrote.
    const target = reachable[0]!;
    const result = legalTargets(
      state,
      attacker.instanceId,
      ATTACK,
      [excluding('fade', [target])],
      taunt(target),
    );

    expect(result.compelled).toBeNull();
    expect(result.candidates).not.toContain(target);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('passes a hero with no legal target rather than stalling', () => {
    // Back seat, full formation: distance 3 to the nearest enemy, reach 1.
    const back = state.heroes.find((h) => h.side === 'attacker' && h.row === 1)!;
    expect(legalTargets(state, back.instanceId, ATTACK).candidates).toEqual([]);
    expect(mustPass(state, back.instanceId)).toBe(true);
  });

  it('stops passing once the line collapses', () => {
    const collapsed = clearRows(fullBattle(), [2, 3]);
    const back = collapsed.heroes.find((h) => h.side === 'attacker' && h.row === 1)!;

    expect(mustPass(collapsed, back.instanceId)).toBe(false);
  });
});

/**
 * FR-008 — **a heal is range-limited exactly as an attack is.**
 *
 * One rule for enemies and allies alike. The power's `friendly` flag selects the
 * pool and nothing else about the path differs.
 */
describe('allies obey the identical reach rule', () => {
  it('limits a heal by reach the same way an attack is limited', () => {
    const state = fullBattle(['h17'], ['h01']); // Umbriel (buffer, reach 2) attacking side
    const healer = state.heroes.find((h) => h.side === 'attacker' && h.row === 1)!;

    const allies = legalTargets(state, healer.instanceId, HEAL).candidates;
    expect(allies.length).toBeGreaterThan(0);

    // Every ally it can reach really is within its reach, by the same function.
    const rows = allies.map(
      (id) => state.heroes.find((h) => h.instanceId === id)!.row,
    );
    expect(rows.every((r) => r <= 3)).toBe(true);
  });

  it('lets a friendly power target its own caster and a hostile one never', () => {
    const state = fullBattle(['h17'], ['h01']);
    const healer = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;

    expect(legalTargets(state, healer.instanceId, HEAL).candidates).toContain(
      healer.instanceId,
    );

    const hostile = getHero('h17').powers.find((p) => !p.friendly)!.id;
    expect(legalTargets(state, healer.instanceId, hostile).candidates).not.toContain(
      healer.instanceId,
    );
  });

  it('never offers an ally to a hostile power or an enemy to a friendly one', () => {
    const state = fullBattle(['h17'], ['h01']);
    const actor = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;

    const hostile = getHero('h17').powers.find((p) => !p.friendly)!.id;
    for (const id of legalTargets(state, actor.instanceId, hostile).candidates) {
      expect(state.heroes.find((h) => h.instanceId === id)!.side).toBe('defender');
    }
    for (const id of legalTargets(state, actor.instanceId, HEAL).candidates) {
      expect(state.heroes.find((h) => h.instanceId === id)!.side).toBe('attacker');
    }
  });

  it('never offers a fallen hero to anything', () => {
    const state = withHero(fullBattle(), 'defender-0', { hp: 0 });
    const attacker = state.heroes.find((h) => h.side === 'attacker' && h.row === 3)!;

    expect(legalTargets(state, attacker.instanceId, ATTACK).candidates).not.toContain(
      'defender-0',
    );
  });
});
