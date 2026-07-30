/**
 * The ladder measures skill, not hours (010 T026–T029, T053).
 *
 * **SC-003 is a population property and no unit test can reach it.** "A strong
 * player at two hours a week outranks a weaker one at twenty" is a statement about
 * a distribution, so this file simulates one: 2,000 players with known latent
 * skill, playing each other, and asserts that the rating recovers the ordering.
 *
 * ### Assert ordinally, never on absolute error
 *
 * Mean absolute error between rating and latent skill **bottoms out around 100
 * battles and then grows**. That is not convergence failing — it is the population
 * itself drifting as everyone's rating moves — and a test that asserts on absolute
 * error will go red for a reason that does not matter, in a run that changed
 * nothing. Rank correlation is the claim the design actually makes.
 */

import { describe, expect, it } from 'vitest';
import {
  expectedScore,
  kFactor,
  ratingDeltas,
  type RatingOutcome,
} from '../../src/progression/rating.js';
import {
  ELO_SCALE,
  K_ESTABLISHED,
  K_PROVISIONAL,
  K_SETTLING,
  PROVISIONAL_BATTLES,
  SETTLING_BATTLES,
  STARTING_RATING,
} from '../../src/progression/config.js';

// ---------------------------------------------------------------------------
// A deterministic population — no Math.random, so a failure reproduces exactly.
// ---------------------------------------------------------------------------

/** SplitMix64-lite. The resolver owns the real one; this only needs to be stable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Player {
  latent: number;
  rating: number;
  battles: number;
}

/** Spearman's rank correlation between latent skill and final rating. */
function rankCorrelation(players: readonly Player[]): number {
  const byLatent = [...players].sort((a, b) => a.latent - b.latent);
  const byRating = [...players].sort((a, b) => a.rating - b.rating);

  const latentRank = new Map<Player, number>();
  byLatent.forEach((p, i) => latentRank.set(p, i));
  const ratingRank = new Map<Player, number>();
  byRating.forEach((p, i) => ratingRank.set(p, i));

  const n = players.length;
  let sumD2 = 0;
  for (const p of players) {
    const d = latentRank.get(p)! - ratingRank.get(p)!;
    sumD2 += d * d;
  }
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * Run `targetBattles` **rated battles per player** over a population of `size`.
 *
 * > **Rounds are not battles, and conflating them silently doubles the x-axis.**
 * > Each round every player attacks once *and* is drawn as a defender about once,
 * > so a round is worth ~2 rated battles each. The first version of this file ran
 * > `targetBattles` rounds and met all three thresholds at **twice** the volume it
 * > claimed — passing, and measuring the wrong thing. `meanBattles` is asserted
 * > below so it cannot drift back.
 *
 * Opponents are drawn at random from the whole population rather than by rating,
 * which is the **harsher** test: real matchmaking pairs by league, and pairing
 * closer to a player's own level converges faster than this does.
 */
function simulate(size: number, targetBattles: number, seed = 20260730): Player[] {
  const random = rng(seed);
  const battles = Math.round(targetBattles / 2);

  const players: Player[] = Array.from({ length: size }, () => ({
    // Latent skill on the same 400-point logistic the rating uses.
    latent: STARTING_RATING + (random() - 0.5) * 800,
    rating: STARTING_RATING,
    battles: 0,
  }));

  for (let round = 0; round < battles; round += 1) {
    for (const attacker of players) {
      const defender = players[Math.floor(random() * players.length)]!;
      if (defender === attacker) continue;

      /** True skill decides the winner, on the same logistic. */
      const pAttacker = 1 / (1 + 10 ** ((defender.latent - attacker.latent) / ELO_SCALE));
      const attackerWon = random() < pAttacker;

      const outcome: RatingOutcome = {
        attacker: attacker.rating,
        defender: defender.rating,
        attackerRatedBattles: attacker.battles,
        defenderRatedBattles: defender.battles,
        attackerWon,
        zone: 'visible',
      };

      const deltas = ratingDeltas(outcome);
      attacker.rating += deltas.attacker;
      defender.rating += deltas.defender;
      attacker.battles += 1;
      defender.battles += 1;
    }
  }

  return players;
}

describe('convergence — the ladder recovers the true ordering', () => {
  it('reaches the three published correlation thresholds', () => {
    const checkpoints = [
      { battles: 30, floor: 0.89 },
      { battles: 100, floor: 0.95 },
      { battles: 400, floor: 0.98 },
    ];

    for (const { battles, floor } of checkpoints) {
      const players = simulate(2_000, battles);

      /**
       * **Assert the axis before asserting the metric.** A correlation floor is
       * meaningless if the population played a different number of battles than
       * the label claims — which is exactly the defect this replaced.
       */
      const meanBattles = players.reduce((sum, p) => sum + p.battles, 0) / players.length;
      expect(meanBattles, `population played ${meanBattles.toFixed(1)}, not ${battles}`).toBeCloseTo(
        battles,
        -1,
      );

      const rho = rankCorrelation(players);
      expect(rho, `rank correlation at ${battles} battles was ${rho.toFixed(4)}`).toBeGreaterThan(
        floor,
      );
    }
  }, 120_000);

  it('has no correlation before anyone has played', () => {
    // The floors above prove nothing unless an unconverged population fails them.
    const rho = rankCorrelation(simulate(2_000, 0));
    expect(rho, `an unplayed population correlated at ${rho.toFixed(4)}`).toBeLessThan(0.1);
  });

  it('a strong player at low volume outranks a weak one at high volume', () => {
    // The whole point of SC-003, stated as the scenario rather than as a metric.
    const strong: Player = { latent: 1400, rating: STARTING_RATING, battles: 0 };
    const weak: Player = { latent: 700, rating: STARTING_RATING, battles: 0 };
    const random = rng(7);

    const play = (p: Player, rounds: number): void => {
      for (let i = 0; i < rounds; i += 1) {
        const field = STARTING_RATING;
        const won = random() < 1 / (1 + 10 ** ((field - p.latent) / ELO_SCALE));
        const deltas = ratingDeltas({
          attacker: p.rating,
          defender: field,
          attackerRatedBattles: p.battles,
          defenderRatedBattles: 500,
          attackerWon: won,
          zone: 'visible',
        });
        p.rating += deltas.attacker;
        p.battles += 1;
      }
    };

    play(strong, 40); // two hours a week
    play(weak, 400); // twenty

    expect(
      strong.rating,
      `strong ${strong.rating.toFixed(0)} vs weak ${weak.rating.toFixed(0)}`,
    ).toBeGreaterThan(weak.rating);
  });

  it('barely moves for beating someone far below you', () => {
    // Neither farming a weak defender nor grinding bots is a rating strategy, and
    // this is handled by the SHAPE of the number rather than by a rule.
    const deltas = ratingDeltas({
      attacker: 1600,
      defender: 900,
      attackerRatedBattles: 500,
      defenderRatedBattles: 500,
      attackerWon: true,
      zone: 'visible',
    });

    expect(deltas.attacker).toBeLessThan(0.5);
  });
});

describe('K bands', () => {
  it('decays across the two published boundaries', () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_BATTLES - 1)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_BATTLES)).toBe(K_SETTLING);
    expect(kFactor(SETTLING_BATTLES - 1)).toBe(K_SETTLING);
    expect(kFactor(SETTLING_BATTLES)).toBe(K_ESTABLISHED);
    expect(kFactor(10_000)).toBe(K_ESTABLISHED);
  });

  it('only ever decreases', () => {
    let previous = Infinity;
    for (const n of [0, 10, 29, 30, 100, 199, 200, 1_000]) {
      const k = kFactor(n);
      expect(k, `K at ${n} battles rose`).toBeLessThanOrEqual(previous);
      previous = k;
    }
  });
});

describe('the Hidden bonus makes rating non-zero-sum, deliberately', () => {
  const even = (zone: RatingOutcome['zone']): RatingOutcome => ({
    attacker: STARTING_RATING,
    defender: STARTING_RATING,
    attackerRatedBattles: SETTLING_BATTLES,
    defenderRatedBattles: SETTLING_BATTLES,
    attackerWon: true,
    zone,
  });

  it('is +5.0 / -5.0 and nets zero in the Visible zone', () => {
    const d = ratingDeltas(even('visible'));
    expect(d.attacker).toBe(5);
    expect(d.defender).toBe(-5);
    expect(d.attacker + d.defender).toBe(0);
  });

  it('is +10.0 / -5.0 and nets +5.0 in the Hidden zone', () => {
    // Written down explicitly because it is a discovered surprise only if nobody
    // wrote it down. It exists to counterweight the shard economy, which says
    // fortify Visible — without it, Hidden is strictly dominated.
    const d = ratingDeltas(even('hidden'));
    expect(d.attacker).toBe(10);
    expect(d.defender).toBe(-5);
    expect(d.attacker + d.defender).toBe(5);
  });

  it('costs a loser the same in either zone', () => {
    const visible = ratingDeltas({ ...even('visible'), attackerWon: false });
    const hidden = ratingDeltas({ ...even('hidden'), attackerWon: false });

    expect(visible.attacker).toBe(hidden.attacker);
    expect(visible.attacker).toBeLessThan(0);
  });

  it('doubles only the winner, never a negative delta', () => {
    const d = ratingDeltas({ ...even('hidden'), attackerWon: false });
    // The defender won a Hidden defense, so their gain doubles; the attacker's
    // loss does not.
    expect(d.defender).toBeGreaterThan(0);
    expect(d.attacker).toBe(-5);
  });
});

describe('the zone asymmetry, as arithmetic', () => {
  it('gives a defender -17.0/day Visible and +12.0/day Hidden', () => {
    // T053. 20 attacks/day split 85/15 across the zones, holding 40% Visible and
    // 60% Hidden, at K=10. This asserts the ARITHMETIC, not the premise — the
    // hold rates are measurements that may move.
    const perDay = 20;
    const visibleShare = 0.85;
    const at = (share: number, holdRate: number, zone: RatingOutcome['zone']): number => {
      const battles = perDay * share;
      const win = ratingDeltas({
        attacker: STARTING_RATING,
        defender: STARTING_RATING,
        attackerRatedBattles: SETTLING_BATTLES,
        defenderRatedBattles: SETTLING_BATTLES,
        attackerWon: false,
        zone,
      }).defender;
      const loss = ratingDeltas({
        attacker: STARTING_RATING,
        defender: STARTING_RATING,
        attackerRatedBattles: SETTLING_BATTLES,
        defenderRatedBattles: SETTLING_BATTLES,
        attackerWon: true,
        zone,
      }).defender;
      return battles * (holdRate * win + (1 - holdRate) * loss);
    };

    expect(at(visibleShare, 0.4, 'visible')).toBeCloseTo(-17.0, 1);
    expect(at(1 - visibleShare, 0.6, 'hidden')).toBeCloseTo(12.0, 1);
  });
});

describe('gear is not an input', () => {
  it('never appears in rating.ts', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../src/progression/rating.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(code.length, 'the comment strip emptied the file').toBeGreaterThan(src.length * 0.1);
    expect(code).not.toMatch(/gearScore|gear_score|league/i);
  });

  it('has that scan able to fail', () => {
    expect(/gearScore|gear_score|league/i.test('const x = await gearScore(id);')).toBe(true);
  });
});

describe('the expectation curve', () => {
  it('is even at equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 10);
  });

  it('is 10:1 at a 400-point lead', () => {
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 6);
  });
});
