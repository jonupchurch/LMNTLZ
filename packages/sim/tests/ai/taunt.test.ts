/**
 * **A taunt beats a priority, always** (SC-006).
 *
 * And the reason it does is structural rather than a rule anybody wrote: a
 * compulsion is stage 3 of feature 002's pipeline, and `chooseTarget` is stage 4.
 * By the time a preference is consulted the candidate set is already a single
 * champion. There is no rule in `ai/` that could outrank a taunt, and none that
 * needs to know one exists.
 *
 * The second half is the case that makes it safe: **a compulsion naming somebody
 * outside the candidate set does not apply.** A taunting Tank two rows out of
 * reach cannot compel anyone — otherwise an attacker would have a legal move it
 * was forbidden from making, which is a battle that stops.
 */

import { describe, expect, it } from 'vitest';
import { legalTargets, type Compulsion, type TargetFilter } from '../../rules/targeting.js';
import { TARGET_RULES } from '../../ai/types.js';
import { chooseTarget } from '../../ai/targeting.js';
import { decideAction } from '../../ai/decide.js';
import { atTurn, board, config, fixedSeed, powerOfTier } from './fixtures.js';

const SEED = fixedSeed();
const SIX = ['h01', 'h02', 'h14', 'h19', 'h23', 'h25'];

/** Ossic — **reach 2**, so rows 3 and 2 are both in the window and a taunt from
 *  behind the front line is a taunt this defender can actually be pulled by. A
 *  reach-1 defender would simply not see row 2, and the test would be asserting
 *  nothing. */
const DEF = 'h02';

const taunt = (instanceId: string): Compulsion => ({ name: 'taunt', instanceId });

describe('a taunting Tank', () => {
  it('pulls a defender off its preferred target 100% of the time', () => {
    const state = atTurn(board(SIX, [DEF]), 5);
    const power = powerOfTier(DEF, 0);

    // a1 sits in the front row; every preference on the menu is tried against a
    // taunt naming a2, which sits behind it.
    //
    // Note `legalTargets` REPORTS the compulsion rather than applying it — it
    // returns `compelled` alongside the full candidate set. Narrowing is the
    // caller's job, and `decideAction` does it. A caller that read `candidates`
    // alone would silently drop every taunt in the game.
    for (const rule of TARGET_RULES) {
      const { candidates, compelled } = legalTargets(state, 'd0', power, [], taunt('a2'));
      expect(compelled).toBe('a2');
      expect(candidates).toContain('a2');
      expect(candidates.length).toBeGreaterThan(1);

      const chosen = chooseTarget(
        state,
        SEED,
        0n,
        'd0',
        power,
        config({ targeting: [rule, rule] }),
        [compelled!],
      );
      expect(chosen.targetInstanceId, rule).toBe('a2');
      expect(chosen.drawsConsumed, `${rule} should not need a draw`).toBe(0n);
    }
  });

  it('reaches the same answer through the whole decision, not just the sorter', () => {
    const state = atTurn(board(SIX, [DEF]), 5);
    const decision = decideAction(state, SEED, 0n, 'd0', config({ targeting: ['furthest', 'furthest'] }), {
      compulsion: taunt('a1'),
    });

    expect(decision.targetInstanceId).toBe('a1');
  });

  it('does not apply when it names a hero outside the candidate set', () => {
    // a5 is the enemy back seat, distance 3 from the defender front row. A
    // taunt from there compels nobody, and the defender picks freely.
    const state = atTurn(board(SIX, [DEF]), 5);
    const power = powerOfTier(DEF, 0);
    const { candidates, compelled } = legalTargets(state, 'd0', power, [], taunt('a5'));

    expect(compelled).toBeNull();
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).not.toContain('a5');

    const chosen = chooseTarget(state, SEED, 0n, 'd0', power, config(), candidates);
    expect(candidates).toContain(chosen.targetInstanceId);
  });

  it('cancels against a restriction naming the same hero — and still leaves a move', () => {
    // The filter runs first and removes the hero; the compulsion then finds its
    // target absent. Neither is special-cased, and the defender still acts.
    const state = atTurn(board(SIX, [DEF]), 5);
    const power = powerOfTier(DEF, 0);
    const hides: TargetFilter = {
      name: 'fade',
      permits: (cs) => cs.filter((c) => c.instanceId !== 'a1'),
    };

    const { candidates, compelled } = legalTargets(state, 'd0', power, [hides], taunt('a1'));
    expect(compelled).toBeNull();
    expect(candidates).not.toContain('a1');
    expect(candidates.length).toBeGreaterThan(0);

    expect(candidates).toContain(
      chooseTarget(state, SEED, 0n, 'd0', power, config(), candidates).targetInstanceId,
    );
  });

  it('leaves a legal move when a filter would empty the set — the filter is ignored', () => {
    const state = atTurn(board(SIX, [DEF]), 5);
    const power = powerOfTier(DEF, 0);
    const hidesEverybody: TargetFilter = { name: 'fade', permits: () => [] };

    const { candidates, filtersIgnored } = legalTargets(state, 'd0', power, [hidesEverybody]);
    expect(filtersIgnored).toEqual(['fade']);
    expect(candidates.length).toBeGreaterThan(0);

    expect(candidates).toContain(
      chooseTarget(state, SEED, 0n, 'd0', power, config(), candidates).targetInstanceId,
    );
  });
});
