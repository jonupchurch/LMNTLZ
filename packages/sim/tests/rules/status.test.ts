/**
 * The status layer's rules (020 T004, T008, T010).
 *
 * ### What these tests are actually for
 *
 * This whole feature exists because code was present and inert for four features
 * without anything noticing. So the bar here is **not** "the function returns a
 * value" — it is *"would this test fail if the rule were wrong?"*
 *
 * Two of them are marked 🔴 because they guard failures that are silent: the rune
 * trap, which would only ever hurt players who own runes, and the tier ladder,
 * which the authored power prompts depend on in a way no type can express.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import {
  CROWD_CONTROL,
  STATUS_CATALOG,
  STATUS_KINDS,
  applyStatus,
  afterUpkeep,
  cleanse,
  definitionOf,
  dotTickForTier,
  durationForTier,
  potencyForTier,
  shieldForTier,
  shieldOf,
  shredFactor,
  shredFraction,
  statChangeForTier,
  tickDurations,
  upkeepDamage,
  type Tier,
} from '../../rules/status.js';
import { STAT_CAP, effectiveStat } from '../../rules/state.js';
import { duel, status, withHero } from './fixtures.js';

const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------

describe('the catalog', () => {
  /**
   * **Thirteen, and the last two are deliberately not authorable.**
   *
   * `mark` was added for 020 US2 — `Find the Seam` sharpens against a repeat
   * target, and four uniques now read the same counter. `reach` was added for US3:
   * `Out of Reach` grants Zephyrine a row of range for a turn, which no `buff` can
   * carry because reach is not a stat and `statusPoints` matches on one.
   *
   * `statusKindSchema` in `@lmntlz/content` stays at **eleven** so no power can
   * author either — both are placed by a passive, and if both a rider and a
   * passive could write one, nothing would say which did.
   *
   * The asymmetry is asserted below rather than left as a comment, because a
   * later hand widening the schema to "match" would be undoing a decision.
   */
  it('defines every kind exactly once, with a stacking rule', () => {
    expect(STATUS_KINDS).toHaveLength(13);
    for (const kind of STATUS_KINDS) {
      expect(definitionOf(kind).kind, `${kind} is mis-keyed in the catalog`).toBe(kind);
      expect(definitionOf(kind).stacking.mode).toBeTruthy();
    }
  });

  it('only the damage-over-time family ticks damage', () => {
    const ticking = STATUS_KINDS.filter((k) => definitionOf(k).ticksDamage);
    expect(ticking.sort()).toEqual(['bleed', 'burn', 'poison']);
  });

  it('only the stat-modifier and shred families need a stat', () => {
    const needing = STATUS_KINDS.filter((k) => definitionOf(k).needsStat);
    expect(needing.sort()).toEqual(['buff', 'debuff', 'shred']);
  });

  /**
   * **`silence` must not incapacitate.** A silenced hero loses its powers, not its
   * turn — `05-status.md` is explicit that the tier-0 auto-attack still works. If
   * it entered `CROWD_CONTROL` it would skip phases 2–4 and silence would quietly
   * become a second stun, which the same document calls the strongest single
   * effect in the game.
   */
  it('crowd control is stun alone — silence does not cost a turn', () => {
    expect([...CROWD_CONTROL]).toEqual(['stun']);
    expect(CROWD_CONTROL.has('silence')).toBe(false);
  });

  /**
   * The four kinds `phases.ts` used to name — `freeze`, `petrify`, `sleep` —
   * never existed in `05-status.md`. Nothing could contradict them while nothing
   * could write a status.
   */
  it('carries no kind the design never specified', () => {
    for (const invented of ['freeze', 'petrify', 'sleep']) {
      expect(STATUS_KINDS as readonly string[]).not.toContain(invented);
    }
  });

  /**
   * **`mark` is passive-only, and this is the assertion that keeps it that way.**
   *
   * Reads the roster rather than the schema, so it stays true however the schema
   * is expressed: if a power ever authors a mark, the two writers problem is back
   * and nothing else in the suite would notice.
   */
  it('no authored rider may place a mark', () => {
    const authoredKinds = getAllHeroes().flatMap((h) =>
      h.powers.flatMap((p) => p.riders.map((r) => r.kind as string)),
    );
    expect(authoredKinds).not.toContain('mark');
  });
});

// ---------------------------------------------------------------------------

describe('🔴 the tier ladder', () => {
  /**
   * **The property the authored prompts depend on.**
   *
   * Tier-2 powers are written as escalations of their tier-1 counterpart — *"the
   * slow from Root and Hold, extended to 2 turns"*, *"the burning tick from Feed
   * the Bloom, now ticking twice"*. Those sentences are only true if every tier
   * strictly beats the one below on **at least one** axis.
   *
   * An earlier draft banded tiers 1–2 together at 2 turns, which silently made
   * every tier-2 rider identical to its tier-1 original — 18 powers describing an
   * escalation that did not happen. Nothing would have failed.
   */
  it('every tier strictly beats the one below on at least one axis', () => {
    for (let t = 2; t <= 5; t += 1) {
      const tier = t as Tier;
      const below = (t - 1) as Tier;

      const better =
        statChangeForTier(tier) > statChangeForTier(below) ||
        durationForTier(tier) > durationForTier(below);

      expect(better, `tier ${t} is not an escalation of tier ${t - 1}`).toBe(true);

      // And never worse on either.
      expect(statChangeForTier(tier)).toBeGreaterThanOrEqual(statChangeForTier(below));
      expect(durationForTier(tier)).toBeGreaterThanOrEqual(durationForTier(below));
    }
  });

  it('tier 1 lasts exactly one turn', () => {
    // The specific claim the banded draft broke.
    expect(durationForTier(1)).toBe(1);
    expect(durationForTier(2)).toBe(2);
  });

  /**
   * **The ladder is tuned to the Luck die and breaks outside it.**
   *
   * An earlier version ran 20–70, fitted to a `d100`. Against a Luck-sized die a
   * potency of 70 is unbridgeable — a tier-5 rider landed automatically against
   * 243 of 729 pairs. The usable band is roughly 20–60.
   */
  it('keeps the potency ladder inside the usable 20-60 band', () => {
    for (const tier of TIERS) {
      expect(potencyForTier(tier)).toBeGreaterThanOrEqual(20);
      expect(potencyForTier(tier)).toBeLessThanOrEqual(60);
    }
  });

  it('potency rises monotonically, so an ultimate is harder to shrug off', () => {
    const ladder = TIERS.map(potencyForTier);
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('tier 0 carries no rider at all', () => {
    expect(statChangeForTier(0)).toBe(0);
    expect(durationForTier(0)).toBe(0);
    expect(dotTickForTier(0, 40)).toBe(0);
    expect(shieldForTier(0, 40)).toBe(0);
  });

  it('scales damage-over-time and shields off the applier Might', () => {
    expect(dotTickForTier(2, 40)).toBe(14); // 40 x 0.35
    expect(shieldForTier(5, 40)).toBe(100); // 40 x 2.5
  });

  it('shred is a percentage, in three bands', () => {
    expect(shredFraction('small')).toBeCloseTo(0.2);
    expect(shredFraction('moderate')).toBeCloseTo(0.3);
    expect(shredFraction('large')).toBeCloseTo(0.4);
  });
});

// ---------------------------------------------------------------------------

describe('stacking', () => {
  const burn = (over: Parameters<typeof status>[1] = {}) =>
    status('burn', { magnitude: 10, turnsRemaining: 2, ...over });

  it('the same source refreshes duration and does not add magnitude', () => {
    const first = burn({ turnsRemaining: 1 });
    const after = applyStatus([first], burn({ turnsRemaining: 2 }));

    expect(after).toHaveLength(1);
    expect(after[0]!.turnsRemaining).toBe(2);
    expect(after[0]!.magnitude).toBe(10);
  });

  /**
   * **Identity includes the power, not just the hero.** Keying on the instance
   * alone would make two different powers on one hero refresh each other —
   * turning a designed combo into a no-op that reads as a balance problem.
   */
  it('two different powers on one hero stack rather than refreshing', () => {
    const after = applyStatus(
      [burn({ sourcePowerId: 'p-one' })],
      burn({ sourcePowerId: 'p-two' }),
    );
    expect(after).toHaveLength(2);
  });

  it('different sources stack', () => {
    const after = applyStatus(
      [burn({ sourceInstanceId: 'a' })],
      burn({ sourceInstanceId: 'b' }),
    );
    expect(after).toHaveLength(2);
  });

  it('caps damage over time at three instances per target', () => {
    let list = [] as readonly ReturnType<typeof burn>[];
    for (const src of ['a', 'b', 'c', 'd']) {
      list = applyStatus(list, burn({ sourceInstanceId: src }));
    }
    expect(list).toHaveLength(3);
    // Refused, not rotated — the first three survive.
    expect(list.map((s) => s.sourceInstanceId)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the larger shield and never two', () => {
    const big = status('shield', { magnitude: 100, sourceInstanceId: 'a' });
    const small = status('shield', { magnitude: 40, sourceInstanceId: 'b' });

    expect(applyStatus([big], small)).toHaveLength(1);
    expect(applyStatus([big], small)[0]!.magnitude).toBe(100);
    expect(applyStatus([small], big)[0]!.magnitude).toBe(100);
  });

  /**
   * One turn of stun is the strongest single effect in the game. Two stuns must
   * be **unrepresentable**, not merely un-produced.
   */
  it('never holds two stuns, whoever applied them', () => {
    const after = applyStatus(
      [status('stun', { sourceInstanceId: 'a', turnsRemaining: 1 })],
      status('stun', { sourceInstanceId: 'b', turnsRemaining: 1 }),
    );
    expect(after).toHaveLength(1);
  });

  /**
   * `Banked Coals` extends a duration by +1. A re-cast must not take that back,
   * which is why a refresh keeps the **longer** of the two.
   */
  it('a refresh never shortens an effect something else extended', () => {
    const extended = burn({ turnsRemaining: 5 });
    const after = applyStatus([extended], burn({ turnsRemaining: 2 }));
    expect(after[0]!.turnsRemaining).toBe(5);
  });
});

// ---------------------------------------------------------------------------

describe('the clock', () => {
  it('drops an effect when its last turn ticks away', () => {
    const one = [status('stun', { turnsRemaining: 1 })];
    expect(tickDurations(one)).toEqual([]);
  });

  it('counts down without touching magnitude', () => {
    const [after] = tickDurations([status('buff', { magnitude: 15, turnsRemaining: 3 })]);
    expect(after!.turnsRemaining).toBe(2);
    expect(after!.magnitude).toBe(15);
  });
});

describe('damage over time', () => {
  it('deals its snapshotted tick, flat, for a non-Fire source', () => {
    const state = withHero(duel('h01', 'h19'), 'a', {
      statuses: [status('burn', { magnitude: 14, turnsRemaining: 3 })],
    });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;

    expect(upkeepDamage(hero)).toBe(14);
  });

  /**
   * **`It Catches` reads ticks dealt, not elapsed duration.** `Banked Coals` adds
   * +1 turn, so `initialDuration - turnsRemaining` would be wrong for exactly the
   * champion most likely to carry both — and the file with the bug would be the
   * tick function, not the passive.
   */
  it('escalates a Fire burn by 50% of base per tick already dealt', () => {
    const at = (ticksDealt: number) => {
      const state = withHero(duel('h01', 'h19'), 'a', {
        statuses: [status('burn', { magnitude: 20, escalation: 0.5, ticksDealt, turnsRemaining: 4 })],
      });
      return upkeepDamage(state.heroes.find((h) => h.instanceId === 'a')!);
    };

    expect(at(0)).toBe(20);
    expect(at(1)).toBe(30);
    expect(at(2)).toBe(40);
  });

  it('advances only the ticking kinds', () => {
    const after = afterUpkeep([status('burn'), status('buff', { stat: 'might', magnitude: 10 })]);
    expect(after[0]!.ticksDealt).toBe(1);
    expect(after[1]!.ticksDealt).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('🔴 the derived stat layer, and the runes it must not eat', () => {
  const bramwen = getHero('h01');

  /**
   * **The regression this feature could most easily introduce, and it would be
   * silent.**
   *
   * `board.ts` writes a player's rune allocations into `statMods`. If a status
   * buff were written into the same record, expiring it would subtract from a bag
   * that also holds the rune's points — and the player would lose what they paid
   * for. Only players who own runes would ever see it, and no test written before
   * 020 would have caught it.
   *
   * Mutation check: make `effectiveStat` ignore `statuses` and read a combined
   * `statMods` instead, and this goes red.
   */
  it('a buff that comes and goes leaves the rune points untouched', () => {
    const runed = withHero(duel('h01', 'h19'), 'a', { statMods: { might: 10 } });
    const heroOf = (s: typeof runed) => s.heroes.find((h) => h.instanceId === 'a')!;

    const before = effectiveStat(heroOf(runed), bramwen.stats, 'might');
    expect(before).toBe(bramwen.stats.might + 10);

    const buffed = withHero(runed, 'a', {
      statuses: [status('buff', { stat: 'might', magnitude: 10, turnsRemaining: 2 })],
    });
    expect(effectiveStat(heroOf(buffed), bramwen.stats, 'might')).toBe(
      bramwen.stats.might + 20,
    );

    // The buff expires — which is only ever "drop the status".
    const expired = withHero(buffed, 'a', { statuses: [] });
    expect(
      effectiveStat(heroOf(expired), bramwen.stats, 'might'),
      'the buff took the rune points with it',
    ).toBe(before);
  });

  it('adds buffs and subtracts debuffs', () => {
    const state = withHero(duel('h01', 'h19'), 'a', {
      statuses: [
        status('buff', { stat: 'speed', magnitude: 15 }),
        status('debuff', { stat: 'speed', magnitude: 10, sourcePowerId: 'other' }),
      ],
    });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;
    expect(effectiveStat(hero, bramwen.stats, 'speed')).toBe(bramwen.stats.speed + 5);
  });

  /**
   * **Stat buffs need no ceiling of their own — the 75 cap already is one.** This
   * is why runic gear can be generous about stacking without anything running
   * away, and it is why `unbounded` is correct in the catalog rather than lazy.
   */
  it('three +10 buffs on a 45 stat compute at 75, not 85', () => {
    const base = { ...bramwen.stats, might: 45 };
    const state = withHero(duel('h01', 'h19'), 'a', {
      statuses: ['x', 'y', 'z'].map((id) =>
        status('buff', { stat: 'might', magnitude: 10, sourceInstanceId: id }),
      ),
    });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;

    expect(effectiveStat(hero, base, 'might')).toBe(STAT_CAP);
  });

  it('floors at zero rather than going negative', () => {
    const state = withHero(duel('h01', 'h19'), 'a', {
      statuses: [status('debuff', { stat: 'speed', magnitude: 75 })],
    });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;
    expect(effectiveStat(hero, bramwen.stats, 'speed')).toBe(0);
  });

  it('ignores statuses that name a different stat', () => {
    const state = withHero(duel('h01', 'h19'), 'a', {
      statuses: [status('buff', { stat: 'luck', magnitude: 20 })],
    });
    const hero = state.heroes.find((h) => h.instanceId === 'a')!;
    expect(effectiveStat(hero, bramwen.stats, 'might')).toBe(bramwen.stats.might);
  });
});

// ---------------------------------------------------------------------------

describe('shred and shields', () => {
  const heroWith = (...statuses: readonly ReturnType<typeof status>[]) => {
    const state = withHero(duel('h01', 'h19'), 'd', { statuses });
    return state.heroes.find((h) => h.instanceId === 'd')!;
  };

  it('composes multiplicatively, which is what stops double-counting', () => {
    // Vantric's kit: Seams Everywhere x0.70, then a unique x0.60.
    const hero = heroWith(
      status('shred', { stat: 'armor', magnitude: 0.3, sourcePowerId: 'seams' }),
      status('shred', { stat: 'armor', magnitude: 0.4, sourcePowerId: 'unique' }),
    );
    expect(shredFactor(hero, 'armor')).toBeCloseTo(0.42); // 0.7 x 0.6
  });

  it('leaves the other mitigation stat alone', () => {
    const hero = heroWith(status('shred', { stat: 'armor', magnitude: 0.4 }));
    expect(shredFactor(hero, 'magicResist')).toBe(1);
  });

  it('is 1 when nothing is shredding', () => {
    expect(shredFactor(heroWith(), 'armor')).toBe(1);
  });

  it('reports the shield pool', () => {
    expect(shieldOf(heroWith(status('shield', { magnitude: 60 })))).toBe(60);
    expect(shieldOf(heroWith())).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/**
 * **The seam between the roster and the engine, and neither side can check it
 * alone.**
 *
 * `@lmntlz/content` declares the eleven kinds a rider may name; `packages/sim`
 * decides what each one does. Content cannot import sim — the dependency runs one
 * way, and a cycle between the roster and the engine would be a real architectural
 * problem. So content restates the list, and a restated list is exactly the kind
 * that drifts silently.
 *
 * This is the only place both are in scope. Without it, a kind authored on a power
 * and missing from the catalog would be a rider that lands on nothing: no error, no
 * failing test, just a power that quietly does less than its text says — the shape
 * of defect this whole feature exists to remove.
 */
describe('the roster and the catalog agree about what a rider can be', () => {
  const authored = [
    ...new Set(
      getAllHeroes().flatMap((h) => h.powers.flatMap((p) => p.riders.map((r) => r.kind))),
    ),
  ].sort();

  it('every kind any power applies exists in the catalog', () => {
    for (const kind of authored) {
      expect(STATUS_KINDS as readonly string[], `no catalog entry for "${kind}"`).toContain(kind);
    }
  });

  it('every rider that names a stat names one the engine can read', () => {
    for (const hero of getAllHeroes()) {
      for (const power of hero.powers) {
        for (const rider of power.riders) {
          if (rider.stat === null) continue;
          expect(
            effectiveStat(
              { ...hero, statuses: [], statMods: {} } as never,
              hero.stats,
              rider.stat,
            ),
            `${power.id} names a stat effectiveStat cannot read`,
          ).toBeTypeOf('number');
        }
      }
    }
  });
});

describe('cleanse and strip', () => {
  it('a cleanse removes negatives and leaves positives', () => {
    const after = cleanse(
      [status('burn'), status('buff', { stat: 'might', magnitude: 10 })],
      'negative',
    );
    expect(after.map((s) => s.kind)).toEqual(['buff']);
  });

  it('a strip removes positives and leaves negatives', () => {
    const after = cleanse(
      [status('burn'), status('shield', { magnitude: 50 })],
      'positive',
    );
    expect(after.map((s) => s.kind)).toEqual(['burn']);
  });

  /**
   * Ember Saelith's `Never Quite Out` and Umbriel's `Written in Pencil`. **They
   * still expire** — they cannot be removed early, which is why the flag sits on
   * the instance rather than on the kind.
   */
  it('an uncleansable effect survives a cleanse but still ticks away', () => {
    const stubborn = status('burn', { cleansable: false, turnsRemaining: 1 });

    expect(cleanse([stubborn], 'negative')).toHaveLength(1);
    expect(tickDurations([stubborn])).toEqual([]);
  });

  /**
   * 🔴 **A bounded removal, and the two rules `05-status.md` states about it**
   * (021 US3). `Take It Back` strips *one* buff, which is the only thing that
   * passes a count today.
   */
  describe('a bounded removal', () => {
    const buff = (stat: 'might' | 'agility' | 'speed', patch = {}) =>
      status('buff', { stat, magnitude: 10, ...patch });

    it('🔴 takes the most recently applied, not the oldest', () => {
      const after = cleanse([buff('might'), buff('agility'), buff('speed')], 'positive', 1);

      expect(after, 'exactly one went').toHaveLength(2);
      expect(after.map((s) => s.stat), 'the newest is the one taken back').toEqual([
        'might',
        'agility',
      ]);
    });

    /**
     * 🔴 **The rule most likely to be got wrong**, and it is not the obvious one:
     * an uncleansable effect must not *consume* the bound. An implementation that
     * counted it would leave the real buff standing and the strip spent on
     * something it was never allowed to take — a rune that visibly does nothing
     * against exactly the champions it is meant to answer.
     */
    it('🔴 passes over an uncleansable effect rather than spending the count on it', () => {
      const after = cleanse(
        [buff('might'), buff('agility'), buff('speed', { cleansable: false })],
        'positive',
        1,
      );

      expect(after).toHaveLength(2);
      expect(after.map((s) => s.stat), 'the protected one stays; the next one down goes').toEqual([
        'might',
        'speed',
      ]);
    });

    it('removes fewer than the count when there are fewer to remove', () => {
      const after = cleanse([buff('might'), status('burn')], 'positive', 3);
      expect(after.map((s) => s.kind)).toEqual(['burn']);
    });

    it('an omitted count still removes every one — the default is unchanged', () => {
      const all = [buff('might'), buff('agility'), status('burn')];
      expect(cleanse(all, 'positive')).toHaveLength(1);
    });
  });
});
