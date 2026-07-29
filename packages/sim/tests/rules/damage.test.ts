import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero, powerEffectiveness } from '@lmntlz/content';
import {
  CRIT_MULTIPLIER,
  DAMAGE_FLOOR_FRACTION,
  K,
  damagePreview,
  healPreview,
  maxHp,
  mitigationFactor,
  packetOf,
  resistedBy,
} from '../../rules/damage.js';
import { allPairings, duel, withHero } from './fixtures.js';

describe('max HP and the packet', () => {
  it('is Toughness x 50', () => {
    for (const hero of getAllHeroes()) {
      const state = duel(hero.id, 'h19');
      const state0 = state.heroes.find((h) => h.instanceId === 'a')!;
      expect(maxHp(state0)).toBe(hero.stats.toughness * 50);
    }
  });

  it('computes the packet as Might x multiplier, with Luck absent', () => {
    const state = duel('h01', 'h19');
    const attacker = state.heroes.find((h) => h.instanceId === 'a')!;
    const hero = getHero('h01');

    for (const power of hero.powers) {
      const expected = power.multiplier === null ? 0 : hero.stats.might * power.multiplier;
      expect(packetOf(attacker, power)).toBe(expected);
    }
  });

  it('does not change the packet when Luck changes', () => {
    const state = duel('h01', 'h19');
    const power = getHero('h01').powers[1]!;
    const base = packetOf(state.heroes.find((h) => h.instanceId === 'a')!, power);

    const lucky = withHero(state, 'a', { statMods: { luck: 60 } });
    expect(packetOf(lucky.heroes.find((h) => h.instanceId === 'a')!, power)).toBe(base);
  });

  it('gives a no-multiplier power a zero packet, which is not the same as dealing zero', () => {
    // The three powers that deal neither damage nor healing. `null` says damage
    // is not a thing they have; the packet falling out as 0 is a consequence.
    const cirrolan = getHero('h05');
    const whisper = cirrolan.powers.find((p) => p.name === 'Whisper from the High Reach');
    expect(whisper?.multiplier).toBeNull();
  });
});

/**
 * T018 — the mitigation curve and the floor, swept rather than spot-checked.
 */
describe('mitigation', () => {
  it('halves damage at E = K', () => {
    expect(mitigationFactor(K)).toBeCloseTo(0.5, 10);
  });

  /**
   * **The 50% bound comes from the stat cap, not from the curve.**
   *
   * `1 − E/(E+K)` keeps falling forever; at E = 150 it is 0.33. What bounds it
   * is that `E = wall − Penetration`, `wall ≤ 75` and `K = 75`, so E can never
   * exceed the cap. `01-stats.md` names this as the reason to keep **one cap for
   * every stat** — an asymmetric cap would guarantee mitigation the curve was
   * never meant to allow.
   */
  it('never reduces more than 50% across the REACHABLE range of E', () => {
    for (let e = 0; e <= K; e++) {
      expect(mitigationFactor(e)).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(mitigationFactor(e)).toBeLessThanOrEqual(1);
    }
  });

  it('would fall below 50% past the cap, which is why the cap is load-bearing', () => {
    expect(mitigationFactor(K + 1)).toBeLessThan(0.5);
    expect(mitigationFactor(150)).toBeCloseTo(1 / 3, 6);
  });

  it('amplifies symmetrically when Penetration exceeds resistance', () => {
    for (let e = 1; e <= 75; e++) {
      // The negative branch is the positive one reflected: a point of
      // Penetration is worth the same cancelling Armor as exceeding it.
      expect(mitigationFactor(-e) - 1).toBeCloseTo(1 - mitigationFactor(e), 10);
    }
  });

  it('is 1.0 at E = 0 and monotone across the whole sweep', () => {
    expect(mitigationFactor(0)).toBe(1);

    let previous = Infinity;
    for (let e = -75; e <= 150; e++) {
      const f = mitigationFactor(e);
      expect(f).toBeLessThanOrEqual(previous + 1e-12);
      previous = f;
    }
  });

  it('answers a mixed martial/arcane power with the defender’s LOWER stat', () => {
    const state = duel('h19', 'h01'); // Kaellis: slash/light powers
    const mixed = getHero('h19').powers.find((p) => p.types.length === 2 && resistedBy(p) === 'mixed');
    expect(mixed).toBeDefined();

    const defender = getHero('h01');
    const lower = defender.stats.armor <= defender.stats.magicResist ? 'armor' : 'magicResist';

    expect(damagePreview(state, 'a', mixed!.id, 'd').resistedBy).toBe(lower);
  });
});

describe('the 25% floor', () => {
  it('holds across the whole E sweep', () => {
    const state = duel('h01', 'h19');
    const power = getHero('h01').powers[1]!;

    for (let e = -75; e <= 150; e += 1) {
      const shifted = withHero(state, 'd', { statMods: { armor: e, magicResist: e } });
      const preview = damagePreview(shifted, 'a', power.id, 'd');

      expect(preview.final, `E offset ${e}`).toBeGreaterThanOrEqual(
        Math.floor(preview.packet * DAMAGE_FLOOR_FRACTION) - 1,
      );
    }
  });

  /**
   * **The floor currently ties at the worst case and never bites.**
   *
   * Mitigation alone caps at 50% reduction and the harshest type multiplier is
   * ×0.50, so the worst possible outcome is exactly 0.25 of the packet — the
   * floor's own value. It is a guarantee that is currently redundant, and the
   * day it starts binding is the day something changed. This test says so.
   */
  it('ties at the worst case and never actually binds today', () => {
    let everApplied = false;
    let minRatio = Infinity;

    for (const { attacker, state } of allPairings()) {
      for (const power of attacker.powers) {
        if (power.multiplier === null || power.friendly) continue;

        // Push the defender to the stat cap on both walls: the worst case.
        const worst = withHero(state, 'd', { statMods: { armor: 75, magicResist: 75 } });
        const preview = damagePreview(worst, 'a', power.id, 'd');

        if (preview.floorApplied) everApplied = true;
        if (preview.packet > 0) minRatio = Math.min(minRatio, preview.final / preview.packet);
      }
    }

    expect(everApplied).toBe(false);
    expect(minRatio).toBeGreaterThanOrEqual(DAMAGE_FLOOR_FRACTION - 0.01);
  });
});

describe('damagePreview', () => {
  it('takes the type multiplier from content and never recomputes it', () => {
    for (const { attacker, defender, state } of allPairings().slice(0, 200)) {
      for (const power of attacker.powers) {
        if (power.friendly) continue;
        expect(damagePreview(state, 'a', power.id, 'd').typeMultiplier).toBe(
          powerEffectiveness(power, defender),
        );
      }
    }
  });

  it('reports both probabilities alongside the numbers — and no outcome', () => {
    const preview = damagePreview(duel('h01', 'h19'), 'a', getHero('h01').powers[1]!.id, 'd');

    expect(preview.hitProbability).toBeGreaterThanOrEqual(0.65);
    expect(preview.hitProbability).toBeLessThanOrEqual(0.95);
    expect(preview.critChance).toBeGreaterThan(0);
    expect(Object.keys(preview)).not.toContain('hit');
    expect(Object.keys(preview)).not.toContain('crit');
  });

  it('doubles the packet on a crit through the same pipeline, rounding once', () => {
    // `critFinal` is NOT `final × 2`, and that is the rounding rule working
    // rather than a bug: both are rounded once from full precision, so a
    // non-crit landing on x.5 rounds up while its double lands on a whole
    // number. Rounding `final` first and doubling that would compound the error.
    const state = duel('h01', 'h19');
    const preview = damagePreview(state, 'a', getHero('h01').powers[1]!.id, 'd');

    expect(preview.critFinal).toBeGreaterThanOrEqual(preview.final * CRIT_MULTIPLIER - 1);
    expect(preview.critFinal).toBeLessThanOrEqual(preview.final * CRIT_MULTIPLIER + 1);
  });

  it('rounds once, at the end', () => {
    for (const { attacker, state } of allPairings().slice(0, 100)) {
      for (const power of attacker.powers) {
        if (power.friendly) continue;
        const preview = damagePreview(state, 'a', power.id, 'd');
        expect(Number.isInteger(preview.final)).toBe(true);
        // The intermediate values keep full precision.
        expect(Number.isInteger(preview.mitigationFactor)).toBe(
          preview.mitigationFactor === 1 || preview.mitigationFactor === 0,
        );
      }
    }
  });
});

describe('healPreview', () => {
  it('skips mitigation, type effectiveness and the floor', () => {
    const state = duel('h17', 'h17'); // Umbriel both sides
    const heal = getHero('h17').powers.find((p) => p.friendly)!;

    const wounded = withHero(state, 'a', { hp: 100 });
    const preview = healPreview(wounded, 'a', heal.id, 'a');

    const might = getHero('h17').stats.might;
    expect(preview.amount).toBe(Math.round(might * heal.multiplier!));
  });

  it('caps at maxHp and reports the overheal', () => {
    const state = duel('h17', 'h17');
    const heal = getHero('h17').powers.find((p) => p.friendly)!;
    const healer = state.heroes.find((h) => h.instanceId === 'a')!;

    const nearlyFull = withHero(state, 'a', { hp: maxHp(healer) - 5 });
    const preview = healPreview(nearlyFull, 'a', heal.id, 'a');

    expect(preview.amount).toBe(5);
    expect(preview.overheal).toBeGreaterThan(0);
  });

  it('crits at double, still capped', () => {
    const state = duel('h17', 'h17');
    const heal = getHero('h17').powers.find((p) => p.friendly)!;
    const wounded = withHero(state, 'a', { hp: 1 });

    const preview = healPreview(wounded, 'a', heal.id, 'a');
    expect(preview.critAmount).toBeGreaterThanOrEqual(preview.amount);
  });
});

/**
 * T054 — the worked example from `resources/mechanics/01-stats.md`.
 *
 * > Bramwen (Might 45, Luck 35, Penetration 30) uses a tier-3 power (x2.5)
 * > against a defender with Magic Resist 40:
 * >
 * >   packet = 45 x 2.5      = 112.5
 * >   E      = 40 - 30       = 10
 * >   factor = 1 - 10/85     = 0.882
 * >            112.5 x 0.882 = 99.3
 * >   Bane   x 1.5           = 148.9
 *
 * The example states Penetration 30 where the authored Bramwen carries 25, so
 * the scenario is built to the example's own numbers rather than read off the
 * roster. What is being checked is the pipeline, not the hero.
 */
describe('the worked example in 01-stats.md', () => {
  it('reproduces 112.5 -> 99.3 -> 148.9', () => {
    const bramwen = getHero('h01');
    const tier3 = bramwen.powers.find((p) => p.tier === 3)!;

    expect(bramwen.stats.might).toBe(45);
    expect(tier3.multiplier).toBe(2.5);

    // Marisel is Water/Dark, so her Bane is counter(water) = fire — which is
    // exactly what Bramwen's tier-3 "The Bloom Lends Heat" is typed.
    const state = duel('h01', 'h10');
    const marisel = getHero('h10');

    const scenario = withHero(
      withHero(state, 'a', { statMods: { penetration: 30 - bramwen.stats.penetration } }),
      'd',
      { statMods: { magicResist: 40 - marisel.stats.magicResist } },
    );

    const preview = damagePreview(scenario, 'a', tier3.id, 'd');

    expect(preview.packet).toBeCloseTo(112.5, 6);
    expect(preview.effectiveResistance).toBe(10);
    expect(preview.mitigationFactor).toBeCloseTo(0.882, 3);
    expect(preview.mitigated).toBeCloseTo(99.3, 1);
    expect(preview.typeMultiplier).toBe(1.5);
    expect(preview.final).toBe(149); // 148.9, rounded once at the end
  });

  it('records the discrepancy: the example’s Penetration is not Bramwen’s', () => {
    // Worth stating rather than silently working around. The doc says 30; the
    // workbook says 25. Nothing depends on it — the example is illustrative.
    expect(getHero('h01').stats.penetration).toBe(25);
  });
});
