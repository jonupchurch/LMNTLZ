/**
 * `firingProfile` — the computation the squad builder is judged against.
 *
 * Two halves, and they defend against opposite mistakes:
 *
 * - **Half one** proves the simulation is right, using the exact rank-1 closed
 *   form as an independent oracle over all 19,440 hero × ordering pairs. It is
 *   the thing that catches an off-by-one in the cooldown tick, which is the
 *   error most likely to be here and the least likely to look wrong.
 * - **Half two** proves the closed form cannot be *generalised* — that the naive
 *   `1/(cooldown+1)` availability is badly wrong below the top rank — so nobody
 *   later "optimises" the simulation away and quietly halves every defense.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import {
  BATTLE_TURNS,
  SWEEP_TURNS,
  firingProfile,
  nextAvailableTurn,
  rankOneFiringCount,
  type PowerRanking,
} from '../../rules/firingProfile.js';

/** All 720 orderings of the six tiers, highest priority first. */
function allOrderings(): readonly PowerRanking[] {
  const out: PowerRanking[] = [];
  const walk = (chosen: number[], left: readonly number[]): void => {
    if (left.length === 0) {
      out.push(chosen as unknown as PowerRanking);
      return;
    }
    for (const tier of left) {
      walk([...chosen, tier], left.filter((t) => t !== tier));
    }
  };
  walk([], [0, 1, 2, 3, 4, 5]);
  return out;
}

const ORDERINGS = allOrderings();
const ROSTER = getAllHeroes();

const powerOfTier = (heroId: string, tier: number) => {
  const found = getHero(heroId).powers.find((p) => p.tier === tier);
  if (!found) throw new Error(`hero ${heroId} has no tier-${tier} power`);
  return found;
};

describe('the ordering space itself', () => {
  it('is 720 orderings and 19,440 hero × ordering pairs', () => {
    expect(ORDERINGS).toHaveLength(720);
    expect(ROSTER).toHaveLength(27);
    expect(ORDERINGS.length * ROSTER.length).toBe(19_440);
  });

  it('gives every ordering all six tiers exactly once', () => {
    for (const ordering of ORDERINGS) {
      expect([...ordering].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

// ---------------------------------------------------------------------------
// Half one — the rank-1 closed form as the oracle (T009)
// ---------------------------------------------------------------------------

describe('the rank-1 closed form', () => {
  it('is floor((T − gate)/(cooldown + 1)) + 1, floored at zero', () => {
    // Fires on turns 1, 4, 7, 10 within a 10-turn horizon.
    expect(rankOneFiringCount(2, 1, 10)).toBe(4);
    // The gate is past the horizon entirely — a tier 5 in a four-turn battle.
    expect(rankOneFiringCount(7, 5, 4)).toBe(0);
    // The clamp earns its place here: the raw expression returns −3.
    expect(rankOneFiringCount(0, 5, 1)).toBe(0);
    // Cooldown 0 fires every turn from its gate.
    expect(rankOneFiringCount(0, 1, 9)).toBe(9);
  });

  it('agrees with `nextAvailableTurn`, which is the rule it is derived from', () => {
    let turn = 1;
    let fires = 0;
    while (turn <= 20) {
      fires++;
      turn = nextAvailableTurn(turn, 3);
    }
    expect(fires).toBe(rankOneFiringCount(3, 1, 20));
  });

  it.each([BATTLE_TURNS, 20, SWEEP_TURNS])(
    'matches the simulated top-rank count on all 19,440 pairs at %i turns',
    (turns) => {
      let checked = 0;

      for (const hero of ROSTER) {
        for (const ordering of ORDERINGS) {
          const topTier = ordering[0];
          const power = powerOfTier(hero.id, topTier);
          const profile = firingProfile(hero, ordering, turns);
          const entry = profile.find((e) => e.tier === topTier);

          expect(entry).toBeDefined();
          expect(entry!.fires).toBe(rankOneFiringCount(power.cooldown, power.gateTurn, turns));
          checked++;
        }
      }

      expect(checked).toBe(19_440);
    },
  );
});

// ---------------------------------------------------------------------------
// Half two — the naive form is wrong below the top rank (T010)
// ---------------------------------------------------------------------------

describe('the naive 1/(cooldown+1) form', () => {
  const BRAMWEN = getHero('h01');
  const GREEDY: PowerRanking = [5, 4, 3, 2, 1, 0];

  it('reproduces the recorded Bramwen figures exactly, at 60 turns', () => {
    const profile = firingProfile(BRAMWEN, GREEDY, SWEEP_TURNS);
    const share = (tier: number) => profile.find((e) => e.tier === tier)!.share;

    // research.md Q2, to three decimals.
    expect(share(5)).toBeCloseTo(0.117, 3);
    expect(share(4)).toBeCloseTo(0.167, 3);
    expect(share(3)).toBeCloseTo(0.25, 3);
    expect(share(2)).toBeCloseTo(0.25, 3);
    expect(share(1)).toBeCloseTo(0.183, 3);
    expect(share(0)).toBeCloseTo(0.033, 3);
  });

  it('disagrees at ranks 4–6 — tier 1 is 0.183, not 0.500; tier 0 is 0.033, not 1.000', () => {
    const profile = firingProfile(BRAMWEN, GREEDY, SWEEP_TURNS);

    for (const rank of [3, 4, 5]) {
      const tier = GREEDY[rank]!;
      const naive = 1 / (powerOfTier(BRAMWEN.id, tier).cooldown + 1);
      const simulated = profile.find((e) => e.tier === tier)!.share;

      // Not "close" — meaningfully lower. A power's share is its availability
      // in the GAPS everything above it leaves, and by rank 4 there are few.
      expect(simulated).toBeLessThan(naive);
    }

    const naiveTier1 = 1 / (powerOfTier(BRAMWEN.id, 1).cooldown + 1);
    const naiveTier0 = 1 / (powerOfTier(BRAMWEN.id, 0).cooldown + 1);
    expect(naiveTier1).toBe(0.5);
    expect(naiveTier0).toBe(1);
  });

  it('coincides at ranks 2 and 3, which is exactly why it looks correct', () => {
    const profile = firingProfile(BRAMWEN, GREEDY, SWEEP_TURNS);

    for (const rank of [1, 2]) {
      const tier = GREEDY[rank]!;
      const naive = 1 / (powerOfTier(BRAMWEN.id, tier).cooldown + 1);
      expect(profile.find((e) => e.tier === tier)!.share).toBeCloseTo(naive, 3);
    }
  });

  it('accounts for every turn — the shares sum to 1, because a hero always acts', () => {
    const profile = firingProfile(BRAMWEN, GREEDY, SWEEP_TURNS);
    const fires = profile.reduce((n, e) => n + e.fires, 0);
    expect(fires).toBe(SWEEP_TURNS);
  });
});

// ---------------------------------------------------------------------------
// The horizon, and the hazard the whole feature exists for
// ---------------------------------------------------------------------------

describe('the horizon', () => {
  it('defaults to BATTLE_TURNS — six, the median a surviving hero acts', () => {
    expect(BATTLE_TURNS).toBe(6);
    const bramwen = getHero('h01');
    expect(firingProfile(bramwen, [5, 4, 3, 2, 1, 0])).toEqual(
      firingProfile(bramwen, [5, 4, 3, 2, 1, 0], BATTLE_TURNS),
    );
    // ...and is genuinely NOT the old nine, or the default would be untested.
    expect(firingProfile(bramwen, [5, 4, 3, 2, 1, 0])).not.toEqual(
      firingProfile(bramwen, [5, 4, 3, 2, 1, 0], 9),
    );
  });

  it('reports tier 0 as dead at 9 turns under greedy, where 60 turns says 3.3%', () => {
    const bramwen = getHero('h01');
    const at9 = firingProfile(bramwen, [5, 4, 3, 2, 1, 0], 9);
    const at60 = firingProfile(bramwen, [5, 4, 3, 2, 1, 0], 60);

    expect(at9.find((e) => e.tier === 0)!.fires).toBe(0);
    expect(at60.find((e) => e.tier === 0)!.fires).toBeGreaterThan(0);
  });

  it('switches a power off entirely when it is ranked below tier 0 — the hazard', () => {
    // Tier 0 has cooldown 0 and no gate, so it is available every turn and
    // nothing below it ever fires. `1·2·3·4·5·0` is the worst legal ranking and
    // `0·…` is worse still: it kills all five.
    for (const hero of ROSTER) {
      const profile = firingProfile(hero, [0, 5, 4, 3, 2, 1], BATTLE_TURNS);
      expect(profile.find((e) => e.tier === 0)!.fires).toBe(BATTLE_TURNS);
      for (const tier of [1, 2, 3, 4, 5]) {
        expect(profile.find((e) => e.tier === tier)!.fires).toBe(0);
      }
    }
  });

  it('names the power, so a warning can say which one died rather than which index', () => {
    const bramwen = getHero('h01');
    const profile = firingProfile(bramwen, [0, 5, 4, 3, 2, 1]);
    const dead = profile.filter((e) => e.fires === 0).map((e) => e.powerId);

    expect(dead).toContain('Wrath of the Slow Stone');
    expect(dead).toHaveLength(5);
  });

  it('returns entries in ranking order, highest priority first', () => {
    const profile = firingProfile(getHero('h01'), [3, 5, 4, 2, 1, 0]);
    expect(profile.map((e) => e.tier)).toEqual([3, 5, 4, 2, 1, 0]);
  });
});

// ---------------------------------------------------------------------------
// Determinism — the same input is the same answer, always
// ---------------------------------------------------------------------------

describe('purity', () => {
  it('returns an identical profile on repeated evaluation', () => {
    const hero = getHero('h14');
    const first = firingProfile(hero, [4, 3, 2, 1, 5, 0], 37);
    for (let i = 0; i < 50; i++) {
      expect(firingProfile(hero, [4, 3, 2, 1, 5, 0], 37)).toEqual(first);
    }
  });

  it('refuses a ranking that is not a permutation of the six tiers', () => {
    const hero = getHero('h01');
    expect(() => firingProfile(hero, [5, 5, 3, 2, 1, 0] as unknown as PowerRanking)).toThrow();
    expect(() => firingProfile(hero, [6, 4, 3, 2, 1, 0] as unknown as PowerRanking)).toThrow();
  });

  it('refuses a non-positive horizon rather than returning six zeroes', () => {
    expect(() => firingProfile(getHero('h01'), [5, 4, 3, 2, 1, 0], 0)).toThrow();
  });
});
