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
  actsAgainAfter,
  applyPassiveEffects,
  critRefusal,
  damageMultiplierFor,
  healMultiplierFor,
  hitFloorFor,
  ignoresShields,
  onAct,
  onDeath,
  onHealed,
  onStrike,
  onStruck,
  onUpkeep,
  penetrationBonusFor,
  shapeIncoming,
  shapeOutgoing,
  statBonusFor,
  strikeChancesOf,
  struckChancesOf,
  targetingFor,
  turnStartChancesOf,
  type StrikeContext,
} from '../../rules/passives.js';
import { legalTargets } from '../../rules/targeting.js';
import { MAX_HIT_PROBABILITY, hitProbability } from '../../rules/probability.js';
import { absorb, maxHp } from '../../rules/damage.js';
import {
  PERMANENT,
  markCount,
  potencyForTier,
  upkeepDamageFrom,
  type Tier,
} from '../../rules/status.js';
import { heroStateOf, packetOf, type BattleState, type HeroState } from '../../rules/state.js';
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
    /**
     * **`damage` and `cleanse` carry no source at all** (021 US2), so this filter
     * cannot see whose they are — `Too Close` and `The Lamp Lifted` are asserted
     * against a with/without control on the board instead, which is the stronger
     * form anyway. Listed by name rather than swept into a default so that a
     * future kind fails the compiler here rather than being silently dropped.
     */
    if (e.kind === 'heal' || e.kind === 'damage' || e.kind === 'cleanse') return false;
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
    const shaped = shapeOutgoing(stateOf([]), applier(['it-lingers']), status('burn', { turnsRemaining: 2 }));
    expect(shaped.turnsRemaining).toBe(2 + M.itLingersExtraTurns);
  });

  it('🔴 leaves a positive effect alone — it is not "everything you apply"', () => {
    const shaped = shapeOutgoing(stateOf([]), applier(['it-lingers']), status('shield', { turnsRemaining: 2 }));
    expect(shaped.turnsRemaining).toBe(2);
  });

  it('🔴 leaves a permanent effect permanent rather than making it finite', () => {
    const shaped = shapeOutgoing(
      stateOf([]),
      applier(['it-lingers']),
      status('debuff', { turnsRemaining: PERMANENT }),
    );
    expect(shaped.turnsRemaining).toBe(PERMANENT);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const shaped = shapeOutgoing(stateOf([]), applier([]), status('burn', { turnsRemaining: 2 }));
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

// ---------------------------------------------------------------------------
// US2 — the seventeen that needed a new engine capability
// ---------------------------------------------------------------------------

/** A board with one runed defender, at a chosen fraction of its pool. */
const at = (fraction: number, runes: readonly string[], attackerRunes: readonly string[] = []) => {
  const state = board({ heroId: 'h19', runes: attackerRunes }, [
    { heroId: 'h01', row: 4, id: 'd', runes },
    { heroId: 'h04', row: 5, id: 'd2' },
  ]);
  const d = heroStateOf(state, 'd');
  return withHero(state, 'd', { hp: Math.max(1, Math.round(maxHp(d) * fraction)) });
};

describe('Not This Time — a ward with one charge', () => {
  const stun = () => status('stun', { turnsRemaining: 1, sourceInstanceId: 'a' });

  /**
   * ⚠️ **The bearer must not be an Earth champion, and the first draft of this
   * file made it one.**
   *
   * h01 Bramwen carries `The Deep Holds`, which refuses a one-turn Stun outright
   * — control is priced at exactly one turn, so "one turn shorter" is immunity for
   * the three Earth champions. Every assertion here passed on a board where the
   * *House passive* was doing the refusing and the rune contributed nothing: the
   * refusal looked right and `paid` was empty, which is the ward never spending.
   *
   * h19 Kaellis is Slash and refuses nothing, so what is measured below is the
   * rune.
   */
  const warded = (runes: readonly string[]) => {
    const state = board({ heroId: 'h01' }, [{ heroId: 'h19', row: 4, id: 'd', runes }]);
    return state;
  };

  it('refuses the first Stun and pays a latch for it', () => {
    const state = warded(['not-this-time']);
    const result = shapeIncoming(state, heroStateOf(state, 'd'), stun());

    expect(result.instance, 'the Stun does not land').toBeNull();
    expect(result.paid, 'a ward that refuses without paying refuses forever').not.toEqual([]);
  });

  it('🔴 lets the second one through once the charge is spent', () => {
    const state = warded(['not-this-time']);
    const first = shapeIncoming(state, heroStateOf(state, 'd'), stun());
    const spentBoard = fold(state, first.paid);

    expect(shapeIncoming(spentBoard, heroStateOf(spentBoard, 'd'), stun()).instance).not.toBeNull();
  });

  it('🔴 names a class — a burn is not what the charge is for', () => {
    const state = warded(['not-this-time']);
    const burn = status('burn', { turnsRemaining: 3, magnitude: 9, sourceInstanceId: 'a' });
    const result = shapeIncoming(state, heroStateOf(state, 'd'), burn);

    expect(result.instance, 'a minor tick must not spend the charge').not.toBeNull();
    expect(result.paid).toEqual([]);
  });

  it('🔴 spends on a Silence as readily as a Stun', () => {
    const state = warded(['not-this-time']);
    const silence = status('silence', { turnsRemaining: 1, sourceInstanceId: 'a' });
    expect(shapeIncoming(state, heroStateOf(state, 'd'), silence).instance).toBeNull();
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = warded([]);
    const result = shapeIncoming(state, heroStateOf(state, 'd'), stun());
    expect(result.instance, 'a Slash champion refuses nothing on its own').not.toBeNull();
    expect(result.paid).toEqual([]);
  });
});

describe('All One Piece — crit immunity', () => {
  it('refuses a crit, and pays nothing because it is not a charge', () => {
    const state = at(1, ['all-one-piece']);
    const refusal = critRefusal(state, heroStateOf(state, 'd'));

    expect(refusal.refused).toBe(true);
    expect(refusal.paid, 'immunity is permanent; a payment would make it a ward').toEqual([]);
  });

  it('🔴 keeps refusing — it is not spent by use', () => {
    const state = at(1, ['all-one-piece']);
    const after = fold(state, critRefusal(state, heroStateOf(state, 'd')).paid);
    expect(critRefusal(after, heroStateOf(after, 'd')).refused).toBe(true);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = at(1, []);
    expect(critRefusal(state, heroStateOf(state, 'd')).refused).toBe(false);
  });
});

describe('Turned Aside — the first crit lands as an ordinary hit', () => {
  it('refuses the first crit and pays for it', () => {
    const state = at(1, ['turned-aside']);
    const refusal = critRefusal(state, heroStateOf(state, 'd'));

    expect(refusal.refused).toBe(true);
    expect(refusal.paid).not.toEqual([]);
  });

  it('🔴 lets the second crit land — the ward is spent', () => {
    const state = at(1, ['turned-aside']);
    const spentBoard = fold(state, critRefusal(state, heroStateOf(state, 'd')).paid);
    expect(critRefusal(spentBoard, heroStateOf(spentBoard, 'd')).refused).toBe(false);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = at(1, []);
    expect(critRefusal(state, heroStateOf(state, 'd')).refused).toBe(false);
  });
});

describe('On the Same Breath — one extra turn on a killing blow', () => {
  const boardWith = (runes: readonly string[]) =>
    board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  it('grants an extra turn when the turn killed somebody', () => {
    const state = boardWith(['on-the-same-breath']);
    expect(actsAgainAfter(state, heroStateOf(state, 'a'), true)).not.toBeNull();
  });

  it('🔴 grants nothing on a turn that killed nobody', () => {
    const state = boardWith(['on-the-same-breath']);
    expect(actsAgainAfter(state, heroStateOf(state, 'a'), false)).toBeNull();
  });

  /** The chain bound (spec A-04): the guard it paid with refuses the next grant. */
  it('🔴 an extra turn cannot itself grant another', () => {
    const state = boardWith(['on-the-same-breath']);
    const paid = actsAgainAfter(state, heroStateOf(state, 'a'), true);
    expect(paid).not.toBeNull();
    const guarded = fold(state, paid ?? []);

    expect(actsAgainAfter(guarded, heroStateOf(guarded, 'a'), true)).toBeNull();
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = boardWith([]);
    expect(actsAgainAfter(state, heroStateOf(state, 'a'), true)).toBeNull();
  });
});

describe('Too Close — the attacker takes a share of the packet', () => {
  const reflected = (effects: ReturnType<typeof onStruck>): number =>
    effects.reduce((sum, e) => sum + (e.kind === 'damage' ? e.amount : 0), 0);

  it('reflects a fraction of the packet at whoever swung', () => {
    const state = at(1, ['too-close']);
    const ctx = strike(state, 'a', 'd');
    const expected = Math.round(packetOf(ctx.attacker, ctx.power) * M.tooCloseFraction);

    expect(expected, 'a zero packet would make this test vacuous').toBeGreaterThan(0);
    expect(reflected(onStruck(ctx))).toBe(expected);
  });

  it('🔴 aims at the attacker, never at the bearer', () => {
    const state = at(1, ['too-close']);
    const hits = onStruck(strike(state, 'a', 'd')).filter((e) => e.kind === 'damage');
    expect(hits.map((e) => (e.kind === 'damage' ? e.bearerInstanceId : ''))).toEqual(['a']);
  });

  /** FR-019 — a reflect can finish somebody, and `fold` runs it through the guard. */
  it('🔴 can take the attacker off the board', () => {
    const state = withHero(at(1, ['too-close']), 'a', { hp: 1 });
    const after = fold(state, onStruck(strike(state, 'a', 'd')));
    expect(heroStateOf(after, 'a').hp).toBe(0);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = at(1, []);
    expect(reflected(onStruck(strike(state, 'a', 'd')))).toBe(0);
  });
});

describe('The Draft — your damage-over-time ticks again when you act', () => {
  const burning = (runes: readonly string[], sourceInstanceId: string) => {
    const state = board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    return withHero(state, 'd', {
      statuses: [status('burn', { magnitude: 11, turnsRemaining: 3, sourceInstanceId })],
    });
  };

  const dealt = (state: BattleState): number =>
    onUpkeep(state, heroStateOf(state, 'a')).reduce(
      (sum, e) => sum + (e.kind === 'damage' ? e.amount : 0),
      0,
    );

  it('re-ticks a burn it applied, for what that burn deals', () => {
    const state = burning(['the-draft'], 'a');
    expect(dealt(state)).toBe(upkeepDamageFrom(heroStateOf(state, 'd'), 'a'));
    expect(dealt(state), 'a zero tick would make this vacuous').toBeGreaterThan(0);
  });

  it('🔴 leaves another champion’s burn alone — it is *your* effects', () => {
    const state = burning(['the-draft'], 'someone-else');
    expect(dealt(state)).toBe(0);
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(dealt(burning([], 'a'))).toBe(0);
  });
});

describe('Runs Dry — a Bane hit halves the target’s next heal', () => {
  const boardFor = (runes: readonly string[]) =>
    board({ heroId: PAIR.attacker, runes }, [
      { heroId: PAIR.bane, row: 4, id: 'd' },
      { heroId: PAIR.neutral, row: 5, id: 'n' },
    ]);

  const marked = (runes: readonly string[], defenderId: string) => {
    const state = boardFor(runes);
    return fold(state, onStrike(strike(state, 'a', defenderId)));
  };

  it('halves a heal on somebody it marked with a Bane hit', () => {
    const after = marked(['runs-dry'], 'd');
    expect(healMultiplierFor(after, heroStateOf(after, 'a'), heroStateOf(after, 'd'))).toBe(
      M.runsDryHealMultiplier,
    );
  });

  it('🔴 marks nobody on a hit that is not a Bane hit', () => {
    const after = marked(['runs-dry'], 'n');
    expect(healMultiplierFor(after, heroStateOf(after, 'a'), heroStateOf(after, 'n'))).toBe(1);
  });

  it('🔴 is spent by the next heal — "next", not "every"', () => {
    const after = marked(['runs-dry'], 'd');
    const healed = fold(after, onHealed(after, heroStateOf(after, 'a'), heroStateOf(after, 'd')));

    expect(healMultiplierFor(healed, heroStateOf(healed, 'a'), heroStateOf(healed, 'd'))).toBe(1);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const after = marked([], 'd');
    expect(healMultiplierFor(after, heroStateOf(after, 'a'), heroStateOf(after, 'd'))).toBe(1);
  });
});

describe('Draws It Up — healing you receive is increased', () => {
  it('raises a heal landing on its own bearer', () => {
    const state = at(0.5, ['draws-it-up']);
    expect(healMultiplierFor(state, heroStateOf(state, 'a'), heroStateOf(state, 'd'))).toBe(
      M.drawsItUpHealMultiplier,
    );
  });

  it('🔴 leaves a heal on somebody else alone — it is healing *you* receive', () => {
    const state = at(0.5, ['draws-it-up']);
    expect(healMultiplierFor(state, heroStateOf(state, 'a'), heroStateOf(state, 'd2'))).toBe(1);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = at(0.5, []);
    expect(healMultiplierFor(state, heroStateOf(state, 'a'), heroStateOf(state, 'd'))).toBe(1);
  });
});

describe('It Passes Through — Resolve, and one shed of debuffs', () => {
  const debuffed = (runes: readonly string[]) => {
    const state = at(1, runes);
    return withHero(state, 'd', {
      statuses: [status('debuff', { stat: 'might', magnitude: -8, turnsRemaining: 3 })],
    });
  };

  const debuffsOn = (state: BattleState, id: string): number =>
    heroStateOf(state, id).statuses.filter((s) => s.kind === 'debuff').length;

  it('grants Resolve unconditionally', () => {
    const state = at(1, ['it-passes-through']);
    const control = at(1, []);

    expect(
      statBonusFor(state, heroStateOf(state, 'd'), 'resolve') -
        statBonusFor(control, heroStateOf(control, 'd'), 'resolve'),
    ).toBe(M.passesThroughResolve);
  });

  it('sheds the debuffs standing at the end of its turn', () => {
    const state = debuffed(['it-passes-through']);
    const after = fold(state, onAct(state, heroStateOf(state, 'd')));
    expect(debuffsOn(after, 'd')).toBe(0);
  });

  it('🔴 does nothing on a turn with nothing to shed — the charge is not wasted', () => {
    const state = at(1, ['it-passes-through']);
    expect(runeOnly(onAct(state, heroStateOf(state, 'd')))).toEqual([]);
  });

  it('🔴 sheds once per battle', () => {
    const first = debuffed(['it-passes-through']);
    const after = fold(first, onAct(first, heroStateOf(first, 'd')));
    const again = withHero(after, 'd', {
      statuses: [
        ...heroStateOf(after, 'd').statuses,
        status('debuff', { stat: 'might', magnitude: -8, turnsRemaining: 3 }),
      ],
    });

    expect(debuffsOn(fold(again, onAct(again, heroStateOf(again, 'd'))), 'd')).toBe(1);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = debuffed([]);
    expect(debuffsOn(fold(state, onAct(state, heroStateOf(state, 'd'))), 'd')).toBe(1);
  });
});

describe('Held in the Light — enemies below half cannot dodge you', () => {
  const floorFor = (state: BattleState): number | null =>
    hitFloorFor(state, heroStateOf(state, 'a'), heroStateOf(state, 'd'));

  it('puts certainty under an attack on a target below half', () => {
    expect(floorFor(at(0.3, [], ['held-in-the-light']))).toBe(M.heldInTheLightFloor);
  });

  it('🔴 does nothing against a target above half — the threshold', () => {
    expect(floorFor(at(0.8, [], ['held-in-the-light']))).toBeNull();
  });

  /** ⚠️ A-02: this is the only thing in the game that passes `MAX_HIT_PROBABILITY`. */
  it('🔴 raises the clamped probability itself, not merely a flag', () => {
    const armed = at(0.3, [], ['held-in-the-light']);
    const control = at(0.3, [], []);

    expect(hitProbability(armed, 'a', 'd')).toBe(M.heldInTheLightFloor);
    expect(hitProbability(control, 'a', 'd')).toBeLessThanOrEqual(MAX_HIT_PROBABILITY);
  });

  it('🔴 belongs to the attacker — a bystander carrying it helps nobody', () => {
    expect(floorFor(at(0.3, ['held-in-the-light'])), 'the bearer is the defender here').toBeNull();
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(floorFor(at(0.3, [], []))).toBeNull();
  });
});

describe('The Lamp Lifted — the first ally to fall clears the survivors', () => {
  const squad = (runes: readonly string[]) =>
    board(
      { heroId: 'h19', runes },
      [{ heroId: 'h01', row: 4, id: 'd' }],
      [{ heroId: 'h04', row: 2, id: 'ally', runes: [] }],
    );

  /**
   * ⚠️ **Appends rather than replaces**, and the first draft replaced.
   *
   * The once-per-battle latch is a mark on the champion's own `statuses`, so
   * assigning a fresh array to re-debuff it also erased the latch — and the
   * "fires once" test then watched the effect fire a second time and called that
   * the bug. The fixture was wiping the very thing under test.
   */
  const withDebuff = (state: BattleState, id: string) =>
    withHero(state, id, {
      statuses: [
        ...heroStateOf(state, id).statuses,
        status('debuff', { stat: 'might', magnitude: -8, turnsRemaining: 3 }),
      ],
    });

  const debuffsOn = (state: BattleState, id: string): number =>
    heroStateOf(state, id).statuses.filter((s) => s.kind === 'debuff').length;

  it('clears every survivor on its own side when an ally falls', () => {
    const state = withDebuff(squad(['the-lamp-lifted']), 'a');
    const after = fold(withHero(state, 'ally', { hp: 0 }), onDeath(state, heroStateOf(state, 'ally')));

    expect(debuffsOn(after, 'a')).toBe(0);
  });

  it('🔴 does not fire when an enemy falls — it is *an ally*', () => {
    const state = withDebuff(squad(['the-lamp-lifted']), 'a');
    const after = fold(withHero(state, 'd', { hp: 0 }), onDeath(state, heroStateOf(state, 'd')));

    expect(debuffsOn(after, 'a')).toBe(1);
  });

  it('🔴 fires once — the *first* ally to fall', () => {
    const state = squad(['the-lamp-lifted']);
    const once = fold(
      withHero(state, 'ally', { hp: 0 }),
      onDeath(state, heroStateOf(state, 'ally')),
    );
    const relapsed = withDebuff(once, 'a');

    expect(debuffsOn(fold(relapsed, onDeath(relapsed, heroStateOf(relapsed, 'ally'))), 'a')).toBe(1);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = withDebuff(squad([]), 'a');
    const after = fold(withHero(state, 'ally', { hp: 0 }), onDeath(state, heroStateOf(state, 'ally')));
    expect(debuffsOn(after, 'a')).toBe(1);
  });
});

describe('Before It Knew — double against a target that has not moved', () => {
  const facing = (runes: readonly string[], hasActed: boolean) => {
    const state = board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    return withHero(state, 'd', { hasActed });
  };

  const multiplier = (state: BattleState): number => damageMultiplierFor(strike(state, 'a', 'd'));

  /**
   * ⚠️ **A ratio against the control, never an absolute.** h19 Kaellis carries
   * `The Duelist's Habit`, worth +25% against a target he has not yet struck, so
   * the total here is never the rune's number on its own — and "fixing" the rune
   * until the total read 2 would have deleted a passive to satisfy a test about
   * something else.
   */
  it('doubles the blow, on top of whatever else the champion carries', () => {
    const armed = multiplier(facing(['before-it-knew'], false));
    const control = multiplier(facing([], false));

    expect(armed / control).toBeCloseTo(M.beforeItKnewMultiplier);
  });

  it('🔴 does nothing to a target that has already had a turn', () => {
    const armed = multiplier(facing(['before-it-knew'], true));
    const control = multiplier(facing([], true));
    expect(armed / control).toBeCloseTo(1);
  });

  it('🔴 is worth double only on the *first* attack against that target', () => {
    const state = facing(['before-it-knew'], false);
    const struck = fold(state, onStrike(strike(state, 'a', 'd')));

    const armedAgain = multiplier(struck);
    const control = multiplier(fold(facing([], false), onStrike(strike(facing([], false), 'a', 'd'))));

    expect(armedAgain / control).toBeCloseTo(1);
  });
});

describe('No One Saw — untargetable below half, until your next turn', () => {
  /**
   * ⚠️ **Two reachable defenders, because a fade that would empty the candidate
   * set is ignored** — an invariant that predates this rune by four features and
   * is what stops a Buffer fading itself into invulnerability.
   *
   * The first draft put the second defender in row 5, out of the attacker's
   * reach, so hiding the one in row 4 left nothing legal and `legalTargets`
   * correctly dropped the filter. The rune was working; the board could not show
   * it.
   */
  const hidden = (fraction: number, runes: readonly string[], attackerRunes: string[] = []) => {
    const state = board({ heroId: 'h19', runes: attackerRunes }, [
      { heroId: 'h01', row: 4, id: 'd', runes },
      { heroId: 'h04', row: 4, id: 'd2' },
    ]);
    const d = heroStateOf(state, 'd');
    return withHero(state, 'd', { hp: Math.max(1, Math.round(maxHp(d) * fraction)) });
  };

  const canBeSeen = (state: BattleState): boolean => {
    const { filters, compulsion } = targetingFor(state, 'a');
    return legalTargets(state, 'a', tier0Of('h19'), filters, compulsion).candidates.includes('d');
  };

  it('hides its bearer below half', () => {
    expect(canBeSeen(hidden(0.3, ['no-one-saw']))).toBe(false);
  });

  it('🔴 does not hide it above half — the threshold', () => {
    expect(canBeSeen(hidden(0.8, ['no-one-saw']))).toBe(true);
  });

  /** *"Until your next turn"* — without it, a champion below half is unkillable. */
  it('🔴 stops hiding once the bearer has taken its turn', () => {
    const state = hidden(0.3, ['no-one-saw']);
    const acted = fold(state, onUpkeep(state, heroStateOf(state, 'd')));
    expect(canBeSeen(acted)).toBe(true);
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(canBeSeen(hidden(0.3, []))).toBe(true);
  });

  /** 🔴 The counter-pair (spec A-05): Light's answer to Dark, and it wins. */
  it('🔴 is seen through by Nowhere to Stand', () => {
    expect(canBeSeen(hidden(0.3, ['no-one-saw'], ['nowhere-to-stand']))).toBe(true);
  });
});

describe('It Stays Open — damage-over-time that cannot be lifted', () => {
  const applier = (runes: readonly string[]): HeroState =>
    heroStateOf(board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]), 'a');

  it('seals every damage-over-time kind it applies against cleansing', () => {
    const sealed = (kind: 'burn' | 'bleed' | 'poison') =>
      shapeOutgoing(stateOf([]), applier(['it-stays-open']), status(kind)).cleansable;

    expect([sealed('burn'), sealed('bleed'), sealed('poison')]).toEqual([false, false, false]);
  });

  it('🔴 leaves a Stun alone — it is *damage-over-time* you apply', () => {
    const shaped = shapeOutgoing(
      stateOf([]),
      applier(['it-stays-open']),
      status('stun', { turnsRemaining: 2 }),
    );
    expect(shaped.cleansable).toBe(true);
  });

  /** *"Or reduced"* — one rule, written at `The Deep Holds` rather than twice. */
  it('🔴 cannot be shortened on the way in either', () => {
    const earth = board({ heroId: 'h02' }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    const sealed = { ...status('stun', { turnsRemaining: 2 }), cleansable: false };
    const ordinary = status('stun', { turnsRemaining: 2 });
    const bearer = heroStateOf(earth, 'a');

    expect(shapeIncoming(earth, bearer, sealed).instance?.turnsRemaining).toBe(2);
    expect(
      shapeIncoming(earth, bearer, ordinary).instance?.turnsRemaining,
      'the control: Earth still shortens an ordinary Stun',
    ).toBe(1);
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(shapeOutgoing(stateOf([]), applier([]), status('burn')).cleansable).toBe(true);
  });
});

describe('Stays Broken — shred that lasts the battle and cannot be lifted', () => {
  const applier = (runes: readonly string[]): HeroState =>
    heroStateOf(board({ heroId: 'h19', runes }, [{ heroId: 'h01', row: 4, id: 'd' }]), 'a');

  const shred = () => status('shred', { stat: 'armor', magnitude: 0.3, turnsRemaining: 2 });

  it('makes a shred permanent and uncleansable — two independent fields', () => {
    const shaped = shapeOutgoing(stateOf([]), applier(['stays-broken']), shred());
    expect(shaped.turnsRemaining).toBe(PERMANENT);
    expect(shaped.cleansable).toBe(false);
  });

  it('🔴 leaves a burn alone — it is *mitigation shred* you apply', () => {
    const shaped = shapeOutgoing(stateOf([]), applier(['stays-broken']), status('burn'));
    expect(shaped.turnsRemaining).not.toBe(PERMANENT);
  });

  it('🔴 does nothing without the rune — the control', () => {
    const shaped = shapeOutgoing(stateOf([]), applier([]), shred());
    expect(shaped.turnsRemaining).toBe(2);
    expect(shaped.cleansable).toBe(true);
  });
});

describe('Straight Past — attacks that pass through shields', () => {
  const shielded = (attackerRunes: readonly string[]) => {
    const state = board({ heroId: 'h19', runes: attackerRunes }, [
      { heroId: 'h01', row: 4, id: 'd' },
    ]);
    return withHero(state, 'd', {
      statuses: [status('shield', { magnitude: 100, turnsRemaining: PERMANENT })],
    });
  };

  it('reads the flag off the attacker', () => {
    expect(ignoresShields(heroStateOf(shielded(['straight-past']), 'a'))).toBe(true);
  });

  /** 🔴 The counter-pair (spec A-05): Pierce's answer to `Before the First Blow`. */
  it('🔴 delivers the whole packet past a shield that would have eaten it', () => {
    const state = shielded(['straight-past']);
    const defender = heroStateOf(state, 'd');
    const through = absorb(defender, 60, ignoresShields(heroStateOf(state, 'a')));

    expect(through.throughput, 'the shield holds 100 and the blow is 60').toBe(60);
    expect(through.absorbed).toBe(0);
    expect(through.statuses, 'through, not around — the shield is not spent').toEqual(
      defender.statuses,
    );
  });

  it('🔴 does nothing without the rune — the control', () => {
    const state = shielded([]);
    const through = absorb(heroStateOf(state, 'd'), 60, ignoresShields(heroStateOf(state, 'a')));

    expect(through.throughput).toBe(0);
    expect(through.absorbed).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// US3 — the four that roll (T048-T050)
// ---------------------------------------------------------------------------

/**
 * 🔴 **These four are the only rules in the game that carry odds, and the odds
 * are all this file can see.**
 *
 * A `ChanceHook` is a number and a pure consequence; the draw belongs to the
 * resolver, which is what keeps `rules/` free of entropy. So the tests here assert
 * the declared chance and **what happens when it fires**, and the draw accounting —
 * how many, in what order, and that a rune-less board takes none — is asserted
 * against the real seed in `tests/resolver/runeChances.test.ts`.
 *
 * Splitting it that way is deliberate: a test that mocked a roll in here would be
 * asserting against a fake of the one thing that has to be real.
 */

describe('Take It Back', () => {
  const twoBuffs = (runes: readonly string[]): BattleState => {
    const state = board({ heroId: 'h19', runes }, [{ heroId: 'h21', row: 4, id: 'd' }]);
    return withHero(state, 'd', {
      statuses: [
        status('buff', { stat: 'might', magnitude: 10, turnsRemaining: 5 }),
        status('buff', { stat: 'agility', magnitude: 10, turnsRemaining: 5 }),
      ],
    });
  };

  it('declares the designed chance and no contest', () => {
    const chances = strikeChancesOf(heroStateOf(twoBuffs(['take-it-back']), 'a'));

    expect(chances).toHaveLength(1);
    expect(chances[0]!.chance).toBe(M.takeItBackChance);
    expect(chances[0]!.contestedAt, 'a strip is not contested — nothing is landing').toBeUndefined();
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(strikeChancesOf(heroStateOf(twoBuffs([]), 'a'))).toEqual([]);
  });

  /**
   * 🔴 **One buff, not the board.** Asserted as a delta — *"one fewer than before"* —
   * rather than as a total, because the count on a real champion has more than one
   * contributor and a total invites correcting the wrong one.
   */
  it('🔴 strips exactly one buff, leaving the rest standing', () => {
    const state = twoBuffs(['take-it-back']);
    const before = heroStateOf(state, 'd').statuses.filter((s) => s.kind === 'buff').length;
    const chance = strikeChancesOf(heroStateOf(state, 'a'))[0]!;

    const after = fold(state, chance.effects(strike(state, 'a', 'd')));
    const left = heroStateOf(after, 'd').statuses.filter((s) => s.kind === 'buff');

    expect(before, 'the fixture put two on').toBe(2);
    expect(left).toHaveLength(before - 1);
    expect(left[0]!.stat, 'the most recent goes — the thing they just gained').toBe('might');
  });
});

describe('Knocked Loose', () => {
  const boardWith = (runes: readonly string[]): BattleState =>
    board({ heroId: 'h25', runes }, [{ heroId: 'h21', row: 4, id: 'd' }]);

  /**
   * 🔴 **Routed through the existing contest, not a parallel one** (FR-018). The
   * declared potency is the tier-3 rung read from `status.ts` — if this rune ever
   * grew its own landing rule, `contestedAt` would be the field that stopped
   * carrying it, and this is what would notice.
   */
  it('declares a contest at the tier the design names', () => {
    const chances = strikeChancesOf(heroStateOf(boardWith(['knocked-loose']), 'a'));

    expect(chances).toHaveLength(1);
    expect(chances[0]!.chance).toBe(M.knockedLooseChance);
    expect(chances[0]!.contestedAt).toBe(potencyForTier(M.knockedLooseTier as Tier));
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(strikeChancesOf(heroStateOf(boardWith([]), 'a'))).toEqual([]);
  });

  it('🔴 stuns the target, attributed to the attacker', () => {
    const state = boardWith(['knocked-loose']);
    const chance = strikeChancesOf(heroStateOf(state, 'a'))[0]!;
    const effects = runeOnly(chance.effects(strike(state, 'a', 'd')));

    expect(effects).toHaveLength(1);
    const only = effects[0]!;
    if (only.kind !== 'status') throw new Error('expected a status effect');
    expect(only.bearerInstanceId).toBe('d');
    expect(only.status.kind).toBe('stun');
    expect(only.status.sourceInstanceId, 'the attacker applied it').toBe('a');
  });
});

describe('Both Ways', () => {
  const boardWith = (runes: readonly string[]): BattleState =>
    board({ heroId: 'h25' }, [{ heroId: 'h20', row: 4, id: 'd', runes }]);

  it('rolls on the defender, at the designed chance', () => {
    const chances = struckChancesOf(heroStateOf(boardWith(['both-ways']), 'd'));

    expect(chances).toHaveLength(1);
    expect(chances[0]!.chance).toBe(M.bothWaysChance);
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(struckChancesOf(heroStateOf(boardWith([]), 'd'))).toEqual([]);
  });

  /**
   * 🔴 **The bleed goes the other way**, which is the whole name. A version that
   * put it on the defender would still place a bleed, still be non-empty, and be
   * exactly backwards — so the bearer is asserted, not merely the kind.
   */
  it('🔴 bleeds the attacker, applied by the champion that was struck', () => {
    const state = boardWith(['both-ways']);
    const chance = struckChancesOf(heroStateOf(state, 'd'))[0]!;
    const effects = runeOnly(chance.effects(strike(state, 'a', 'd')));

    expect(effects).toHaveLength(1);
    const only = effects[0]!;
    if (only.kind !== 'status') throw new Error('expected a status effect');
    expect(only.bearerInstanceId, 'on whoever swung, not on the one who was hit').toBe('a');
    expect(only.status.kind).toBe('bleed');
    expect(only.status.sourceInstanceId, 'the struck champion applied it').toBe('d');
    expect(only.status.magnitude, 'scaled off the defender, not a flat number').toBeGreaterThan(0);
  });

  it('🔴 is not read as a strike chance — the two hooks are different sides', () => {
    expect(strikeChancesOf(heroStateOf(boardWith(['both-ways']), 'd'))).toEqual([]);
  });
});

describe('Further Than It Looks', () => {
  /**
   * h07 Ember Saelith: **reach 1, and `air` is her secondary**, so this rune is
   * genuinely in one of her pools. Chosen over h04 Zephyrine deliberately —
   * Zephyrine carries `Out of Reach`, which grants a reach status of its own, and a
   * fixture holding the thing under test's competitor is how three of US2's tests
   * failed against correct code.
   */
  const reachBoard = (runes: readonly string[]): BattleState =>
    board({ heroId: 'h07', runes }, [
      { heroId: 'h21', row: 4, id: 'd4' },
      { heroId: 'h27', row: 5, id: 'd5' },
    ]);

  const reachable = (state: BattleState): number =>
    legalTargets(state, 'a', tier0Of('h07')).candidates.length;

  it('rolls at turn start, at the designed chance', () => {
    const chances = turnStartChancesOf(heroStateOf(reachBoard(['further-than-it-looks']), 'a'));

    expect(chances).toHaveLength(1);
    expect(chances[0]!.chance).toBe(M.furtherThanItLooksChance);
  });

  it('🔴 does nothing without the rune — the control', () => {
    expect(turnStartChancesOf(heroStateOf(reachBoard([]), 'a'))).toEqual([]);
  });

  /**
   * 🔴 **The target LIST grows.** A test asserting only *"a reach status is
   * present"* would pass against a grant nothing reads — precisely the shape of
   * defect that let a whole status system sit unwired through 393 green tests. So
   * this asserts the thing the player actually gets.
   */
  it('🔴 opens a row that was out of reach, and the list is strictly larger', () => {
    const state = reachBoard(['further-than-it-looks']);
    const before = reachable(state);
    const chance = turnStartChancesOf(heroStateOf(state, 'a'))[0]!;

    const after = fold(state, chance.effects({ state, hero: heroStateOf(state, 'a') }));

    expect(before, 'reach 1 from row 3 touches row 4 only').toBe(1);
    expect(reachable(after)).toBeGreaterThan(before);
    expect(reachable(after), 'row 5 as well, not the whole board').toBe(2);
  });

  /** One turn means *this* turn: Resolution ticks it away at the bottom of it. */
  it('lasts exactly the turn it was granted', () => {
    const state = reachBoard(['further-than-it-looks']);
    const chance = turnStartChancesOf(heroStateOf(state, 'a'))[0]!;
    const granted = runeOnly(chance.effects({ state, hero: heroStateOf(state, 'a') }));

    expect(granted).toHaveLength(1);
    const only = granted[0]!;
    if (only.kind !== 'status') throw new Error('expected a status effect');
    expect(only.status.kind).toBe('reach');
    expect(only.status.magnitude).toBe(M.furtherThanItLooksReach);
    expect(only.status.turnsRemaining).toBe(M.furtherThanItLooksTurns);
  });
});
