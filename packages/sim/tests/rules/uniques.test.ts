/**
 * The nineteen approved unique passives (020 US3, T040).
 *
 * ### What every test here has to be careful about
 *
 * These are the same trap as US2's thirteen, one step worse: nineteen effects that
 * have **never run in any form**, written from a table of one-line descriptions. An
 * assertion an inert implementation would also satisfy proves nothing, and here it
 * would be very easy to write one — most of these grant a number, and *"the number
 * is a number"* is not a claim.
 *
 * So every test below either **compares against a control** — the same board without
 * the trigger, or a champion who does not carry the passive — or asserts a value only
 * reachable through the passive. Where a passive has a threshold, both sides of it are
 * asserted, because a condition inverted is the single easiest way to get one of these
 * exactly backwards and still see a number move.
 *
 * ### The roster, for reading the boards below
 *
 * | | | | |
 * |---|---|---|---|
 * | h01 Bramwen · The Long Patience | h02 Ossic · The Bone Beneath | h03 Terragosa · Something Green Returns | h04 Zephyrine · Out of Reach |
 * | h05 Cirrolan · Word Travels | h06 Vael · Gravity Is a Suggestion | h08 Pyrrhic · Nothing Left to Take | h11 Tidewarden Coll · Ground Yielded |
 * | h12 Nix · No Ripple | h13 Seraphel · Under Judgement | h14 Lucen · Nothing Casts Twice | h15 Auriel Dawnkeep · Still Burning |
 * | h16 Nyxara · Merciful | h18 Corvane · The Ledger Kept | h19 Kaellis · The Duelist's Habit | h20 Reyna · Confluence |
 * | h21 Grieve · Room to Swing | h22 Vantric · Seams Everywhere | h24 Lord Aiguille · First Guard | h25 Boldrek · No Warning |
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import {
  PASSIVE_MAGNITUDES,
  SURVIVAL_HP,
  applyPassiveEffects,
  cooldownExtensionFor,
  critMultiplierFor,
  damageMultiplierFor,
  incomingMultiplierFor,
  lethalGuard,
  mitigationMultiplierFor,
  onAct,
  onAllyStruck,
  onApplied,
  onDeath,
  onStrike,
  onStruck,
  onUpkeep,
  statBonusFor,
  type StrikeContext,
} from '../../rules/passives.js';
import { maxHp } from '../../rules/damage.js';
import { inReach } from '../../rules/reach.js';
import { markCount } from '../../rules/status.js';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { heroStateFor, stateOf, status, withHero } from './fixtures.js';

const M = PASSIVE_MAGNITUDES;

/** A board with a named attacker, defenders, and optional allies of the attacker. */
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

function strike(
  state: BattleState,
  attackerId: string,
  defenderId: string,
  powerIndex = 0,
): StrikeContext {
  const attacker = heroStateOf(state, attackerId);
  const defender = heroStateOf(state, defenderId);
  const pool = maxHp(defender);
  return {
    state,
    attacker,
    defender,
    power: getHero(attacker.heroId).powers[powerIndex]!,
    defenderHpFraction: pool > 0 ? defender.hp / pool : 0,
  };
}

const statusesOf = (state: BattleState, id: string): readonly HeroState['statuses'][number][] =>
  heroStateOf(state, id).statuses;

const buffPoints = (state: BattleState, id: string, stat: string): number =>
  statusesOf(state, id)
    .filter((s) => s.kind === 'buff' && s.stat === stat)
    .reduce((sum, s) => sum + s.magnitude, 0);

// ---------------------------------------------------------------------------
// 1 · The Long Patience — Bramwen
// ---------------------------------------------------------------------------

describe('The Long Patience — Bramwen is paid for being ignored', () => {
  const state = board({ heroId: 'h01', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('grows by a step on each quiet Upkeep', () => {
    let next = state;
    const seen: number[] = [];

    for (let i = 0; i < 3; i++) {
      next = applyPassiveEffects(next, onUpkeep(next, heroStateOf(next, 'a')), maxHp);
      seen.push(buffPoints(next, 'a', 'might'));
    }

    expect(seen).toEqual([M.longPatienceStep, M.longPatienceStep * 2, M.longPatienceStep * 3]);
  });

  it('stops at the cap rather than growing forever', () => {
    let next = state;
    for (let i = 0; i < 20; i++) {
      next = applyPassiveEffects(next, onUpkeep(next, heroStateOf(next, 'a')), maxHp);
    }
    expect(buffPoints(next, 'a', 'might')).toBe(M.longPatienceCap);
  });

  /**
   * 🔴 **The whole build, not one step.** A reset that decremented would leave
   * Bramwen holding a number the next Upkeep grows again from, which is a
   * different — and much stronger — passive.
   */
  it('loses all of it to a single landed hit', () => {
    let next = state;
    for (let i = 0; i < 4; i++) {
      next = applyPassiveEffects(next, onUpkeep(next, heroStateOf(next, 'a')), maxHp);
    }
    expect(buffPoints(next, 'a', 'might')).toBe(M.longPatienceStep * 4);

    const hit = applyPassiveEffects(next, onStruck(strike(next, 'd', 'a')), maxHp);
    expect(buffPoints(hit, 'a', 'might')).toBe(0);
  });

  it('does nothing for a champion who does not carry it', () => {
    const other = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    const after = applyPassiveEffects(other, onUpkeep(other, heroStateOf(other, 'a')), maxHp);
    expect(buffPoints(after, 'a', 'might')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · The Bone Beneath — Ossic
// ---------------------------------------------------------------------------

describe('The Bone Beneath — Ossic hardens as he falls', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h02', row: 4, id: 'd' }]);
  const pool = maxHp(heroStateOf(state, 'd'));

  it('grants nothing at full health', () => {
    expect(statBonusFor(state, heroStateOf(state, 'd'), 'magicResist')).toBe(0);
  });

  it('grants the tier-4 stat change below half pool', () => {
    const hurt = withHero(state, 'd', { hp: Math.floor(pool * 0.4) });
    expect(statBonusFor(hurt, heroStateOf(hurt, 'd'), 'magicResist')).toBe(
      M.boneBeneathMagicResist,
    );
  });

  /**
   * ⚠️ **`Magic Resist`, never `Armor`** — `05-status.md`'s balance review settled
   * this before the trigger was written, and it is the one thing about this passive
   * that was never open. Asserted so it cannot be "tidied" into the stat every other
   * tank grants.
   */
  it('never touches Armor, at any health', () => {
    const hurt = withHero(state, 'd', { hp: 1 });
    expect(statBonusFor(hurt, heroStateOf(hurt, 'd'), 'armor')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3 · Something Green Returns — Terragosa
// ---------------------------------------------------------------------------

describe('Something Green Returns — Terragosa pays the squad for a death', () => {
  /** Terragosa and two allies, against one enemy that will do the killing. */
  const state = board(
    { heroId: 'h03', row: 2 },
    [{ heroId: 'h19', row: 4, id: 'd' }],
    [
      { heroId: 'h01', row: 1, id: 'ally' },
      { heroId: 'h08', row: 3, id: 'far' },
    ],
  );

  const hurt = (s: BattleState): BattleState =>
    withHero(withHero(s, 'a', { hp: 10 }), 'far', { hp: 10 });

  it('restores every surviving ally when one of them falls', () => {
    const wounded = hurt(state);
    const dead = withHero(wounded, 'ally', { hp: 0 });
    const after = applyPassiveEffects(
      dead,
      onDeath(dead, heroStateOf(wounded, 'ally')),
      maxHp,
    );

    expect(heroStateOf(after, 'a').hp).toBeGreaterThan(10);
    expect(heroStateOf(after, 'far').hp).toBeGreaterThan(10);
  });

  /**
   * 🔴 **An enemy death pays nothing.** The trigger is *an ally falls* — a passive
   * that healed on any death would be `The Veil Closes` with a bigger payout, and
   * Terragosa would be rewarded for her own side winning a trade.
   */
  it('pays nothing when the champion that fell was an enemy', () => {
    const wounded = hurt(state);
    const dead = withHero(wounded, 'd', { hp: 0 });
    const after = applyPassiveEffects(dead, onDeath(dead, heroStateOf(wounded, 'd')), maxHp);

    expect(heroStateOf(after, 'a').hp).toBe(10);
    expect(heroStateOf(after, 'far').hp).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 4 · Out of Reach — Zephyrine
// ---------------------------------------------------------------------------

describe('Out of Reach — Zephyrine rents a row', () => {
  /**
   * Zephyrine is reach 1 in row 3. Row 5 is distance 2 with row 4 occupied, so it
   * is out of reach until the passive fires — the cleanest possible control.
   */
  const state = board({ heroId: 'h04', row: 3 }, [
    { heroId: 'h19', row: 4, id: 'near' },
    { heroId: 'h01', row: 5, id: 'far' },
  ]);

  it('cannot touch the second row before it acts', () => {
    expect(inReach(state, 'a', 5)).toBe(false);
  });

  it('can once it has', () => {
    const after = applyPassiveEffects(state, onAct(state, heroStateOf(state, 'a')), maxHp);
    expect(inReach(after, 'a', 5)).toBe(true);
  });

  it('grants a reach effect rather than writing the rune field', () => {
    const after = applyPassiveEffects(state, onAct(state, heroStateOf(state, 'a')), maxHp);
    const granted = statusesOf(after, 'a').filter((s) => s.kind === 'reach');

    expect(granted).toHaveLength(1);
    expect(granted[0]!.magnitude).toBe(M.outOfReachRows);
    /* The rune field is the player's, and a passive may never write it. */
    expect(heroStateOf(after, 'a').reachMod).toBe(0);
  });

  it('does nothing for a champion who does not carry it', () => {
    const other = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    expect(onAct(other, heroStateOf(other, 'a'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5 · Word Travels — Cirrolan
// ---------------------------------------------------------------------------

describe('Word Travels — Cirrolan keeps half of what he gives', () => {
  const state = board(
    { heroId: 'h05', row: 3 },
    [{ heroId: 'h19', row: 4, id: 'd' }],
    [{ heroId: 'h01', row: 1, id: 'ally' }],
  );

  const buff = status('buff', { stat: 'might', magnitude: 20, sourceInstanceId: 'a' });

  it('copies a buff onto itself at half magnitude', () => {
    const echo = onApplied({
      state,
      applier: heroStateOf(state, 'a'),
      bearer: heroStateOf(state, 'ally'),
      instance: buff,
    });
    const after = applyPassiveEffects(state, echo, maxHp);

    expect(buffPoints(after, 'a', 'might')).toBe(10);
  });

  /**
   * 🔴 **Never onto itself.** A copy that could itself be copied would not
   * terminate, and the guard is in the hook rather than in the caller so no future
   * call site can lose it.
   */
  it('copies nothing when the bearer is Cirrolan himself', () => {
    expect(
      onApplied({
        state,
        applier: heroStateOf(state, 'a'),
        bearer: heroStateOf(state, 'a'),
        instance: buff,
      }),
    ).toEqual([]);
  });

  /** 🔴 A debuff is not good news. Mirroring it would be a passive that self-harms. */
  it('copies nothing negative', () => {
    const debuff = status('debuff', { stat: 'might', magnitude: 20, sourceInstanceId: 'a' });
    expect(
      onApplied({
        state,
        applier: heroStateOf(state, 'a'),
        bearer: heroStateOf(state, 'd'),
        instance: debuff,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6 · Gravity Is a Suggestion — Vael  ·  18 · Seams Everywhere — Vantric
// ---------------------------------------------------------------------------

describe('Gravity Is a Suggestion — Vael is paid for holding the back seat', () => {
  it('takes nothing off a wall at distance 1', () => {
    const close = board({ heroId: 'h06', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);
    expect(mitigationMultiplierFor(strike(close, 'a', 'd'))).toBe(1);
  });

  it('takes its share at distance 2', () => {
    const far = board({ heroId: 'h06', row: 3 }, [
      { heroId: 'h19', row: 4, id: 'near' },
      { heroId: 'h01', row: 5, id: 'd' },
    ]);
    expect(mitigationMultiplierFor(strike(far, 'a', 'd'))).toBe(M.gravityMitigation);
  });
});

describe('Seams Everywhere — Vantric always finds it', () => {
  const state = board({ heroId: 'h22', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('applies with no condition at all', () => {
    expect(mitigationMultiplierFor(strike(state, 'a', 'd'))).toBe(M.seamsMitigation);
  });

  /** The anchor the other mitigation passive is priced from: they are the same size. */
  it('is priced identically to Gravity Is a Suggestion', () => {
    expect(M.seamsMitigation).toBe(M.gravityMitigation);
  });

  it('does nothing for a champion who does not carry it', () => {
    const other = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    expect(mitigationMultiplierFor(strike(other, 'a', 'd'))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7 · Nothing Left to Take — Pyrrhic  ·  11 · Under Judgement — Seraphel
// ---------------------------------------------------------------------------

describe('Nothing Left to Take — Pyrrhic punishes a bare target', () => {
  const state = board({ heroId: 'h08', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('pays against a target carrying nothing', () => {
    expect(damageMultiplierFor(strike(state, 'a', 'd'))).toBeCloseTo(1 + M.nothingLeftBonus, 5);
  });

  it('pays nothing once the target holds anything positive', () => {
    const shielded = withHero(state, 'd', { statuses: [status('shield', { magnitude: 20 })] });
    expect(damageMultiplierFor(strike(shielded, 'a', 'd'))).toBe(1);
  });

  /** 🔴 A *negative* effect is not what turns it off — that would be the inverse. */
  it('still pays against a target carrying only a debuff', () => {
    const cursed = withHero(state, 'd', {
      statuses: [status('debuff', { stat: 'might', magnitude: 10 })],
    });
    expect(damageMultiplierFor(strike(cursed, 'a', 'd'))).toBeCloseTo(1 + M.nothingLeftBonus, 5);
  });
});

describe('Under Judgement — Seraphel punishes a marked one', () => {
  const state = board({ heroId: 'h13', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);

  it('pays nothing against a clean target', () => {
    expect(damageMultiplierFor(strike(state, 'a', 'd'))).toBe(1);
  });

  it('pays against a target carrying a debuff', () => {
    const cursed = withHero(state, 'd', {
      statuses: [status('debuff', { stat: 'might', magnitude: 10 })],
    });
    expect(damageMultiplierFor(strike(cursed, 'a', 'd'))).toBeCloseTo(1 + M.underJudgementBonus, 5);
  });

  /**
   * 🔴 **A `mark` is bookkeeping, not a harmful effect.** Four passives leave marks
   * on every target they touch, so counting them would make this fire against
   * almost anybody and stop being a condition at all.
   */
  it('is not triggered by a mark', () => {
    const marked = withHero(state, 'd', {
      statuses: [status('mark', { magnitude: 1, sourcePowerId: 'passive:Find the Seam' })],
    });
    expect(damageMultiplierFor(strike(marked, 'a', 'd'))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9 · Ground Yielded — Tidewarden Coll
// ---------------------------------------------------------------------------

describe('Ground Yielded — Coll covers the champion beside her', () => {
  /** Coll in row 2 with an ally beside her, and one further back. */
  const state = board(
    { heroId: 'h19', row: 3 },
    [
      { heroId: 'h11', row: 5, id: 'coll' },
      { heroId: 'h01', row: 5, id: 'beside' },
      { heroId: 'h08', row: 6, id: 'behind' },
    ],
  );

  it('shields an ally struck in its own row', () => {
    const effects = onAllyStruck(
      state,
      heroStateOf(state, 'a'),
      heroStateOf(state, 'beside'),
      getHero('h19').powers[0]!,
    );
    const after = applyPassiveEffects(state, effects, maxHp);
    const shields = statusesOf(after, 'beside').filter((s) => s.kind === 'shield');

    expect(shields).toHaveLength(1);
    expect(shields[0]!.magnitude).toBeGreaterThan(0);
  });

  it('does nothing for an ally in another row', () => {
    const effects = onAllyStruck(
      state,
      heroStateOf(state, 'a'),
      heroStateOf(state, 'behind'),
      getHero('h19').powers[0]!,
    );
    expect(effects).toEqual([]);
  });

  /** 🔴 Coll is never her own bystander — the hook refuses the defender outright. */
  it('does nothing when Coll herself is the one struck', () => {
    const effects = onAllyStruck(
      state,
      heroStateOf(state, 'a'),
      heroStateOf(state, 'coll'),
      getHero('h19').powers[0]!,
    );
    expect(effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10 · No Ripple — Nix
// ---------------------------------------------------------------------------

describe('No Ripple — Nix is untouched until she is not', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h12', row: 4, id: 'd' }]);

  it('grants Agility while nothing has landed', () => {
    expect(statBonusFor(state, heroStateOf(state, 'd'), 'agility')).toBe(M.noRippleAgility);
  });

  it('grants nothing once a blow has landed', () => {
    const after = applyPassiveEffects(state, onStruck(strike(state, 'a', 'd')), maxHp);
    expect(statBonusFor(after, heroStateOf(after, 'd'), 'agility')).toBe(0);
  });

  /**
   * 🔴 **It does not come back.** *"This battle"* is a fact about the past, so the
   * mark that records it is uncleansable — a support that could restore it would be
   * handing Nix a stat by pretending a hit never happened.
   */
  it('records it with a mark nothing can remove', () => {
    const after = applyPassiveEffects(state, onStruck(strike(state, 'a', 'd')), maxHp);
    const mark = statusesOf(after, 'd').find((s) => s.kind === 'mark');

    expect(mark?.cleansable).toBe(false);
    expect(Number.isFinite(mark?.turnsRemaining ?? 0)).toBe(false);
  });

  it('touches no stat but Agility', () => {
    expect(statBonusFor(state, heroStateOf(state, 'd'), 'armor')).toBe(0);
    expect(statBonusFor(state, heroStateOf(state, 'd'), 'luck')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12 · Nothing Casts Twice — Lucen
// ---------------------------------------------------------------------------

describe('Nothing Casts Twice — Lucen taxes the enemy hand', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h14', row: 5, id: 'lucen' }]);

  it('lengthens what an enemy just spent', () => {
    expect(cooldownExtensionFor(state, 'a')).toBe(M.nothingCastsTwiceTurns);
  });

  /** 🔴 It never taxes its own side, or Lucen would be a liability to his squad. */
  it('never touches its own side', () => {
    expect(cooldownExtensionFor(state, 'lucen')).toBe(0);
  });

  it('stops when Lucen falls', () => {
    const dead = withHero(state, 'lucen', { hp: 0 });
    expect(cooldownExtensionFor(dead, 'a')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 13 · Still Burning — Auriel Dawnkeep
// ---------------------------------------------------------------------------

describe('Still Burning — Auriel refuses once', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h15', row: 4, id: 'd' }]);

  it('offers the guard the first time', () => {
    expect(lethalGuard(state, heroStateOf(state, 'd'))).not.toBeNull();
  });

  /**
   * 🔴 **Once per battle, and the guard pays for itself.** The mark it returns is
   * what makes the second call refuse — there is no field on `HeroState` to forget
   * to write.
   */
  it('refuses the second time, after its own cost is folded', () => {
    const paid = lethalGuard(state, heroStateOf(state, 'd'));
    const after = applyPassiveEffects(state, paid ?? [], maxHp);

    expect(lethalGuard(after, heroStateOf(after, 'd'))).toBeNull();
  });

  it('leaves a mark nothing can cleanse away for a second use', () => {
    const paid = lethalGuard(state, heroStateOf(state, 'd'));
    const after = applyPassiveEffects(state, paid ?? [], maxHp);
    const mark = statusesOf(after, 'd').find((s) => s.kind === 'mark');

    expect(mark?.cleansable).toBe(false);
  });

  it('offers nothing to a champion who does not carry it', () => {
    const other = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    expect(lethalGuard(other, heroStateOf(other, 'd'))).toBeNull();
  });

  it('survives at exactly one point', () => {
    expect(SURVIVAL_HP).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 14 · Merciful — Nyxara
// ---------------------------------------------------------------------------

describe('Merciful — Nyxara finishes', () => {
  const state = board({ heroId: 'h16', row: 3 }, [{ heroId: 'h19', row: 4, id: 'd' }]);
  const pool = maxHp(heroStateOf(state, 'd'));

  it('pays nothing at full health', () => {
    expect(damageMultiplierFor(strike(state, 'a', 'd'))).toBe(1);
  });

  /**
   * **It compounds with `Finish It`, and that is the approved reading.** Nyxara is a
   * Striker, so under a quarter she carries both — a champion whose signature did
   * not compound with its Role would play like every other Striker.
   */
  it('compounds with the Striker bonus under a quarter', () => {
    const dying = withHero(state, 'd', { hp: Math.floor(pool * 0.2) });
    const both = (1 + M.roleDamageBonus) * (1 + M.mercifulBonus);

    expect(damageMultiplierFor(strike(dying, 'a', 'd'))).toBeCloseTo(both, 5);
  });

  /** Between the two thresholds only the Role bonus applies — the narrower one is off. */
  it('pays only the Role bonus between the two thresholds', () => {
    const hurt = withHero(state, 'd', { hp: Math.floor(pool * 0.4) });
    expect(damageMultiplierFor(strike(hurt, 'a', 'd'))).toBeCloseTo(1 + M.roleDamageBonus, 5);
  });
});

// ---------------------------------------------------------------------------
// 16 · The Duelist's Habit — Kaellis
// ---------------------------------------------------------------------------

describe("The Duelist's Habit — Kaellis is worth most on a stranger", () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  it('pays on a target it has not struck', () => {
    expect(damageMultiplierFor(strike(state, 'a', 'd'))).toBeCloseTo(1 + M.duelistBonus, 5);
  });

  it('stops paying once it has', () => {
    const after = applyPassiveEffects(state, onStrike(strike(state, 'a', 'd')), maxHp);
    expect(damageMultiplierFor(strike(after, 'a', 'd'))).toBe(1);
  });

  /** 🔴 Keyed per target: striking one hero does not make the next one familiar. */
  it('is counted per target rather than per battle', () => {
    const two = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h01', row: 4, id: 'd' },
      { heroId: 'h08', row: 4, id: 'other' },
    ]);
    const after = applyPassiveEffects(two, onStrike(strike(two, 'a', 'd')), maxHp);

    expect(damageMultiplierFor(strike(after, 'a', 'd'))).toBe(1);
    expect(damageMultiplierFor(strike(after, 'a', 'other'))).toBeCloseTo(1 + M.duelistBonus, 5);
  });
});

// ---------------------------------------------------------------------------
// 17 · Confluence — Reyna Two-Rivers
// ---------------------------------------------------------------------------

describe('Confluence — Reyna is paid for using her whole kit', () => {
  const state = board({ heroId: 'h20', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
  const forces = getHero('h20').strengths;

  const powerOfType = (type: string): number =>
    getHero('h20').powers.findIndex((p) => p.types.includes(type as never));

  it('pays nothing before either Force has landed', () => {
    expect(damageMultiplierFor(strike(state, 'a', 'd'))).toBe(1);
  });

  it('pays nothing on one Force alone', () => {
    const one = applyPassiveEffects(
      state,
      onStrike(strike(state, 'a', 'd', powerOfType(forces[0]!))),
      maxHp,
    );
    expect(markCount(heroStateOf(one, 'a'), 'a', `passive:Confluence:${forces[0]}`)).toBe(1);
    expect(damageMultiplierFor(strike(one, 'a', 'd'))).toBe(1);
  });

  it('pays once both have', () => {
    let next = state;
    for (const force of forces) {
      next = applyPassiveEffects(
        next,
        onStrike(strike(next, 'a', 'd', powerOfType(force))),
        maxHp,
      );
    }
    expect(damageMultiplierFor(strike(next, 'a', 'd'))).toBeCloseTo(1 + M.confluenceBonus, 5);
  });
});

// ---------------------------------------------------------------------------
// 20 · The Ledger Kept — Corvane
// ---------------------------------------------------------------------------

describe('The Ledger Kept — Corvane counts what he could not save', () => {
  const state = board(
    { heroId: 'h19', row: 3 },
    [
      { heroId: 'h18', row: 4, id: 'corvane' },
      { heroId: 'h01', row: 6, id: 'far' },
    ],
  );

  it('gains a step for an ally that falls', () => {
    const dead = withHero(state, 'far', { hp: 0 });
    const after = applyPassiveEffects(dead, onDeath(dead, heroStateOf(state, 'far')), maxHp);

    expect(buffPoints(after, 'corvane', 'might')).toBe(M.ledgerStep);
  });

  /**
   * 🔴 **Reach never gates grief** — the difference between `onAnyDeath` and the
   * `onDeathNearby` that `The Veil Closes` uses.
   *
   * ⚠️ **The reach has to be reduced synthetically, and that is a fact about the
   * board rather than a weakness of the test.** A side holds three rows, so the
   * furthest an ally can be is two occupied rows away — and Corvane is reach 2.
   * *On today's roster he reaches every squadmate*, so the gate makes no
   * observable difference to him and a test using the real geometry would pass
   * against a reach-gated implementation too.
   *
   * `reachMod: -1` is what makes the distinction visible. Corvane carries **both**
   * passives, so the same death is the control: the ledger counts it, and the veil
   * — which is reach-gated — heals nothing.
   *
   * ⚠️ **`keep` is load-bearing and the first draft did not have it.** Reach is
   * measured over *occupied* rows, so the champion that just fell was emptying its
   * own row and pulling itself back into range — the veil fired, and the test read
   * as a bug in the ledger. A second body in row 6 holds the row, which is the
   * mechanic working rather than a workaround: *range opens up as a battle wears
   * on.*
   */
  it('counts an ally it could not have reached, where the veil does not', () => {
    const stretched = board({ heroId: 'h19', row: 3 }, [
      { heroId: 'h18', row: 4, id: 'corvane' },
      { heroId: 'h08', row: 5, id: 'mid' },
      { heroId: 'h01', row: 6, id: 'far' },
      { heroId: 'h12', row: 6, id: 'keep' },
    ]);
    const short = withHero(withHero(stretched, 'corvane', { reachMod: -1 }), 'corvane', {
      reachMod: -1,
      hp: 10,
    });

    expect(inReach(short, 'corvane', 6)).toBe(false);

    const dead = withHero(short, 'far', { hp: 0 });
    const after = applyPassiveEffects(dead, onDeath(dead, heroStateOf(short, 'far')), maxHp);

    expect(buffPoints(after, 'corvane', 'might')).toBe(M.ledgerStep);
    expect(heroStateOf(after, 'corvane').hp, 'the reach-gated veil should not have fired').toBe(10);
  });

  it('counts nothing for an enemy death', () => {
    const dead = withHero(state, 'a', { hp: 0 });
    const after = applyPassiveEffects(dead, onDeath(dead, heroStateOf(state, 'a')), maxHp);

    expect(buffPoints(after, 'corvane', 'might')).toBe(0);
  });

  it('stops at the cap', () => {
    let next = state;
    for (let i = 0; i < 12; i++) {
      const dead = withHero(next, 'far', { hp: 0 });
      next = applyPassiveEffects(dead, onDeath(dead, heroStateOf(state, 'far')), maxHp);
    }
    expect(buffPoints(next, 'corvane', 'might')).toBe(M.ledgerCap);
  });
});

// ---------------------------------------------------------------------------
// 21 · Room to Swing — Grieve
// ---------------------------------------------------------------------------

describe('Room to Swing — Grieve is worth more surrounded', () => {
  const grieveWith = (enemies: number): BattleState =>
    board(
      { heroId: 'h21', row: 3 },
      Array.from({ length: enemies }, (_, i) => ({
        heroId: 'h01',
        row: 4 as const,
        id: `e${i}`,
      })),
    );

  it('grants nothing with nobody in reach', () => {
    const alone = board({ heroId: 'h21', row: 3 }, [{ heroId: 'h01', row: 6, id: 'far' }]);
    const state = withHero(alone, 'far', { hp: 0 });
    expect(statBonusFor(state, heroStateOf(state, 'a'), 'armor')).toBe(0);
  });

  it('rises a step per enemy in reach', () => {
    for (const n of [1, 2, 3]) {
      const state = grieveWith(n);
      expect(statBonusFor(state, heroStateOf(state, 'a'), 'armor')).toBe(n * M.roomToSwingStep);
    }
  });

  it('stops at the cap', () => {
    const state = grieveWith(10);
    expect(statBonusFor(state, heroStateOf(state, 'a'), 'armor')).toBe(M.roomToSwingCap);
  });

  /** 🔴 It shrinks as the enemy squad falls — a fallen hero is not in reach of anything. */
  it('falls back as enemies do', () => {
    const three = grieveWith(3);
    const two = withHero(three, 'e2', { hp: 0 });

    expect(statBonusFor(two, heroStateOf(two, 'a'), 'armor')).toBe(2 * M.roomToSwingStep);
  });
});

// ---------------------------------------------------------------------------
// 22 · First Guard — Lord Aiguille
// ---------------------------------------------------------------------------

describe('First Guard — the opening blow costs an enemy something', () => {
  const state = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h24', row: 4, id: 'd' }]);

  it('reduces the first blow from an attacker', () => {
    expect(incomingMultiplierFor(strike(state, 'a', 'd'))).toBe(M.firstGuardReduction);
  });

  it('does nothing to the second', () => {
    const after = applyPassiveEffects(state, onStruck(strike(state, 'a', 'd')), maxHp);
    expect(incomingMultiplierFor(strike(after, 'a', 'd'))).toBe(1);
  });

  /**
   * 🔴 **Once per enemy, not once per battle.** A whole squad spends it six times;
   * keying it on the battle instead would make it a single blow's discount and a
   * far weaker passive than the one that was approved.
   */
  it('is spent per attacker', () => {
    const two = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h24', row: 4, id: 'd' }], [
      { heroId: 'h08', row: 1, id: 'second' },
    ]);
    const after = applyPassiveEffects(two, onStruck(strike(two, 'a', 'd')), maxHp);

    expect(incomingMultiplierFor(strike(after, 'a', 'd'))).toBe(1);
    expect(incomingMultiplierFor(strike(after, 'second', 'd'))).toBe(M.firstGuardReduction);
  });
});

// ---------------------------------------------------------------------------
// 23 · No Warning — Boldrek
// ---------------------------------------------------------------------------

describe('No Warning — Boldrek crits harder', () => {
  const state = board({ heroId: 'h25', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);

  it('replaces the crit multiplier rather than multiplying it', () => {
    expect(critMultiplierFor(strike(state, 'a', 'd'))).toBe(M.noWarningCrit);
  });

  /**
   * `null` rather than the default, so `damage.ts` keeps ownership of
   * `CRIT_MULTIPLIER` and this module needs no import that would be a cycle.
   */
  it('answers null for a champion who does not carry it', () => {
    const other = board({ heroId: 'h19', row: 3 }, [{ heroId: 'h01', row: 4, id: 'd' }]);
    expect(critMultiplierFor(strike(other, 'a', 'd'))).toBeNull();
  });
});
