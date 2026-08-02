/**
 * Riders actually land (020 T018 · US1's independent test).
 *
 * ### Why this file exists at all
 *
 * `resolve.ts` returned `ridersLanded: []` hardcoded at every exit for four
 * features, and **393 tests passed the whole time.** They were all true: the
 * damage arithmetic was right, the draw order was right, replays re-derived
 * byte-identically. None of them could tell that half of combat was missing,
 * because none of them asked.
 *
 * So the bar here is specifically *"would this notice if riders went back to
 * being a no-op?"* — which means every test below has to observe a **state
 * change on the board**, not a field on a packet.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero, type Power } from '@lmntlz/content';
import { resolveOne } from '../../resolver/resolve.js';
import { heroStateOf, type BattleState } from '../../rules/state.js';
import { battle, fixedSeed, INERT_DEFENDER } from './fixtures.js';

/** The first hero on the roster owning a power whose rider matches a predicate. */
function findPower(
  predicate: (p: Power) => boolean,
): { readonly heroId: string; readonly power: Power } {
  for (const hero of getAllHeroes()) {
    const power = hero.powers.find(predicate);
    if (power) return { heroId: hero.id, power };
  }
  throw new Error('no power on the roster matches');
}

/**
 * Resolve one action and hand back the board.
 *
 * The **gate turn** is why `heroTurn` moves: a tier-4 power opens at turn 3 and a
 * tier-5 at turn 5, and a battle that opened with both would be a different game.
 */
function fire(
  state: BattleState,
  actorId: string,
  power: Power,
  targetId: string,
  seedN?: bigint,
) {
  const at: BattleState = { ...state, heroTurn: Math.max(state.heroTurn, power.gateTurn) };
  return resolveOne(
    seedN === undefined ? fixedSeed() : fixedSeed(seedN),
    at,
    { sequence: 1, actorInstanceId: actorId, powerId: power.id, targetInstanceId: targetId },
    0n,
  );
}

/** A board of one champion per side, so nothing else can be the cause. */
function duel(attackerId: string, defenderId = INERT_DEFENDER): BattleState {
  const full = battle(attackerId, defenderId);
  return {
    ...full,
    heroes: full.heroes.filter((h) => h.instanceId === 'a0' || h.instanceId === 'd0'),
  };
}

// ---------------------------------------------------------------------------

describe('a rider reaches the board', () => {
  const { heroId, power } = findPower(
    (p) => p.riders.some((r) => r.kind === 'debuff' && r.at === 'target'),
  );

  /**
   * **The whole feature in one assertion.** Before 020 this hero fired this power
   * and the target's status list stayed empty forever.
   *
   * Seeds are searched rather than asserted, because a rider is a *contest* — at
   * tier 1 it sticks about 31% of the time across the roster. A test that pinned
   * one seed and expected success would be asserting the RNG, and would break the
   * first time the draw order legitimately changed.
   */
  it('lands a debuff on the struck hero, for at least one seed', () => {
    const landed = [...Array(24).keys()].some((n) => {
      const { state } = fire(duel(heroId), 'a0', power, 'd0', BigInt(n) * 0x9e3779b97f4a7c15n);
      return heroStateOf(state, 'd0').statuses.length > 0;
    });

    expect(landed, `${power.id} never applied its rider across 24 seeds`).toBe(true);
  });

  /**
   * **And it is genuinely contested.** If the rider landed unconditionally this
   * would fail — which is the check that separates "wired up" from "wired up and
   * still a coin flip", and the one that would have caught the potency ladder
   * being read as a certainty.
   */
  it('is resisted on at least one seed, so it is a contest and not a certainty', () => {
    const resisted = [...Array(24).keys()].some((n) => {
      const { packet } = fire(duel(heroId), 'a0', power, 'd0', BigInt(n) * 0x9e3779b97f4a7c15n);
      return packet.ridersResisted.length > 0;
    });

    expect(resisted, `${power.id} always sticks — the contest is not running`).toBe(true);
  });

  it('reports what landed on the packet, matching the board', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const { state, packet } = fire(duel(heroId), 'a0', power, 'd0', BigInt(n) * 0x1234_5678n);
      const onBoard = heroStateOf(state, 'd0').statuses.length;
      expect(packet.ridersLanded.length, `seed ${n}: packet and board disagree`).toBe(onBoard);
    }
  });
});

describe('a self-rider is never contested', () => {
  const { heroId, power } = findPower((p) => p.riders.some((r) => r.at === 'self'));

  /**
   * `05-status.md`: a friendly effect *"skips the contest entirely"*. A hero does
   * not resist its own buff — and if it did, a tier-3 House power would be a coin
   * flip on its own identity.
   */
  it('always lands, on every seed', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const { state } = fire(duel(heroId), 'a0', power, 'd0', BigInt(n) * 0xdead_beefn);
      expect(
        heroStateOf(state, 'a0').statuses.length,
        `seed ${n}: ${power.id} failed to buff its own caster`,
      ).toBeGreaterThan(0);
    }
  });

  it('lands on the caster and not on the enemy it struck', () => {
    const { state } = fire(duel(heroId), 'a0', power, 'd0');
    const selfKinds = power.riders.filter((r) => r.at === 'self').map((r) => r.kind);

    for (const kind of selfKinds) {
      expect(heroStateOf(state, 'a0').statuses.some((s) => s.kind === kind)).toBe(true);
      expect(
        heroStateOf(state, 'd0').statuses.some((s) => s.kind === kind),
        `${power.id} put its self-buff on the target`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------

describe('draw accounting', () => {
  /**
   * **"Lazy is not an order."** Each step is *skipped*, never
   * drawn-and-discarded, which is why a miss consumes one index and a landed hit
   * consumes two. A power with no riders must consume exactly what it always did,
   * or 020 silently re-times every battle that uses one.
   */
  it('a power with no riders consumes no rider draws', () => {
    const { heroId, power } = findPower((p) => p.tier === 0 && p.riders.length === 0);
    const { drawsConsumed } = fire(duel(heroId), 'a0', power, 'd0');

    // hit, then crit only if the hit landed. Never a third.
    expect(drawsConsumed).toBeLessThanOrEqual(2n);
  });

  /**
   * A **friendly** power skips the contest entirely and must not spend an index
   * on it (FR-005). Heals consume nothing at all today; the assertion is that
   * adding riders did not change that.
   */
  it('a friendly power consumes no draws at all', () => {
    const found = getAllHeroes()
      .flatMap((h) => h.powers.map((p) => [h.id, p] as const))
      .find(([, p]) => p.friendly);

    expect(found, 'the roster has no friendly power to check').toBeDefined();
    const [healerId, heal] = found!;

    const state = duel(healerId, healerId);
    const wounded: BattleState = {
      ...state,
      heroes: state.heroes.map((h) => (h.instanceId === 'a0' ? { ...h, hp: 1 } : h)),
    };

    const { drawsConsumed } = fire(wounded, 'a0', heal, 'a0');
    expect(drawsConsumed).toBe(0n);
  });

  /**
   * **The rule that makes the whole draw order auditable**: the same board and
   * the same seed must consume the same number of indices every time. If a rider
   * loop ever iterated an object rather than the authored array, this is what
   * would catch it — and only on some runtimes, which is why it is asserted
   * rather than assumed.
   */
  it('is deterministic for a given seed', () => {
    const { heroId, power } = findPower((p) => p.riders.length > 0 && !p.friendly);

    const runs = [...Array(6).keys()].map(
      () => fire(duel(heroId), 'a0', power, 'd0', 0xabcd_ef01n).drawsConsumed,
    );

    expect(new Set(runs.map(String)).size, 'draw count varied across identical runs').toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('what the roster can now do that it could not', () => {
  /**
   * A census rather than a spot check. Every power carrying a target-side rider
   * should be *able* to apply it — a kind the engine silently ignores would show
   * up here as a power that can never affect anybody.
   */
  it('every hostile rider-carrying power can land something across 12 seeds', () => {
    const failures: string[] = [];

    for (const hero of getAllHeroes()) {
      for (const power of hero.powers) {
        const hostile = power.riders.filter((r) => r.at === 'target' && r.op === 'apply');
        if (hostile.length === 0 || power.friendly) continue;

        const ever = [...Array(12).keys()].some((n) => {
          const { state } = fire(duel(hero.id), 'a0', power, 'd0', BigInt(n) * 0x5bd1_e995n);
          return heroStateOf(state, 'd0').statuses.length > 0;
        });

        if (!ever) failures.push(`${hero.name} / ${power.id}`);
      }
    }

    expect(failures, 'these powers can never apply their rider').toEqual([]);
  });

  it('a burn is snapshotted with a real per-tick number', () => {
    const { heroId, power } = findPower((p) => p.riders.some((r) => r.kind === 'burn'));

    for (const n of [...Array(20).keys()]) {
      const { state } = fire(duel(heroId), 'a0', power, 'd0', BigInt(n) * 0x27d4_eb2dn);
      const burn = heroStateOf(state, 'd0').statuses.find((s) => s.kind === 'burn');
      if (!burn) continue;

      // Snapshotted from the applier's Might and the type multiplier, not zero.
      expect(burn.magnitude).toBeGreaterThan(0);
      expect(burn.turnsRemaining).toBeGreaterThan(0);
      expect(burn.sourcePowerId).toBe(power.id);
      expect(burn.sourceInstanceId).toBe('a0');
      return;
    }

    throw new Error(`${power.id} never applied a burn across 20 seeds`);
  });

  /**
   * `The Still Pool Closes` is the roster's only control rider. Silence must **not**
   * cost the target its turn — it blocks powers, and the tier-0 auto still works.
   */
  it('the one silence in the game lasts exactly one turn', () => {
    const nix = getHero('h12');
    const power = nix.powers.find((p) => p.id === 'The Still Pool Closes');
    expect(power, 'The Still Pool Closes is not on Nix').toBeDefined();

    for (const n of [...Array(20).keys()]) {
      const { state } = fire(duel('h12'), 'a0', power!, 'd0', BigInt(n) * 0x85eb_ca6bn);
      const silence = heroStateOf(state, 'd0').statuses.find((s) => s.kind === 'silence');
      if (!silence) continue;

      expect(silence.turnsRemaining, 'control must never scale past one turn').toBe(1);
      return;
    }

    throw new Error('silence never landed across 20 seeds');
  });
});
