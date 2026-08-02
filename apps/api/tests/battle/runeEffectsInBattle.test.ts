/**
 * 🔴 **WIRING — a bought effect reaches the battle and changes it (021 T027–T028).**
 *
 * ### The defect this closes
 *
 * `RuneLoadout.utility` has been declared in `board.ts`, populated by
 * `runeLoadouts()` and carried through the snapshot parser since 019 — and
 * `grep -rn utility packages/sim` returned **zero matches**. A correct, complete,
 * fully-tested pipeline delivered a list of strings to a battle engine that had no
 * field to put them in.
 *
 * That is the shape this project keeps producing: not a broken seam, an *uncalled*
 * one. Nothing throws, nothing looks wrong, and the 200 shards buy silence.
 *
 * ### Built through the parsers, not from hand-made objects
 *
 * `buildInitialState` takes seat arrays, so a test could skip the parse — and
 * would then prove that a shape the database never produces works. The round trip
 * through `parseAttackerSnapshot` is the half most likely to drop a new field
 * silently, and this field spent a whole feature being dropped somewhere else.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import {
  RESOLVED_AT_BOARD_BUILD,
  RUNE_EFFECTS,
  RUNE_MAGNITUDES,
  absorb,
  actsAgainAfter,
  critRefusal,
  effectsInPool,
  fallenBetween,
  healMultiplierFor,
  heroStateOf,
  hitFloorFor,
  ignoresShields,
  onHealed,
  onStruck,
  poolOf,
  statBonusFor,
  applyPassiveEffects,
  maxHp,
  type BattleState,
} from '@lmntlz/sim/rules';
import { createSeed } from '@lmntlz/sim/resolver';
import { MalformedSquadError, buildInitialState, type SnapshotSeat } from '../../src/battle/board.js';
import { takeTurn } from '../../src/battle/turnLoop.js';
import { autoPowerOf, board, withHero } from './fixtures.js';
import { parseAttackerSnapshot, parseDefenderSnapshot } from '../../src/battle/snapshot.js';

const ROSTER = getAllHeroes().map((h) => h.id);
const M = RUNE_MAGNITUDES;

const CONFIG = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
};

const seats = (ids: readonly string[], runes?: SnapshotSeat['runes']) =>
  [
    { row: 'front', index: 0 },
    { row: 'front', index: 1 },
    { row: 'middle', index: 0 },
    { row: 'middle', index: 1 },
    { row: 'middle', index: 2 },
    { row: 'back', index: 0 },
  ].map((seat, i) => ({
    ...seat,
    heroId: ids[i]!,
    ...(i === 0 && runes ? { runes } : {}),
  }));

/** Through the real parsers, exactly as a stored snapshot arrives. */
function battle(runes?: SnapshotSeat['runes']) {
  return buildInitialState(
    parseAttackerSnapshot({ seats: seats(ROSTER.slice(0, 6), runes) }).seats,
    parseDefenderSnapshot({
      seats: seats(ROSTER.slice(6, 12)).map((s) => ({ ...s, config: CONFIG })),
    }).seats,
    { engineVersion: 'test', contentVersion: 'test' },
  );
}

/** A champion whose `common` slot offers `Weight Tells`… or whatever the pool holds. */
const FRONT = ROSTER[0]!;

describe('the chain from purchase to board', () => {
  it('🔴 carries chosen effects onto the hero state — the field that did not exist', () => {
    const chosen = effectsInPool(poolOf(FRONT, 'common'))[0]!.id;
    const state = battle({ statPoints: {}, utility: [chosen] });

    expect(heroStateOf(state, 'a-front-0').runeEffects).toEqual([chosen]);
  });

  it('🔴 leaves a champion with no runes carrying none — the control', () => {
    const state = battle();
    expect(heroStateOf(state, 'a-front-0').runeEffects).toEqual([]);
  });

  it('🔴 an absent loadout still means none, so past battles re-derive unarmed', () => {
    const state = battle();
    for (const hero of state.heroes) {
      expect(hero.runeEffects, `${hero.instanceId} was retroactively armed`).toEqual([]);
      expect(hero.hasActed).toBe(false);
    }
  });

  it('🔴 refuses an effect id the catalog does not know, at construction', () => {
    expect(() => battle({ statPoints: {}, utility: ['no-such-effect'] })).toThrow(
      MalformedSquadError,
    );
  });

  it('names the unknown id, so the failure is diagnosable', () => {
    expect(() => battle({ statPoints: {}, utility: ['no-such-effect'] })).toThrow(
      /no-such-effect/,
    );
  });
});

describe('and the engine reads it', () => {
  /**
   * 🔴 **The whole point, in one assertion.**
   *
   * `Weight Tells` grants mitigation below half health and nothing above it. Two
   * identical boards, one runed, and the runed champion must answer differently —
   * which a `HeroState` with nowhere to put the effect cannot do.
   */
  it('applies a conditional stat the champion only has through the rune', () => {
    const runed = battle({ statPoints: {}, utility: ['weight-tells'] });
    const bare = battle();

    const hurt = (s: typeof runed) => ({
      ...s,
      heroes: s.heroes.map((h) =>
        h.instanceId === 'a-front-0' ? { ...h, hp: Math.round(maxHp(h) * 0.3) } : h,
      ),
    });

    const a = hurt(runed);
    const b = hurt(bare);

    expect(statBonusFor(a, heroStateOf(a, 'a-front-0'), 'armor')).toBe(M.weightTellsMitigation);
    expect(statBonusFor(b, heroStateOf(b, 'a-front-0'), 'armor')).toBe(0);
  });

  it('fires a trigger through the same hooks a passive uses', () => {
    const state = battle({ statPoints: {}, utility: ['cornered'] });
    const hurt = {
      ...state,
      heroes: state.heroes.map((h) =>
        h.instanceId === 'a-front-0' ? { ...h, hp: Math.round(maxHp(h) * 0.3) } : h,
      ),
    };

    const attacker = heroStateOf(hurt, 'd-front-0');
    const defender = heroStateOf(hurt, 'a-front-0');
    const ctx = {
      state: hurt,
      attacker,
      defender,
      power: getAllHeroes().find((h) => h.id === attacker.heroId)!.powers[0]!,
      defenderHpFraction: defender.hp / maxHp(defender),
    };

    const after = applyPassiveEffects(hurt, onStruck(ctx), maxHp);
    const might = heroStateOf(after, 'a-front-0')
      .statuses.filter((s) => s.kind === 'buff' && s.stat === 'might')
      .reduce((sum, s) => sum + s.magnitude, 0);

    expect(might).toBe(M.corneredMight);
  });
});

// ---------------------------------------------------------------------------
// US2 — the effect that hooks nothing, and the readers apps/api owns
// ---------------------------------------------------------------------------

/**
 * 🔴 **The other half of the anti-vacuity guard** (021 US2).
 *
 * `packages/sim` asserts that the only catalog entry with no hooks is the one
 * `RESOLVED_AT_BOARD_BUILD` declares. On its own that is a list in the source, and
 * a list in the source can be extended to excuse anything — an effect that quietly
 * lost its hooks could be added there and would go green.
 *
 * This is the half that stops it. Every declared id must be **named in `board.ts`**
 * and must **do something on a real board**. Both halves have to be satisfied
 * before a 200-shard purchase can be missing and green.
 */
describe('effects resolved at board build', () => {
  const BOARD_SOURCE = readFileSync(
    new URL('../../src/battle/board.ts', import.meta.url),
    'utf8',
  );

  /**
   * ⚠️ **The first version of this scanned `board.ts` for each declared id and
   * failed — correctly, and it found a real hole rather than a typo.**
   *
   * `board.ts` reads the id out of `RESOLVED_AT_BOARD_BUILD` instead of retyping
   * it, which is right: a literal there would be a second copy free to drift from
   * the declaration. But it reads **`[0]`**, so a second declared id would be
   * accepted by the catalog, exempted from the anti-vacuity guard, and quietly
   * never implemented — the exemption becoming the escape hatch it exists to
   * prevent.
   *
   * So the guard is the pair of facts that actually hold: the declaration is read
   * here, and it names exactly one effect. Declaring a second fails this
   * immediately, which forces a decision in `board.ts` rather than allowing a
   * silent pass.
   */
  it('is read by board.ts rather than retyped there', () => {
    expect(
      BOARD_SOURCE.includes('RESOLVED_AT_BOARD_BUILD'),
      'board.ts must read the declaration, or the two can drift',
    ).toBe(true);
  });

  it('names exactly one effect, which is all board.ts handles', () => {
    expect(
      RESOLVED_AT_BOARD_BUILD.length,
      'board.ts resolves RESOLVED_AT_BOARD_BUILD[0] only — a second entry needs code here',
    ).toBe(1);
  });

  /** 🔴 The proof: the shield is really there, at the size the design names. */
  it('places Before the First Blow’s shield, sized off the pool it is a fraction of', () => {
    const armed = battle({ statPoints: {}, utility: ['before-the-first-blow'] });
    const hero = heroStateOf(armed, 'a-front-0');
    const shields = hero.statuses.filter((s) => s.kind === 'shield');

    expect(shields, 'exactly one shield, not a stack').toHaveLength(1);
    expect(shields[0]!.magnitude).toBe(
      Math.round(maxHp(hero) * M.firstBlowShieldFraction),
    );
    expect(shields[0]!.magnitude, 'a zero shield would make this vacuous').toBeGreaterThan(0);
  });

  it('🔴 sizes it off the pool *after* Toughness runes, not the bare stat', () => {
    const bare = battle({ statPoints: {}, utility: ['before-the-first-blow'] });
    const tough = battle({ statPoints: { toughness: 20 }, utility: ['before-the-first-blow'] });

    const shieldOf = (state: ReturnType<typeof battle>): number =>
      heroStateOf(state, 'a-front-0').statuses.find((s) => s.kind === 'shield')!.magnitude;

    expect(shieldOf(tough)).toBeGreaterThan(shieldOf(bare));
  });

  it('🔴 gives a champion without it no shield at all — the control', () => {
    const state = battle();
    expect(heroStateOf(state, 'a-front-0').statuses.filter((s) => s.kind === 'shield')).toEqual([]);
  });

  /** 🔴 The counter-pair (spec A-05): Pierce's answer, end to end on a real board. */
  it('🔴 is walked straight past by Straight Past', () => {
    const shielded = battle({ statPoints: {}, utility: ['before-the-first-blow'] });
    const defender = heroStateOf(shielded, 'a-front-0');

    const armed = battle({ statPoints: {}, utility: ['straight-past'] });
    const piercer = heroStateOf(armed, 'a-front-0');

    const through = absorb(defender, 40, ignoresShields(piercer));
    const blocked = absorb(defender, 40, ignoresShields(heroStateOf(battle(), 'a-front-0')));

    expect(through.throughput, 'the shield is walked past').toBe(40);
    expect(blocked.throughput, 'the control: an ordinary attacker is stopped').toBe(0);
  });
});

/**
 * 🔴 **A reader with no caller is the defect this project keeps shipping.**
 *
 * US2 added six reader functions to `passives.ts`. Each one is correct, tested, and
 * worth nothing until something in the pipeline calls it — which is exactly how
 * `legalTargets` accepted taunt and fade filters for four features while the
 * resolver passed three of its five arguments.
 *
 * This test lives here rather than in `packages/sim` because the callers are split
 * across both trees: the resolver reads four, and the turn loop in this package
 * reads the other two. A guard confined to one package could not see the halves it
 * most needs to check.
 */
describe('every US2 reader has a caller', () => {
  const CONSUMERS = [
    '../../../../packages/sim/resolver/resolve.ts',
    '../../src/battle/turnLoop.ts',
    '../../../../packages/sim/rules/damage.ts',
    '../../../../packages/sim/rules/probability.ts',
  ].map((rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')).join('\n');

  /**
   * Named explicitly, because a reader is only discoverable by name and there is
   * no interface to parse — but each name is a symbol the compiler checks, so a
   * rename cannot leave a stale string behind.
   */
  const READERS = {
    critRefusal,
    ignoresShields,
    hitFloorFor,
    healMultiplierFor,
    onHealed,
    actsAgainAfter,
    fallenBetween,
  };

  it('is called from the resolver, the turn loop or the damage pipeline', () => {
    const uncalled = Object.keys(READERS).filter(
      (name) => !new RegExp(`\\b${name}\\(`).test(CONSUMERS),
    );

    expect(
      uncalled,
      'a reader nothing calls is a hook surface with no consumer — 020 shipped five of these',
    ).toEqual([]);
  });

  it('names readers that actually exist', () => {
    for (const [name, fn] of Object.entries(READERS)) {
      expect(typeof fn, `${name} is not a function`).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// WIRING — the battle SAYS a rune fired (021 US4, T059)
// ---------------------------------------------------------------------------

/**
 * 🔴 **The client formats `runesFired`. Nothing proves the server sends it.**
 *
 * That is this project's signature defect in its purest form: a field declared,
 * typed, rendered, unit-tested on the client — and populated by nobody. The log
 * would read exactly as it did before, every test would pass, and the effect a
 * player spent 200 shards on would go on being silent.
 *
 * So these drive a **real turn** through `takeTurn` and read the packet.
 *
 * `Too Close` is the subject because it is the one effect that fires
 * **unconditionally on being struck** — no chance roll, no threshold, no latch.
 * A conditional effect would make a green run indistinguishable from a run where
 * the condition simply did not hold.
 */
describe('a rune firing reaches the packet', () => {
  /** h07 Ember Saelith is Fire, so `Too Close` is genuinely in her primary pool. */
  const BEARER = 'h07';
  const DEFENDER_SEAT = 'd-front-0';
  const ATTACKER_SEAT = 'a-front-0';

  const boardWith = (utility: readonly string[]): BattleState =>
    withHero(board(ROSTER.slice(0, 6), [BEARER, ...ROSTER.slice(7, 12)]), DEFENDER_SEAT, {
      runeEffects: utility,
    });

  const strike = (state: BattleState) =>
    takeTurn(
      createSeed(),
      state,
      {
        sequence: 1,
        actorInstanceId: ATTACKER_SEAT,
        powerId: autoPowerOf(ROSTER[0]!),
        targetInstanceId: DEFENDER_SEAT,
      },
      0n,
    );

  /**
   * The premise, asserted rather than assumed: a miss reflects nothing, so a run
   * that happened to miss would report an empty list for the wrong reason.
   */
  const landedStrike = (state: BattleState) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const taken = strike(state);
      if (taken.outcome.hit && taken.outcome.deaths.length === 0) return taken;
    }
    throw new Error('60 attempts and the blow never landed — the fixture cannot measure anything');
  };

  it('🔴 names the rune that fired, on the champion it happened to', () => {
    const taken = landedStrike(boardWith(['too-close']));
    const fired = taken.outcome.runesFired ?? [];

    expect(fired, 'the server sent nothing — the client formats a field nobody fills').not.
      toHaveLength(0);
    expect(fired).toContain(`too-close:${ATTACKER_SEAT}`);
  });

  /**
   * 🔴 **The control.** The identical board without the rune must report nothing,
   * or the field is reporting the champion's passives and would name something on
   * every turn of every battle ever fought.
   */
  it('🔴 reports nothing for the same board without the rune', () => {
    const taken = landedStrike(boardWith([]));

    expect(taken.outcome.runesFired ?? []).toEqual([]);
  });

  /**
   * 🔴 **A passive is not a purchase.** Every champion carries three and a player
   * chose none of them, so naming them here would tell somebody their 200 shards
   * bought a thing a stranger's identical champion also has.
   */
  it('🔴 never names a passive, however many fired', () => {
    const taken = landedStrike(boardWith(['too-close']));
    const fired = taken.outcome.runesFired ?? [];

    const known = new Set(Object.keys(RUNE_EFFECTS));
    for (const entry of fired) {
      const id = entry.split(':')[0]!;
      expect(known.has(id), `"${id}" is not a rune effect id`).toBe(true);
    }
  });
});
