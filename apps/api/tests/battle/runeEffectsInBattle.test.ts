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

import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import {
  RUNE_MAGNITUDES,
  effectsInPool,
  heroStateOf,
  onStruck,
  poolOf,
  statBonusFor,
  applyPassiveEffects,
  maxHp,
} from '@lmntlz/sim/rules';
import { MalformedSquadError, buildInitialState, type SnapshotSeat } from '../../src/battle/board.js';
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
