/**
 * The thirteen Role and House passives (020 US2, T027–T032).
 *
 * ### What each test has to be careful about
 *
 * `hero.passives` had **no consumer at all** before this feature, so every
 * assertion here is about something that has never once run. The trap that shape
 * invites is an assertion an inert implementation would also satisfy — a hero
 * that gains nothing looks exactly like a hero whose passive did not fire.
 *
 * So every test below either **compares against a control** (the same board
 * without the trigger, or a champion of another House) or asserts a value that is
 * only reachable through the passive. `expect(x).toBeDefined()` proves nothing
 * here and is not used.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { damagePreview } from '../../rules/damage.js';
import { legalTargets } from '../../rules/targeting.js';
import { tickDurations } from '../../rules/status.js';
import {
  IMPLEMENTED_PASSIVES,
  PASSIVE_MAGNITUDES,
  applyPassiveEffects,
  hooksFor,
  onCrit,
  onDeath,
  onMissed,
  onStrike,
  penetrationBonusFor,
  shapeIncoming,
  shapeOutgoing,
  targetingFor,
  type StrikeContext,
} from '../../rules/passives.js';
import { maxHp } from '../../rules/damage.js';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { heroStateFor, stateOf, status, withHero } from './fixtures.js';

const M = PASSIVE_MAGNITUDES;

const tier0Of = (heroId: string): string => getHero(heroId).powers[0]!.id;

/** A board with a named attacker and any number of defenders. */
function board(
  attacker: { readonly heroId: string; readonly row: 1 | 2 | 3 },
  defenders: readonly { readonly heroId: string; readonly row: 4 | 5 | 6; readonly id: string }[],
  allies: readonly { readonly heroId: string; readonly row: 1 | 2 | 3; readonly id: string }[] = [],
): BattleState {
  return stateOf([
    heroStateFor(getHero(attacker.heroId), 'attacker', attacker.row, 'a'),
    ...allies.map((x) => heroStateFor(getHero(x.heroId), 'attacker', x.row, x.id)),
    ...defenders.map((d) => heroStateFor(getHero(d.heroId), 'defender', d.row, d.id)),
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

const statusesOf = (state: BattleState, id: string): readonly HeroState['statuses'][number][] =>
  heroStateOf(state, id).statuses;

// ---------------------------------------------------------------------------

describe('the registry', () => {
  it('implements the four Role, nine House and four settled unique passives', () => {
    expect(IMPLEMENTED_PASSIVES).toHaveLength(17);
  });

  /**
   * **Every champion carries two**, and that is the point of the feature: before
   * 020 a Role set a stat budget and vanished, and a House was a colour.
   */
  it('gives all 27 heroes at least their Role and their House', () => {
    const bare = getAllHeroes().filter((h) => hooksFor(h.id).length < 2);
    expect(bare.map((h) => h.name)).toEqual([]);
  });

  /**
   * **Read off `hero.passives`, never off `hero.role`.** The two agree today; a
   * re-authored roster is exactly when they would stop, and deriving from Role
   * would keep the engine silently right about a champion the content had changed.
   */
  it('reads the roster rather than deriving from Role or House', () => {
    const named = hooksFor('h02').map((h) => h.name);
    expect(named).toContain('Hold the Line');
    expect(named).toContain('The Deep Holds');
    expect(hooksFor('h01').map((h) => h.name)).not.toContain('Hold the Line');
  });

  /** Nineteen uniques are still names. A battle must not fail because of it. */
  it('skips a passive with no implementation instead of throwing', () => {
    expect(() => hooksFor('h22')).not.toThrow();
    expect(hooksFor('h22').map((h) => h.name)).not.toContain('Seams Everywhere');
  });
});

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

describe('Finish It — the Striker closes out', () => {
  const state = board({ heroId: 'h01', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('pays nothing while the target is above half pool', () => {
    expect(damagePreview(state, 'a', tier0Of('h01'), 'd').passiveMultiplier).toBe(1);
  });

  it('multiplies the blow once the target drops below half', () => {
    const pool = maxHp(heroStateOf(state, 'd'));
    const hurt = withHero(state, 'd', { hp: Math.floor(pool * 0.4) });

    const before = damagePreview(state, 'a', tier0Of('h01'), 'd');
    const after = damagePreview(hurt, 'a', tier0Of('h01'), 'd');

    expect(after.passiveMultiplier).toBeCloseTo(1 + M.roleDamageBonus, 10);
    expect(after.final).toBeGreaterThan(before.final);
  });

  /**
   * **Exactly at half is not below half.** A threshold this test did not pin would
   * be free to drift by one hit point in either direction and nothing would say so.
   */
  it('does not pay at exactly half', () => {
    const pool = maxHp(heroStateOf(state, 'd'));
    const half = withHero(state, 'd', { hp: pool / 2 });
    expect(damagePreview(half, 'a', tier0Of('h01'), 'd').passiveMultiplier).toBe(1);
  });

  /** The bonus is the attacker's, not the board's — a Tank in the same seat gets none. */
  it('belongs to the Striker and not to the position', () => {
    const tank = board({ heroId: 'h02', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);
    const pool = maxHp(heroStateOf(tank, 'd'));
    const hurt = withHero(tank, 'd', { hp: Math.floor(pool * 0.4) });
    expect(damagePreview(hurt, 'a', tier0Of('h02'), 'd').passiveMultiplier).toBe(1);
  });
});

describe('Measured Shot — the Ranged hero is paid for distance', () => {
  /** Vael in the middle row, an ally holding the front — rows 3 and 4 both occupied. */
  const far = board(
    { heroId: 'h06', row: 2 },
    [{ heroId: 'h19', row: 4, id: 'd' }],
    [{ heroId: 'h01', row: 3, id: 'ally' }],
  );
  const near = board({ heroId: 'h06', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('pays at distance 2', () => {
    expect(damagePreview(far, 'a', tier0Of('h06'), 'd').passiveMultiplier).toBeCloseTo(
      1 + M.roleDamageBonus,
      10,
    );
  });

  it('pays nothing at distance 1', () => {
    expect(damagePreview(near, 'a', tier0Of('h06'), 'd').passiveMultiplier).toBe(1);
  });

  /**
   * **Distance counts *occupied* rows**, so the bonus evaporates as the line
   * collapses — which is the pressure the whole Role is built around. Killing the
   * ally in front takes the same shot from 2 to 1 without anybody moving.
   */
  it('is lost when the row in front of it empties', () => {
    const collapsed = withHero(far, 'ally', { hp: 0 });
    expect(damagePreview(collapsed, 'a', tier0Of('h06'), 'd').passiveMultiplier).toBe(1);
  });
});

describe('Hold the Line and Behind the Line', () => {
  /** Ossic the tank beside Kaellis, both in the enemy front line. */
  const withTank = board({ heroId: 'h19', row: 3 }, [
    { heroId: 'h02', row: 4, id: 'tank' },
    { heroId: 'h01', row: 4, id: 'other' },
  ]);

  it('a tank compels every attacker that can reach it', () => {
    expect(targetingFor(withTank, 'a').compulsion).toEqual({ name: 'taunt', instanceId: 'tank' });
  });

  /**
   * **Row-scoped needs no row code.** `legalTargets` drops a compulsion naming
   * somebody out of reach, so a tank in the enemy back seat compels nobody — and
   * this asserts the *consequence* rather than restating the reach table.
   */
  it('a tank out of reach compels nobody', () => {
    const distant = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h01', row: 4, id: 'other' },
      { heroId: 'h03', row: 5, id: 'mid' },
      { heroId: 'h02', row: 6, id: 'tank' },
    ]);
    const { filters, compulsion } = targetingFor(distant, 'a');
    expect(legalTargets(distant, 'a', tier0Of('h19'), filters, compulsion).compelled).toBeNull();
  });

  it('a buffer is filtered out while anybody else is reachable', () => {
    const withBuffer = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h05', row: 4, id: 'buffer' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);
    const { filters, compulsion } = targetingFor(withBuffer, 'a');
    const legal = legalTargets(withBuffer, 'a', tier0Of('h19'), filters, compulsion);

    expect(legal.candidates).toEqual(['other']);
    expect(legal.filtersIgnored).toEqual([]);
  });

  /**
   * **Self-limiting**, and the invariant predates the passive by four features:
   * a filter that would empty the candidate set is ignored and recorded.
   */
  it('a buffer standing alone becomes targetable', () => {
    const alone = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h05', row: 4, id: 'buffer' }]);
    const { filters, compulsion } = targetingFor(alone, 'a');
    const legal = legalTargets(alone, 'a', tier0Of('h19'), filters, compulsion);

    expect(legal.candidates).toEqual(['buffer']);
    expect(legal.filtersIgnored).toEqual(['fade']);
  });
});

/**
 * **T029 — Tank and Buffer counter each other, and no code says so.**
 *
 * Cancellation lives in `composeTargeting` as one subtraction; both directions
 * fall out of it. This is the test the task called for *"with no implementation
 * behind it, deliberately"* — nothing below is a rule of its own.
 */
describe('🔴 taunt and fade cancel on the same hero', () => {
  it('fading a tank switches its taunt off', () => {
    const withTank = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h02', row: 4, id: 'tank' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);
    const faded = withHero(withTank, 'tank', { statuses: [status('fade', { turnsRemaining: 2 })] });

    const { filters, compulsion } = targetingFor(faded, 'a');
    const legal = legalTargets(faded, 'a', tier0Of('h19'), filters, compulsion);

    expect(compulsion).toBeNull();
    // ...and it is not hidden either. In both sets is in neither.
    expect([...legal.candidates].sort()).toEqual(['other', 'tank']);
  });

  it('taunting a buffer drags it into the open', () => {
    const withBuffer = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h05', row: 4, id: 'buffer' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);
    const taunted = withHero(withBuffer, 'buffer', {
      statuses: [status('taunt', { turnsRemaining: 2 })],
    });

    const { filters, compulsion } = targetingFor(taunted, 'a');
    const legal = legalTargets(taunted, 'a', tier0Of('h19'), filters, compulsion);

    expect([...legal.candidates].sort()).toEqual(['buffer', 'other']);
    expect(compulsion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

describe('The Deep Holds — Earth shortens control on itself', () => {
  const earth = heroStateFor(getHero('h02'), 'defender', 4, 'd');
  const slash = heroStateFor(getHero('h19'), 'defender', 4, 'd');

  /**
   * ⚠️ **Control is priced at exactly one turn**, so "one turn shorter" is
   * immunity for the three Earth champions. The magnitude is derived — it is 1
   * because `CONTROL_DURATION` is 1 — and this test states the consequence out
   * loud so nobody rediscovers it as a bug report.
   */
  it('refuses a one-turn stun outright', () => {
    expect(shapeIncoming(earth, status('stun', { turnsRemaining: 1 }))).toBeNull();
    expect(shapeIncoming(slash, status('stun', { turnsRemaining: 1 }))).not.toBeNull();
  });

  /** Not absolute: `Banked Coals` puts control at two turns, and one gets through. */
  it('shortens an extended control rather than refusing it', () => {
    expect(shapeIncoming(earth, status('stun', { turnsRemaining: 2 }))?.turnsRemaining).toBe(1);
  });

  it('leaves everything that is not control alone', () => {
    const burn = status('burn', { turnsRemaining: 2, magnitude: 9 });
    expect(shapeIncoming(earth, burn)).toEqual(burn);
  });
});

describe('Never Where You Struck — Air gains Agility after being missed', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h06', row: 4, id: 'd' }]);

  it('grants the tier-1 stat change in Agility', () => {
    const effects = onMissed(strike(state, 'a', 'd'));
    const next = applyPassiveEffects(state, effects, maxHp);
    const gained = statusesOf(next, 'd');

    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({
      kind: 'buff',
      stat: 'agility',
      magnitude: M.missedAgility,
    });
  });

  it('is the defender’s own passive, not the attacker’s', () => {
    const noAir = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    expect(onMissed(strike(noAir, 'a', 'd'))).toEqual([]);
  });
});

describe('It Catches — a Fire burn escalates', () => {
  const ember = heroStateFor(getHero('h07'), 'attacker', 3, 'a');
  const kaellis = heroStateFor(getHero('h19'), 'attacker', 3, 'a');

  it('sets the escalation `upkeepDamage` already reads', () => {
    const shaped = shapeOutgoing(ember, status('burn', { magnitude: 10, turnsRemaining: 3 }));
    expect(shaped.escalation).toBe(M.itCatchesEscalation);
  });

  it('leaves a non-Fire champion’s burn flat', () => {
    expect(shapeOutgoing(kaellis, status('burn', { magnitude: 10 })).escalation).toBe(0);
  });

  /** `05-status.md` says *a burn*, and widening it later is the cheap direction. */
  it('does not touch bleed or poison', () => {
    expect(shapeOutgoing(ember, status('bleed', { magnitude: 10 })).escalation).toBe(0);
  });
});

describe('Wears Through — a Water shred persists', () => {
  const marisel = heroStateFor(getHero('h10'), 'attacker', 3, 'a');
  const kaellis = heroStateFor(getHero('h19'), 'attacker', 3, 'a');

  it('survives every countdown it is put through', () => {
    const shaped = shapeOutgoing(marisel, status('shred', { stat: 'armor', magnitude: 0.3 }));

    let alive = [shaped];
    for (let turn = 0; turn < 20; turn++) alive = [...tickDurations(alive)];

    expect(alive).toHaveLength(1);
    expect(alive[0]!.magnitude).toBe(0.3);
  });

  it('leaves another House’s shred on its ordinary clock', () => {
    const shaped = shapeOutgoing(kaellis, status('shred', { stat: 'armor', magnitude: 0.3 }));
    expect(tickDurations([shaped])).toHaveLength(0);
  });
});

describe('Nothing Stays Hidden — Light ignores fade', () => {
  const withBuffer = (attackerHeroId: string): BattleState =>
    board({ heroId: attackerHeroId, row: 3 }, [
      { heroId: 'h05', row: 4, id: 'buffer' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);

  it('lets a Light champion pick the faded Buffer', () => {
    const state = withBuffer('h13');
    const { filters, compulsion } = targetingFor(state, 'a');
    const legal = legalTargets(state, 'a', tier0Of('h13'), filters, compulsion);
    expect([...legal.candidates].sort()).toEqual(['buffer', 'other']);
  });

  it('and nobody else can', () => {
    const state = withBuffer('h19');
    const { filters, compulsion } = targetingFor(state, 'a');
    expect(legalTargets(state, 'a', tier0Of('h19'), filters, compulsion).candidates).toEqual([
      'other',
    ]);
  });
});

describe('The Veil Closes — Dark feeds on a nearby death', () => {
  const state = board({ heroId: 'h16', row: 3 }, [
    { heroId: 'h19', row: 4, id: 'near' },
    { heroId: 'h20', row: 5, id: 'mid' },
    { heroId: 'h21', row: 6, id: 'far' },
  ]);
  const hurt = withHero(state, 'a', { hp: 20 });

  it('restores hit points when somebody falls within reach', () => {
    const fallen = heroStateOf(hurt, 'near');
    const after = applyPassiveEffects(hurt, onDeath(hurt, fallen), maxHp);
    expect(heroStateOf(after, 'a').hp).toBeGreaterThan(20);
  });

  it('does nothing for a death it could not have reached', () => {
    const fallen = heroStateOf(hurt, 'far');
    const after = applyPassiveEffects(hurt, onDeath(hurt, fallen), maxHp);
    expect(heroStateOf(after, 'a').hp).toBe(20);
  });

  /** Feeding is not clemency: the heal cannot push past the pool. */
  it('never overfills the pool', () => {
    const fallen = heroStateOf(state, 'near');
    const after = applyPassiveEffects(state, onDeath(state, fallen), maxHp);
    const nyxara = heroStateOf(after, 'a');
    expect(nyxara.hp).toBe(maxHp(nyxara));
  });

  /** Dark's signature is endings, not allegiance — an ally's death counts too. */
  it('counts a death on either side', () => {
    const withAlly = stateOf([
      heroStateFor(getHero('h16'), 'attacker', 3, 'a'),
      heroStateFor(getHero('h01'), 'attacker', 3, 'ally'),
      heroStateFor(getHero('h19'), 'defender', 4, 'd'),
    ]);
    const wounded = withHero(withAlly, 'a', { hp: 20 });
    const after = applyPassiveEffects(
      wounded,
      onDeath(wounded, heroStateOf(wounded, 'ally')),
      maxHp,
    );
    expect(heroStateOf(after, 'a').hp).toBeGreaterThan(20);
  });
});

describe('The Cut Reopens — Slash bleeds on a crit', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  it('opens a bleed the ordinary strike does not', () => {
    expect(onStrike(strike(state, 'a', 'd'))).toEqual([]);

    const after = applyPassiveEffects(state, onCrit(strike(state, 'a', 'd')), maxHp);
    const bled = statusesOf(after, 'd');

    expect(bled).toHaveLength(1);
    expect(bled[0]!.kind).toBe('bleed');
    expect(bled[0]!.magnitude).toBeGreaterThan(0);
  });

  /**
   * **A different source from a rider bleed**, so the two stack toward the cap of
   * three instead of refreshing each other into one. That is what the
   * `passive:` power id buys.
   */
  it('is a different source from the same hero’s authored riders', () => {
    const after = applyPassiveEffects(state, onCrit(strike(state, 'a', 'd')), maxHp);
    expect(statusesOf(after, 'd')[0]!.sourcePowerId).toBe('passive:The Cut Reopens');
  });

  it('does nothing for another House', () => {
    const earth = board({ heroId: 'h01', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);
    expect(onCrit(strike(earth, 'a', 'd'))).toEqual([]);
  });
});

describe('Find the Seam — Pierce sharpens against a repeat target', () => {
  const state = board({ heroId: 'h22', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  it('pays nothing on the first strike', () => {
    expect(penetrationBonusFor(strike(state, 'a', 'd'))).toBe(0);
  });

  /**
   * The mark is placed by `onStrike` and read by `damagePreview`, and the preview
   * runs first — so the count a swing reads is the count *before* it. That
   * ordering is what makes "repeat" mean repeat.
   */
  it('rises with the marks the strike itself leaves', () => {
    let next = state;
    const seen: number[] = [];

    for (let i = 0; i < 3; i++) {
      seen.push(penetrationBonusFor(strike(next, 'a', 'd')));
      next = applyPassiveEffects(next, onStrike(strike(next, 'a', 'd')), maxHp);
    }

    expect(seen).toEqual([0, M.findTheSeamStep, M.findTheSeamStep * 2]);
  });

  it('stops at the cap', () => {
    const marked = withHero(state, 'd', {
      statuses: [
        status('mark', {
          magnitude: 40,
          sourceInstanceId: 'a',
          sourcePowerId: 'passive:Find the Seam',
        }),
      ],
    });
    expect(penetrationBonusFor(strike(marked, 'a', 'd'))).toBe(M.findTheSeamCap);
  });

  /** A mark another hero left is not this hero's to read. */
  it('reads only its own marks', () => {
    const someoneElse = withHero(state, 'd', {
      statuses: [
        status('mark', {
          magnitude: 5,
          sourceInstanceId: 'somebody',
          sourcePowerId: 'passive:Find the Seam',
        }),
      ],
    });
    expect(penetrationBonusFor(strike(someoneElse, 'a', 'd'))).toBe(0);
  });
});

describe('Nothing Holds — Crush shaves Armor, and it stacks', () => {
  const state = board({ heroId: 'h25', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  const shredOf = (s: BattleState): number =>
    statusesOf(s, 'd').find((x) => x.kind === 'shred')?.magnitude ?? 0;

  it('accumulates rather than refreshing', () => {
    let next = state;
    const seen: number[] = [];

    for (let i = 0; i < 3; i++) {
      next = applyPassiveEffects(next, onStrike(strike(next, 'a', 'd')), maxHp);
      seen.push(Number(shredOf(next).toFixed(4)));
    }

    expect(seen).toEqual([0.05, 0.1, 0.15]);
  });

  /** The cap is the `large` shred band, reached exactly rather than overshot. */
  it('caps at the large band and stops there', () => {
    let next = state;
    for (let i = 0; i < 20; i++) {
      next = applyPassiveEffects(next, onStrike(strike(next, 'a', 'd')), maxHp);
    }
    expect(shredOf(next)).toBeCloseTo(M.nothingHoldsCap, 10);
  });

  /** The shred is real: it has to move a damage number, not just a status list. */
  it('makes the next blow land harder', () => {
    const before = damagePreview(state, 'a', tier0Of('h25'), 'd').final;

    let next = state;
    for (let i = 0; i < 8; i++) {
      next = applyPassiveEffects(next, onStrike(strike(next, 'a', 'd')), maxHp);
    }

    expect(damagePreview(next, 'a', tier0Of('h25'), 'd').final).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// The four settled uniques
// ---------------------------------------------------------------------------

describe('the uniques whose effect was already authored', () => {
  const earth = heroStateFor(getHero('h02'), 'defender', 4, 'd');
  const ember = heroStateFor(getHero('h07'), 'attacker', 3, 'a');
  const umbriel = heroStateFor(getHero('h17'), 'attacker', 3, 'a');
  const cindara = heroStateFor(getHero('h09'), 'attacker', 3, 'a');
  const kaellis = heroStateFor(getHero('h19'), 'attacker', 3, 'a');

  it('Immovable — Mauless is not compelled by a taunting tank', () => {
    const state = board({ heroId: 'h27', row: 3 }, [
      { heroId: 'h02', row: 4, id: 'tank' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);
    expect(targetingFor(state, 'a').compulsion).toBeNull();

    // ...and a champion without it still is, on the same board.
    const ordinary = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h02', row: 4, id: 'tank' },
      { heroId: 'h01', row: 4, id: 'other' },
    ]);
    expect(targetingFor(ordinary, 'a').compulsion).not.toBeNull();
  });

  it('Never Quite Out — her burns cannot be cleansed, and still expire', () => {
    const sealed = shapeOutgoing(ember, status('burn', { magnitude: 9, turnsRemaining: 2 }));
    expect(sealed.cleansable).toBe(false);
    // The whole of the passive: removal is refused, the clock is not.
    expect(tickDurations([sealed])[0]?.turnsRemaining).toBe(1);
    expect(shapeOutgoing(kaellis, status('burn')).cleansable).toBe(true);
  });

  it('Written in Pencil — her debuffs, and only her debuffs', () => {
    expect(shapeOutgoing(umbriel, status('debuff', { stat: 'might' })).cleansable).toBe(false);
    expect(shapeOutgoing(umbriel, status('burn')).cleansable).toBe(true);
  });

  it('Banked Coals — one turn longer, and no more magnitude', () => {
    const longer = shapeOutgoing(cindara, status('burn', { magnitude: 9, turnsRemaining: 2 }));
    expect(longer.turnsRemaining).toBe(3);
    expect(longer.magnitude).toBe(9);
  });

  /**
   * **The only interaction that puts control above one turn**, and therefore the
   * only thing that gets through Earth's House rule. Outgoing shaping runs first,
   * so a two-turn stun meets `−1` and lands for one.
   */
  it('Banked Coals is what lets Cindara stun an Earth champion', () => {
    const hers = shapeOutgoing(cindara, status('stun', { turnsRemaining: 1 }));
    expect(shapeIncoming(earth, hers)?.turnsRemaining).toBe(1);

    // Anybody else's one-turn stun is still refused outright.
    expect(shapeIncoming(earth, shapeOutgoing(kaellis, status('stun', { turnsRemaining: 1 })))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T032 — suppressed versus active
// ---------------------------------------------------------------------------

/**
 * **SC-002: every one of the thirteen changes the board.**
 *
 * The per-passive suites above each compare against a control, which is the same
 * claim one passive at a time. This one asserts the *coverage* — that no name in
 * the registry is an empty object somebody added to make a count come out right.
 *
 * It cannot be satisfied by an inert hook: a `PassiveHooks` with no callable
 * field contributes nothing to any of the six collectors.
 */
describe('🔴 every implemented passive has a reachable hook', () => {
  it('leaves no name in the registry doing nothing', () => {
    const inert: string[] = [];

    for (const hero of getAllHeroes()) {
      for (const hooks of hooksFor(hero.id)) {
        const reachable =
          Boolean(hooks.damageMultiplier) ||
          Boolean(hooks.penetrationBonus) ||
          Boolean(hooks.onStrike) ||
          Boolean(hooks.onCrit) ||
          Boolean(hooks.onMissed) ||
          Boolean(hooks.onDeathNearby) ||
          Boolean(hooks.shapeOutgoing) ||
          Boolean(hooks.shapeIncoming) ||
          Boolean(hooks.targeting);
        if (!reachable) inert.push(hooks.name);
      }
    }

    expect([...new Set(inert)]).toEqual([]);
  });
});
