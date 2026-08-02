/**
 * 🔴 **The four rune effects that roll, measured against a real seed** (021 US3,
 * T054/T056).
 *
 * ### Why this file exists at all
 *
 * Every determinism fixture in this directory fields **no runes**, so the whole
 * existing suite proves the determinism of a board on which nothing rolls. US3 is
 * the first time `packages/sim` consumes an index for something other than a hit,
 * a crit, a rider or a tiebreak — and a suite that cannot see those draws would
 * stay green through any mistake in them.
 *
 * ### What is asserted, and what is deliberately not
 *
 * Draw **counts are asserted as deltas against a rune-less control**, never as
 * totals. The total for a landed attack has several contributors — the hit, the
 * crit, one contest per rider — and asserting a total would invite correcting the
 * wrong one when a power's riders change. The control is re-measured on the same
 * seed and the same board every time.
 *
 * The one number written down is **zero**: a champion carrying none of these draws
 * nothing, which is the property every battle fought before `e0.6.0` depends on.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { ENGINE_RNG, engineVersion } from '../../rules/index.js';
import { reDerive, resolveOne, rollTurnStart } from '../../resolver/resolve.js';
import { BATTLE_ID, battle, bytes, fixedSeed } from './fixtures.js';

const AUTO = getHero('h01').powers.find((p) => p.tier === 0)!.id;

/** The same board every time, with named instances given rune loadouts. */
function armed(loadouts: Readonly<Record<string, readonly string[]>>): BattleState {
  const base = battle();
  return {
    ...base,
    heroes: base.heroes.map((h: HeroState) =>
      loadouts[h.instanceId] ? { ...h, runeEffects: loadouts[h.instanceId]! } : h,
    ),
  };
}

const INTENT = {
  sequence: 1,
  actorInstanceId: 'a0',
  powerId: AUTO,
  targetInstanceId: 'd0',
} as const;

const resolve = (seedN: bigint, state: BattleState) =>
  resolveOne(fixedSeed(seedN), state, INTENT, 0n);

/** Draws a rune-less board spends on this action, re-measured per seed. */
const control = (seedN: bigint): bigint => resolve(seedN, armed({})).drawsConsumed;

/**
 * Seeds whose first draw lands the hit, so `struck` is non-empty and the chance
 * hooks have something to answer about.
 *
 * **Found rather than assumed.** A miss consumes one index and skips every later
 * stage, so a hard-coded seed that happened to miss would make every delta below
 * read zero and every test pass for the wrong reason.
 */
const LANDING_SEEDS: readonly bigint[] = (() => {
  const found: bigint[] = [];
  for (let n = 1n; n <= 400n && found.length < 40; n++) {
    const packet = resolve(n, armed({})).packet;
    if (packet.hit && packet.deaths.length === 0) found.push(n);
  }
  return found;
})();

describe('the board these are measured on', () => {
  it('lands often enough to measure anything', () => {
    expect(LANDING_SEEDS.length, 'no seed produced a landed, non-lethal blow').toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// The property every pre-021 battle depends on
// ---------------------------------------------------------------------------

describe('a champion carrying nothing draws nothing', () => {
  /**
   * 🔴 **The compatibility guarantee, stated as an assertion** (Constitution XVI).
   *
   * `e0.6.0` exists because these draws move the sequence. What must stay true is
   * that they move it *only* for a board that fields them — otherwise the bump
   * would be a rewrite of every battle rather than a gate on four runes.
   */
  it('spends the identical indices with and without empty loadouts', () => {
    for (const seed of LANDING_SEEDS.slice(0, 12)) {
      const bare = resolve(seed, battle());
      const empty = resolve(seed, armed({ a0: [], d0: [] }));

      expect(empty.drawsConsumed, `seed ${seed}`).toBe(bare.drawsConsumed);
      expect(bytes(empty.packet), `seed ${seed}`).toBe(bytes(bare.packet));
    }
  });

  it('is unmoved by runes that hook nothing this action', () => {
    for (const seed of LANDING_SEEDS.slice(0, 12)) {
      /* `Cornered` is a trigger, not a chance — it must cost no index. */
      const trigger = resolve(seed, armed({ a0: ['cornered'] }));
      expect(trigger.drawsConsumed, `seed ${seed}`).toBe(control(seed));
    }
  });
});

// ---------------------------------------------------------------------------
// The draw budget, per research.md Decision 4
// ---------------------------------------------------------------------------

describe('Take It Back — one draw per landed attack', () => {
  it('🔴 costs exactly one index more than the control, every time', () => {
    for (const seed of LANDING_SEEDS.slice(0, 20)) {
      const withRune = resolve(seed, armed({ a0: ['take-it-back'] }));
      expect(withRune.drawsConsumed - control(seed), `seed ${seed}`).toBe(1n);
    }
  });
});

describe('Both Ways — one draw per struck bearer', () => {
  it('🔴 costs one index more, and it is the DEFENDER that pays it', () => {
    for (const seed of LANDING_SEEDS.slice(0, 20)) {
      const onDefender = resolve(seed, armed({ d0: ['both-ways'] }));
      expect(onDefender.drawsConsumed - control(seed), `seed ${seed}`).toBe(1n);

      /* On the attacker it is not a strike chance at all, so nothing is drawn. */
      const misplaced = resolve(seed, armed({ a0: ['both-ways'] }));
      expect(misplaced.drawsConsumed, `seed ${seed}`).toBe(control(seed));
    }
  });
});

describe('Knocked Loose — one draw, plus a contest when it fires', () => {
  /**
   * 🔴 **The second draw is conditional, and both cases must actually occur.**
   *
   * Asserting only *"one or two"* would pass against an implementation that never
   * contested anything, and against one that contested unconditionally. Requiring
   * **both** deltas to appear across the seed sweep is what makes it a claim about
   * the contest rather than about a range.
   */
  it('🔴 spends one index when the chance fails and two when it lands', () => {
    const deltas = new Set<bigint>();

    for (const seed of LANDING_SEEDS) {
      const withRune = resolve(seed, armed({ a0: ['knocked-loose'] }));
      deltas.add(withRune.drawsConsumed - control(seed));
    }

    expect([...deltas].sort(), 'the contest draw is neither absent nor unconditional').toEqual([
      1n,
      2n,
    ]);
  });
});

describe('all four at once', () => {
  const ALL = {
    a0: ['take-it-back', 'knocked-loose'],
    d0: ['both-ways'],
  } as const;

  /**
   * 🔴 The attacker's two chances, the defender's one, and the contest when
   * `Knocked Loose` fires. `Further Than It Looks` is not here because it is not an
   * action's draw at all — see the turn-start block below.
   */
  it('🔴 adds three indices, or four when the stun is contested', () => {
    const deltas = new Set<bigint>();

    for (const seed of LANDING_SEEDS) {
      deltas.add(resolve(seed, armed(ALL)).drawsConsumed - control(seed));
    }

    expect([...deltas].sort()).toEqual([3n, 4n]);
  });

  /**
   * 🔴 **The determinism claim, on a board where something actually rolls.**
   *
   * A thousand resolutions of one seed, byte-compared. The existing determinism
   * suite makes the same claim about a board carrying no runes, which cannot fail
   * for a reason this file is about.
   */
  it('🔴 resolves byte-identically a thousand times from one seed', () => {
    const seed = LANDING_SEEDS[0]!;
    const first = bytes(resolve(seed, armed(ALL)).packet);

    for (let n = 0; n < 1000; n++) {
      expect(bytes(resolve(seed, armed(ALL)).packet)).toBe(first);
    }
  });

  /** Two different seeds must not resolve to the same thing, or the loop above is vacuous. */
  it('is not simply constant across seeds', () => {
    const packets = new Set(LANDING_SEEDS.map((s) => bytes(resolve(s, armed(ALL)).packet)));
    expect(packets.size, 'every seed produced the same packet — nothing is reading the seed').
      toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The version gate — Constitution XVI (T056)
// ---------------------------------------------------------------------------

/**
 * 🔴 **A battle recorded under the old engine never enters the new code path.**
 *
 * The three blocks above establish that a rune-less board is bit-identical across
 * the bump. That is not a licence to resume an *armed* battle across it, and the
 * stamp is what refuses to try.
 *
 * The previous stamp is written out in full rather than derived. **A gate whose
 * expected value is computed from the thing it gates cannot fail**: express
 * `e0.5.0` as "one less than current" and the test passes on every future bump
 * whether or not the refusal still works.
 */
describe('the engine stamp', () => {
  const PREVIOUS = `e0.6.0-${ENGINE_RNG}`;

  it('🔴 moved, and moved to e0.7.0', () => {
    expect(engineVersion()).toBe(`e0.7.0-${ENGINE_RNG}`);
    expect(engineVersion(), 'a stamp that did not move is the defect').not.toBe(PREVIOUS);
  });

  it('🔴 refuses to re-derive a battle recorded under the previous engine', () => {
    const result = reDerive(
      fixedSeed(),
      armed({ a0: ['take-it-back'] }),
      { battleId: BATTLE_ID, engineVersion: PREVIOUS, contentVersion: 'c-test' },
      [],
      { engineVersion: engineVersion(), contentVersion: 'c-test' },
    );

    expect(result.ok, 'an e0.5.0 battle was replayed by the e0.6.0 engine').toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('engine-version');
    expect(result.was).toBe(PREVIOUS);
  });

  it('re-derives a battle recorded under this engine — the control', () => {
    const current = { engineVersion: engineVersion(), contentVersion: 'c-test' };
    const result = reDerive(
      fixedSeed(),
      armed({ a0: ['take-it-back'] }),
      { battleId: BATTLE_ID, ...current },
      [],
      current,
    );

    expect(result.ok, 'the gate refuses everything, which is not a gate').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One draw per ACTION, not per target (research.md Decision 4)
// ---------------------------------------------------------------------------

/**
 * 🔴 **The rule a single-target power cannot tell you anything about.**
 *
 * Every assertion above fires a tier-0 auto attack, where *"one draw per action"*
 * and *"one draw per struck target"* are the same number — so the whole block
 * would stay green against an implementation that rolled three times for one
 * swing of a row power. `Take It Back` reads *"25% per attack"*, and three rolls
 * for one attack is a different rune.
 *
 * `Clear the Room` is h21 Grieve's row power, and the shared fixture seats three
 * defenders in row 5, so this is the case that separates them.
 */
describe('a row power rolls once, not once per target', () => {
  const ROW_POWER = 'Clear the Room';
  const GATE_TURN = 5;

  const rowBoard = (loadouts: Readonly<Record<string, readonly string[]>>): BattleState => {
    const base = battle('h21', 'h19');
    return {
      ...base,
      heroTurn: GATE_TURN,
      heroes: base.heroes.map((h: HeroState) =>
        loadouts[h.instanceId] ? { ...h, runeEffects: loadouts[h.instanceId]! } : h,
      ),
    };
  };

  const sweep = (seedN: bigint, loadouts: Readonly<Record<string, readonly string[]>>) =>
    resolveOne(
      fixedSeed(seedN),
      rowBoard(loadouts),
      { sequence: 1, actorInstanceId: 'a0', powerId: ROW_POWER, targetInstanceId: 'd2' },
      0n,
    );

  /** The premise, asserted rather than assumed — three defenders share row 5. */
  const MULTI_SEEDS = (() => {
    const found: bigint[] = [];
    for (let n = 1n; n <= 400n && found.length < 15; n++) {
      const packet = sweep(n, {}).packet;
      if (packet.hit && packet.deaths.length === 0) found.push(n);
    }
    return found;
  })();

  it('lands a multi-target blow to measure', () => {
    expect(MULTI_SEEDS.length, 'the row power never connected — check the gate turn').
      toBeGreaterThan(3);
    expect(rowBoard({}).heroes.filter((h) => h.row === 5)).toHaveLength(3);
  });

  it('🔴 Take It Back costs one index however many it struck', () => {
    for (const seed of MULTI_SEEDS) {
      const delta = sweep(seed, { a0: ['take-it-back'] }).drawsConsumed - sweep(seed, {}).drawsConsumed;
      expect(delta, `seed ${seed} — one per attack, not one per target`).toBe(1n);
    }
  });

  /**
   * 🔴 The defender's half is the opposite rule, and it has to stay the opposite:
   * **each struck bearer rolls for itself**, so arming all three costs three.
   */
  it('🔴 Both Ways costs one index PER struck bearer', () => {
    for (const seed of MULTI_SEEDS) {
      const armedRow = { d2: ['both-ways'], d3: ['both-ways'], d4: ['both-ways'] };
      const delta = sweep(seed, armedRow).drawsConsumed - sweep(seed, {}).drawsConsumed;
      expect(delta, `seed ${seed} — three bearers, three rolls`).toBe(3n);
    }
  });
});

// ---------------------------------------------------------------------------
// Turn start — the draw that is not an action's
// ---------------------------------------------------------------------------

describe('Further Than It Looks — rolled at turn start', () => {
  const roll = (seedN: bigint, runes: readonly string[]) =>
    rollTurnStart(fixedSeed(seedN), armed({ a0: runes }), 'a0', 0n);

  it('🔴 draws nothing for a champion that does not carry it', () => {
    for (let n = 1n; n <= 20n; n++) {
      const before = armed({ a0: [] });
      const after = rollTurnStart(fixedSeed(n), before, 'a0', 0n);

      expect(after.drawsConsumed, `seed ${n}`).toBe(0n);
      /* Reference equality: the board is handed straight back, not rebuilt. */
      expect(after.state, 'the board was touched by a champion carrying nothing').toBe(before);
    }
  });

  it('🔴 draws exactly one index for a bearer, fired or not', () => {
    for (let n = 1n; n <= 40n; n++) {
      expect(roll(n, ['further-than-it-looks']).drawsConsumed, `seed ${n}`).toBe(1n);
    }
  });

  /**
   * 🔴 **Both outcomes occur.** A grant that always fired and a grant that never
   * fired would each consume the same one index, so the count alone proves nothing
   * about the chance being read.
   */
  it('🔴 grants the row sometimes and not others', () => {
    const granted = new Set<boolean>();

    for (let n = 1n; n <= 200n; n++) {
      const after = roll(n, ['further-than-it-looks']);
      granted.add(heroStateOf(after.state, 'a0').statuses.some((s) => s.kind === 'reach'));
    }

    expect([...granted].sort(), 'the chance is either always or never being met').toEqual([
      false,
      true,
    ]);
  });

  it('is deterministic for a given seed', () => {
    for (let n = 1n; n <= 10n; n++) {
      expect(bytes(roll(n, ['further-than-it-looks']).state)).toBe(
        bytes(roll(n, ['further-than-it-looks']).state),
      );
    }
  });
});
