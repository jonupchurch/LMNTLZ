/**
 * 🔴 **What the twelve US1 rune effects actually do.**
 *
 * These have never run in any form. An assertion an inert implementation would
 * also satisfy proves nothing here, and it would be easy to write one — most of
 * these grant a number, and *"the number is a number"* is not a claim.
 *
 * So every test below either **compares against a control** — the same board with
 * the rune removed — or asserts a value only reachable through the effect. Where an
 * effect has a threshold, **both sides of it are asserted**, because a condition
 * inverted is the easiest way to get one of these exactly backwards while still
 * watching a number move.
 *
 * The structural guards (pool sizes, name collisions, no magic numbers) live in
 * `runeEffects.test.ts`. This file is only behaviour.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { RUNE_MAGNITUDES } from '../../rules/runeEffects.js';
import {
  applyPassiveEffects,
  damageMultiplierFor,
  onDeath,
  onStrike,
  onStruck,
  penetrationBonusFor,
  shapeOutgoing,
  statBonusFor,
  targetingFor,
  type StrikeContext,
} from '../../rules/passives.js';
import { legalTargets } from '../../rules/targeting.js';
import { maxHp } from '../../rules/damage.js';
import { PERMANENT, markCount } from '../../rules/status.js';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { heroStateFor, stateOf, status, withHero } from './fixtures.js';

const M = RUNE_MAGNITUDES;
const tier0Of = (heroId: string): string => getHero(heroId).powers[0]!.id;

/** A board where named instances carry rune effects. */
function board(
  attacker: { readonly heroId: string; readonly runes?: readonly string[] },
  defenders: readonly {
    readonly heroId: string;
    readonly row: 4 | 5 | 6;
    readonly id: string;
    readonly runes?: readonly string[];
  }[],
  allies: readonly {
    readonly heroId: string;
    readonly row: 1 | 2 | 3;
    readonly id: string;
    readonly runes?: readonly string[];
  }[] = [],
): BattleState {
  return stateOf([
    heroStateFor(getHero(attacker.heroId), 'attacker', 3, 'a', {
      runeEffects: attacker.runes ?? [],
    }),
    ...allies.map((x) =>
      heroStateFor(getHero(x.heroId), 'attacker', x.row, x.id, { runeEffects: x.runes ?? [] }),
    ),
    ...defenders.map((d) =>
      heroStateFor(getHero(d.heroId), 'defender', d.row, d.id, { runeEffects: d.runes ?? [] }),
    ),
  ]);
}

function strike(state: BattleState, attackerId: string, defenderId: string): StrikeContext {
  const attacker = heroStateOf(state, attackerId);
  const defender = heroStateOf(state, defenderId);
  const pool = maxHp(defender);
  return {
    state,
    attacker,
    defender,
    power: getHero(attacker.heroId).powers[0]!,
    defenderHpFraction: pool > 0 ? defender.hp / pool : 0,
  };
}

const buffPoints = (state: BattleState, id: string, stat: string): number =>
  heroStateOf(state, id)
    .statuses.filter((s) => s.kind === 'buff' && s.stat === stat)
    .reduce((sum, s) => sum + s.magnitude, 0);

const fold = (state: BattleState, effects: ReturnType<typeof onStrike>): BattleState =>
  applyPassiveEffects(state, effects, maxHp);

/**
 * 🔴 **Only the effects this rune contributed.**
 *
 * `onStruck(...)` and `onStrike(...)` return everything the champion's hooks
 * produced, and champions have passives. h01 Bramwen carries `The Long Patience`,
 * whose `onStruck` emits a `clear`; h19 Kaellis carries `The Duelist's Habit`,
 * whose `onStrike` places a mark. So `expect(onStruck(...)).toEqual([])` is not
 * *"the rune did nothing"* — it is *"the champion did nothing"*, which is false for
 * most of the roster and would have made these controls fail against **correct**
 * code.
 *
 * Filtering on the `rune:` namespace is what makes the control a control. The same
 * trap caught `The Cut Reopens` in 020, for the same reason.
 */
const runeOnly = (
  effects: ReturnType<typeof onStrike>,
): ReturnType<typeof onStrike> =>
  effects.filter((e) => {
    if (e.kind === 'clear') return e.sourcePowerId.startsWith('rune:');
    if (e.kind === 'heal') return false;
    return e.status.sourcePowerId.startsWith('rune:');
  });

/**
 * A real attacker whose tier-0 power is a **Bane** hit against one champion and
 * nothing at all against another.
 *
 * **Derived from the roster, not hardcoded.** The whole relationship profile is
 * generated from two authored fields, so a hand-picked pair goes stale the moment
 * a champion is re-authored — the test finds its fixture the way the engine would.
 */
function banePair(): { attacker: string; bane: string; neutral: string } {
  for (const attacker of getAllHeroes()) {
    const types = attacker.powers[0]!.types;
    const bane = getAllHeroes().find((d) => types.some((t) => t === d.bane));
    const neutral = getAllHeroes().find(
      (d) =>
        !types.some((t) => t === d.bane || t === d.fault || t === d.primary || t === d.secondary),
    );
    if (bane && neutral) return { attacker: attacker.id, bane: bane.id, neutral: neutral.id };
  }
  throw new Error('no Bane pair on the roster');
}

const PAIR = banePair();

// ---------------------------------------------------------------------------

describe('Cornered — first time below half', () => {
  const hurt = (fraction: number, runes: readonly string[]) => {
    const state = board({ heroId: 'h19' }, [{ heroId: 'h01', row: 4, id: 'd', runes }]);
    const d = heroStateOf(state, 'd');
    return withHero(state, 'd', { hp: Math.max(1, Math.round(maxHp(d) * fraction)) });
  };

  it('grants Might when the blow leaves it below half', () => {
    const state = hurt(0.3, ['cornered']);
    expect(buffPoints(fold(state, onStruck(strike(state, 'a', 'd'))), 'd', 'might')).toBe(
      M.corneredMight,
    );
  });

  it('🔴 does nothing above half — the threshold, not the hit', () => {
    const state = hurt(0.8, ['cornered']);
    expect(runeOnly(onStruck(strike(state, 'a', 'd')))).toEqual([]);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = hurt(0.3, []);
    expect(runeOnly(onStruck(strike(state, 'a', 'd')))).toEqual([]);
  });

  it('🔴 fires once, not on every later blow', () => {
    const state = hurt(0.3, ['cornered']);
    const once = fold(state, onStruck(strike(state, 'a', 'd')));
    const twice = fold(once, onStruck(strike(once, 'a', 'd')));
    expect(buffPoints(twice, 'd', 'might')).toBe(M.corneredMight);
  });
});

describe('The Point Proven — first Bane hit landed', () => {
  it('grants Penetration on a Bane hit', () => {
    const state = board({ heroId: PAIR.attacker, runes: ['the-point-proven'] }, [
      { heroId: PAIR.bane, row: 4, id: 'd' },
    ]);
    expect(buffPoints(fold(state, onStrike(strike(state, 'a', 'd'))), 'a', 'penetration')).toBe(
      M.pointProvenPenetration,
    );
  });

  it('🔴 grants nothing on a hit that is not a Bane', () => {
    const state = board({ heroId: PAIR.attacker, runes: ['the-point-proven'] }, [
      { heroId: PAIR.neutral, row: 4, id: 'd' },
    ]);
    expect(runeOnly(onStrike(strike(state, 'a', 'd')))).toEqual([]);
  });
});

describe('The Line Shortens — an ally falls', () => {
  const withFallenAlly = (runes: readonly string[]) => {
    const state = board(
      { heroId: 'h19', runes },
      [{ heroId: 'h01', row: 4, id: 'd' }],
      [{ heroId: 'h02', row: 2, id: 'ally' }],
    );
    return withHero(state, 'ally', { hp: 0 });
  };

  it('grants Speed', () => {
    const state = withFallenAlly(['the-line-shortens']);
    const after = fold(state, onDeath(state, heroStateOf(state, 'ally')));
    expect(buffPoints(after, 'a', 'speed')).toBe(M.lineShortensSpeed);
  });

  it('🔴 grants nothing when the one who fell is an enemy', () => {
    const state = board({ heroId: 'h19', runes: ['the-line-shortens'] }, [
      { heroId: 'h01', row: 4, id: 'd' },
    ]);
    const dead = withHero(state, 'd', { hp: 0 });
    const after = fold(dead, onDeath(dead, heroStateOf(dead, 'd')));
    expect(buffPoints(after, 'a', 'speed')).toBe(0);
  });

  it('🔴 does not climb with a second death — step equals cap', () => {
    const state = withFallenAlly(['the-line-shortens']);
    const once = fold(state, onDeath(state, heroStateOf(state, 'ally')));
    const twice = fold(once, onDeath(once, heroStateOf(once, 'ally')));
    expect(buffPoints(twice, 'a', 'speed')).toBe(M.lineShortensSpeed);
  });
});

describe('Made Heavy — Bane hits slow permanently', () => {
  it('places a permanent Speed debuff on a Bane hit', () => {
    const state = board({ heroId: PAIR.attacker, runes: ['made-heavy'] }, [
      { heroId: PAIR.bane, row: 4, id: 'd' },
    ]);
    const debuff = heroStateOf(fold(state, onStrike(strike(state, 'a', 'd'))), 'd').statuses.find(
      (s) => s.kind === 'debuff',
    );

    expect(debuff?.magnitude).toBe(-M.madeHeavySpeed);
    expect(debuff?.stat).toBe('speed');
    expect(debuff?.turnsRemaining).toBe(PERMANENT);
  });

  it('🔴 does nothing on a hit that is not a Bane', () => {
    const state = board({ heroId: PAIR.attacker, runes: ['made-heavy'] }, [
      { heroId: PAIR.neutral, row: 4, id: 'd' },
    ]);
    expect(runeOnly(onStrike(strike(state, 'a', 'd')))).toEqual([]);
  });

  it('🔴 refreshes rather than stacking a champion to a standstill', () => {
    const state = board({ heroId: PAIR.attacker, runes: ['made-heavy'] }, [
      { heroId: PAIR.bane, row: 4, id: 'd' },
    ]);
    let after = fold(state, onStrike(strike(state, 'a', 'd')));
    after = fold(after, onStrike(strike(after, 'a', 'd')));

    const slows = heroStateOf(after, 'd').statuses.filter((s) => s.kind === 'debuff');
    expect(slows).toHaveLength(1);
    expect(slows[0]!.magnitude).toBe(-M.madeHeavySpeed);
  });
});

describe('Weight Tells — mitigation below half', () => {
  const at = (fraction: number, runes: readonly string[]) => {
    const state = board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    const a = heroStateOf(state, 'a');
    return withHero(state, 'a', { hp: Math.max(1, Math.round(maxHp(a) * fraction)) });
  };

  it('grants Armor and Magic Resist below half', () => {
    const state = at(0.3, ['weight-tells']);
    const hero = heroStateOf(state, 'a');
    expect(statBonusFor(state, hero, 'armor')).toBe(M.weightTellsMitigation);
    expect(statBonusFor(state, hero, 'magicResist')).toBe(M.weightTellsMitigation);
  });

  it('🔴 grants nothing above half, and nothing to an unrelated stat', () => {
    const healthy = at(0.8, ['weight-tells']);
    expect(statBonusFor(healthy, heroStateOf(healthy, 'a'), 'armor')).toBe(0);

    const low = at(0.3, ['weight-tells']);
    expect(statBonusFor(low, heroStateOf(low, 'a'), 'might')).toBe(0);
  });

  it('🔴 grants nothing without the rune — the control', () => {
    const state = at(0.3, []);
    expect(statBonusFor(state, heroStateOf(state, 'a'), 'armor')).toBe(0);
  });
});

describe('Harder to Follow — first Bane hit taken', () => {
  it('grants Agility, once', () => {
    const state = board({ heroId: PAIR.attacker }, [
      { heroId: PAIR.bane, row: 4, id: 'd', runes: ['harder-to-follow'] },
    ]);
    const once = fold(state, onStruck(strike(state, 'a', 'd')));
    const twice = fold(once, onStruck(strike(once, 'a', 'd')));

    expect(buffPoints(once, 'd', 'agility')).toBe(M.harderToFollowAgility);
    expect(buffPoints(twice, 'd', 'agility')).toBe(M.harderToFollowAgility);
  });

  it('🔴 does nothing when the hit is not a Bane', () => {
    const state = board({ heroId: PAIR.attacker }, [
      { heroId: PAIR.neutral, row: 4, id: 'd', runes: ['harder-to-follow'] },
    ]);
    expect(runeOnly(onStruck(strike(state, 'a', 'd')))).toEqual([]);
  });
});

describe('It Spreads — killing blows compound', () => {
  const killed = (runes: readonly string[]) => {
    const state = board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    return withHero(state, 'd', { hp: 0 });
  };

  it('grants Might on a killing blow', () => {
    const state = killed(['it-spreads']);
    expect(buffPoints(fold(state, onStrike(strike(state, 'a', 'd'))), 'a', 'might')).toBe(
      M.itSpreadsMight,
    );
  });

  it('🔴 grants nothing when the target survives', () => {
    const state = board({ heroId: 'h19', runes: ['it-spreads'] }, [
      { heroId: 'h01', row: 4, id: 'd' },
    ]);
    expect(runeOnly(onStrike(strike(state, 'a', 'd')))).toEqual([]);
  });

  it('🔴 stops at the ceiling that lands a Might 30 champion exactly on the cap', () => {
    let state = killed(['it-spreads']);
    for (let i = 0; i < M.itSpreadsStacks + 2; i += 1) {
      state = fold(state, onStrike(strike(state, 'a', 'd')));
    }
    expect(buffPoints(state, 'a', 'might')).toBe(M.itSpreadsMight * M.itSpreadsStacks);
  });
});

describe('Nowhere to Stand — the acting champion sees through fade', () => {
  /**
   * 🔴 **The regression test for the `targetingFor` bypass.**
   *
   * h05 Cirrolan is a Buffer carrying `Behind the Line`, a permanent fade. h19
   * Kaellis is not Light and cannot normally pick it. The rune must change that —
   * and it only can if `targetingFor` reads the **acting** champion's hooks through
   * the composed lookup. Until 021 that one line called `hooksFor(...heroId)`
   * directly, so this effect would have done nothing while every structural test
   * still passed.
   */
  const withBuffer = (runes: readonly string[]) =>
    board({ heroId: 'h19', runes }, [
      { heroId: 'h05', row: 4, id: 'buffer' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);

  it('lets a champion carrying the rune pick the faded Buffer', () => {
    const state = withBuffer(['nowhere-to-stand']);
    const { filters, compulsion } = targetingFor(state, 'a');
    const legal = legalTargets(state, 'a', tier0Of('h19'), filters, compulsion);

    expect([...legal.candidates].sort()).toEqual(['buffer', 'other']);
  });

  it('🔴 and the same champion without it cannot — the control', () => {
    const state = withBuffer([]);
    const { filters, compulsion } = targetingFor(state, 'a');
    const legal = legalTargets(state, 'a', tier0Of('h19'), filters, compulsion);

    expect(legal.candidates).toEqual(['other']);
  });

  it('also grants Perception', () => {
    const state = withBuffer(['nowhere-to-stand']);
    expect(statBonusFor(state, heroStateOf(state, 'a'), 'perception')).toBe(
      M.nowhereToStandPerception,
    );
  });
});

describe('It Lingers — debuffs you apply last longer', () => {
  const applier = (runes: readonly string[]): HeroState =>
    heroStateOf(board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]), 'a');

  it('adds a turn to a debuff', () => {
    const shaped = shapeOutgoing(applier(['it-lingers']), status('burn', { turnsRemaining: 2 }));
    expect(shaped.turnsRemaining).toBe(2 + M.itLingersExtraTurns);
  });

  it('🔴 leaves a positive effect alone — it is not "everything you apply"', () => {
    const shaped = shapeOutgoing(applier(['it-lingers']), status('shield', { turnsRemaining: 2 }));
    expect(shaped.turnsRemaining).toBe(2);
  });

  it('🔴 leaves a permanent effect permanent rather than making it finite', () => {
    const shaped = shapeOutgoing(
      applier(['it-lingers']),
      status('debuff', { turnsRemaining: PERMANENT }),
    );
    expect(shaped.turnsRemaining).toBe(PERMANENT);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const shaped = shapeOutgoing(applier([]), status('burn', { turnsRemaining: 2 }));
    expect(shaped.turnsRemaining).toBe(2);
  });
});

describe('Again, There — consecutive attacks on one target', () => {
  const two = (runes: readonly string[]) =>
    board({ heroId: 'h19', runes }, [
      { heroId: 'h01', row: 4, id: 'd1' },
      { heroId: 'h02', row: 4, id: 'd2' },
    ]);

  /**
   * 🔴 **Measured as the rune's delta against the same board without it.**
   *
   * The raw multiplier is not 1 on the first blow and never was: h19 Kaellis
   * carries `The Duelist's Habit`, worth +25% against a target it has not yet
   * struck. Asserting the total would have failed against correct code — and
   * worse, "fixing" it by changing the rune would have hidden the passive.
   */
  it('is worth nothing on the first blow and climbs after it', () => {
    const withRune = two(['again-there']);
    const without = two([]);
    expect(damageMultiplierFor(strike(withRune, 'a', 'd1'))).toBe(
      damageMultiplierFor(strike(without, 'a', 'd1')),
    );

    const after = fold(withRune, onStrike(strike(withRune, 'a', 'd1')));
    const control = fold(without, onStrike(strike(without, 'a', 'd1')));
    expect(
      damageMultiplierFor(strike(after, 'a', 'd1')) -
        damageMultiplierFor(strike(control, 'a', 'd1')),
    ).toBeCloseTo(M.againThereStep, 10);
  });

  it('🔴 resets when the attacker switches target — that is what consecutive means', () => {
    let state = two(['again-there']);
    state = fold(state, onStrike(strike(state, 'a', 'd1')));
    state = fold(state, onStrike(strike(state, 'a', 'd1')));
    expect(markCount(heroStateOf(state, 'd1'), 'a', 'rune:again-there')).toBe(2);

    state = fold(state, onStrike(strike(state, 'a', 'd2')));
    expect(markCount(heroStateOf(state, 'd1'), 'a', 'rune:again-there')).toBe(0);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = two([]);
    const after = fold(state, onStrike(strike(state, 'a', 'd1')));
    expect(runeOnly(onStrike(strike(after, 'a', 'd1')))).toEqual([]);
  });
});

describe('The Way In — a target you have already struck', () => {
  it('is worth nothing on the first blow and the full bonus after', () => {
    const state = board({ heroId: 'h19', runes: ['the-way-in'] }, [
      { heroId: 'h01', row: 4, id: 'd' },
    ]);
    expect(penetrationBonusFor(strike(state, 'a', 'd'))).toBe(0);

    const after = fold(state, onStrike(strike(state, 'a', 'd')));
    expect(penetrationBonusFor(strike(after, 'a', 'd'))).toBe(M.theWayInPenetration);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = board({ heroId: 'h19' }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    const after = fold(state, onStrike(strike(state, 'a', 'd')));
    expect(penetrationBonusFor(strike(after, 'a', 'd'))).toBe(0);
  });
});

describe('The Floor Comes Up — stuns the reachable when it drops', () => {
  const hurt = (fraction: number, runes: readonly string[]) => {
    const state = board({ heroId: 'h19' }, [
      { heroId: 'h01', row: 4, id: 'd', runes },
      { heroId: 'h02', row: 4, id: 'other' },
    ]);
    const d = heroStateOf(state, 'd');
    return withHero(state, 'd', { hp: Math.max(1, Math.round(maxHp(d) * fraction)) });
  };

  it('stuns every enemy in reach', () => {
    const state = hurt(0.3, ['the-floor-comes-up']);
    const stunned = heroStateOf(fold(state, onStruck(strike(state, 'a', 'd'))), 'a').statuses.filter(
      (s) => s.kind === 'stun',
    );

    expect(stunned).toHaveLength(1);
    expect(stunned[0]!.turnsRemaining).toBe(M.floorComesUpTurns);
  });

  it('🔴 never stuns its own side', () => {
    const state = hurt(0.3, ['the-floor-comes-up']);
    const after = fold(state, onStruck(strike(state, 'a', 'd')));
    expect(heroStateOf(after, 'other').statuses.filter((s) => s.kind === 'stun')).toEqual([]);
  });

  it('🔴 does nothing above half', () => {
    const state = hurt(0.8, ['the-floor-comes-up']);
    expect(runeOnly(onStruck(strike(state, 'a', 'd')))).toEqual([]);
  });

  it('🔴 fires once per battle', () => {
    const state = hurt(0.3, ['the-floor-comes-up']);
    const once = fold(state, onStruck(strike(state, 'a', 'd')));
    expect(runeOnly(onStruck(strike(once, 'a', 'd')))).toEqual([]);
  });
});
