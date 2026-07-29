/**
 * **Priority sorts. It never filters** (SC-007, FR-009).
 *
 * The property this file defends is negative and easy to break by accident: no
 * configuration a player can save may make the engine unable to act. The
 * implementation earns it structurally — `chooseTarget` has no parameter that
 * could remove a candidate — and these tests are what say so out loud, including
 * for the case that looks most like an exception.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { legalTargets } from '../../rules/targeting.js';
import { TARGET_RULES } from '../../ai/types.js';
import { chooseTarget } from '../../ai/targeting.js';
import { atTurn, board, config, fixedSeed, powerOfTier, withHero } from './fixtures.js';

const SEED = fixedSeed();
const SIX = ['h01', 'h02', 'h14', 'h19', 'h23', 'h25'];

const enemiesOf = (state: ReturnType<typeof board>, actorId: string, powerId: string) =>
  legalTargets(state, actorId, powerId).candidates;

describe('priority sorts, it never filters', () => {
  it('takes the only available target even when the priority ranks it last', () => {
    // One attacker left, and it is a Tank. "Strikers first" finds nobody, and
    // it must not therefore find NOBODY AT ALL.
    const state = atTurn(board(['h02'], ['h01']), 5);
    const lone = {
      ...state,
      heroes: state.heroes.map((h) =>
        h.side === 'attacker' && h.instanceId !== 'a0' ? { ...h, hp: 0 } : h,
      ),
    };
    const power = powerOfTier('h01', 0);

    expect(getHero('h02').role).toBe('tank');
    const chosen = chooseTarget(
      lone,
      SEED,
      0n,
      'd0',
      power,
      config({ targeting: ['strikers-first', 'ranged-first'] }),
      enemiesOf(lone, 'd0', power),
    );

    expect(chosen.targetInstanceId).toBe('a0');
  });

  it('always names somebody, for every rule pair, on every hero', () => {
    // 15 rules × 15 rules is 225 pairs; run them against a mixed squad so role
    // rules, state rules and distance rules all have something to sort.
    const state = atTurn(board(SIX, ['h02']), 5);
    const power = powerOfTier('h02', 0);
    const candidates = enemiesOf(state, 'd0', power);
    expect(candidates.length).toBeGreaterThan(1);

    let checked = 0;
    for (const primary of TARGET_RULES) {
      for (const fallback of TARGET_RULES) {
        const chosen = chooseTarget(
          state,
          SEED,
          0n,
          'd0',
          power,
          config({ targeting: [primary, fallback] }),
          candidates,
        );
        expect(candidates, `${primary} → ${fallback}`).toContain(chosen.targetInstanceId);
        checked++;
      }
    }

    expect(checked).toBe(TARGET_RULES.length ** 2);
  });

  it('throws rather than inventing a target when handed an empty set', () => {
    // An empty set here means the CALLER skipped feature 002's pipeline. Better
    // to fail loudly than to return something plausible.
    const state = atTurn(board(SIX, ['h02']), 5);
    expect(() =>
      chooseTarget(state, SEED, 0n, 'd0', powerOfTier('h02', 0), config(), []),
    ).toThrow(/only sorts/);
  });
});

describe('the rules themselves', () => {
  const state = () => atTurn(board(SIX, ['h02']), 5);
  const power = () => powerOfTier('h02', 0);

  const pick = (rule: Parameters<typeof config>[0] extends never ? never : string, s = state()) =>
    chooseTarget(
      s,
      SEED,
      0n,
      'd0',
      power(),
      config({ targeting: [rule as never, rule as never] }),
      enemiesOf(s, 'd0', power()),
    ).targetInstanceId;

  it('finds the lowest current HP', () => {
    const wounded = withHero(state(), 'a2', { hp: 7 });
    expect(pick('lowest-current-hp', wounded)).toBe('a2');
  });

  it('finds the lowest HP percentage, which is a different question', () => {
    // a0 is a Striker at 60% of a small pool; a2 has fewer absolute HP but a
    // larger share of a bigger one. The two rules must disagree here or the
    // menu entry is decoration.
    const s = state();
    const a0 = s.heroes.find((h) => h.instanceId === 'a0')!;
    const a2 = s.heroes.find((h) => h.instanceId === 'a2')!;

    const staged = withHero(withHero(s, 'a0', { hp: Math.round(a0.maxHp * 0.2) }), 'a2', {
      hp: Math.round(a2.maxHp * 0.15),
    });

    // Whoever it names, it must name the smaller FRACTION, not the smaller bar.
    const byPercent = pick('lowest-hp-percentage', staged);
    const chosen = staged.heroes.find((h) => h.instanceId === byPercent)!;
    for (const other of staged.heroes.filter((h) => h.side === 'attacker' && h.row >= 2)) {
      expect(chosen.hp / chosen.maxHp).toBeLessThanOrEqual(other.hp / other.maxHp);
    }
  });

  it('finds the most damaged in absolute terms', () => {
    const s = withHero(state(), 'a1', { hp: 1 });
    const chosen = s.heroes.find((h) => h.instanceId === pick('most-damaged', s))!;
    expect(chosen.maxHp - chosen.hp).toBeGreaterThan(0);
  });

  it('finds the highest Might', () => {
    const s = state();
    const chosen = s.heroes.find((h) => h.instanceId === pick('highest-might', s))!;
    const reachable = enemiesOf(s, 'd0', power()).map(
      (id) => s.heroes.find((h) => h.instanceId === id)!,
    );

    for (const other of reachable) {
      expect(getHero(chosen.heroId).stats.might).toBeGreaterThanOrEqual(
        getHero(other.heroId).stats.might,
      );
    }
  });

  it('reads the wall the power actually answers for least/most mitigation', () => {
    const s = state();
    // An arcane power answers Magic Resist; a martial one answers Armor. If
    // `least-mitigation` read the wrong stat it would still return somebody,
    // which is why this compares the two directions rather than a fixed id.
    const least = pick('least-mitigation', s);
    const most = pick('most-mitigation', s);

    const wall = (id: string) => {
      const h = s.heroes.find((x) => x.instanceId === id)!;
      return getHero(h.heroId).stats;
    };
    expect(wall(least).magicResist).toBeLessThanOrEqual(wall(most).magicResist);
  });

  it('prefers the best type matchup when asked to', () => {
    const s = state();
    const p = getHero('h02').powers.find((x) => x.id === power())!;
    const chosen = s.heroes.find((h) => h.instanceId === pick('best-type-matchup', s))!;
    const reachable = enemiesOf(s, 'd0', power()).map(
      (id) => s.heroes.find((h) => h.instanceId === id)!,
    );

    const multiplier = (h: (typeof reachable)[number]) => {
      const hero = getHero(h.heroId);
      return p.types.reduce(
        (best, t) =>
          Math.max(
            best,
            t === hero.bane ? 1.5 : t === hero.fault ? 1.25 : t === hero.primary ? 0.5 : t === hero.secondary ? 0.8 : 1,
          ),
        0,
      );
    };

    for (const other of reachable) {
      expect(multiplier(chosen)).toBeGreaterThanOrEqual(multiplier(other));
    }
  });

  it('covers every rule on the menu — no entry is unimplemented', () => {
    const s = state();
    for (const rule of TARGET_RULES) {
      expect(() => pick(rule, s), rule).not.toThrow();
    }
  });
});

describe('the whole roster, every rule, every seat', () => {
  it('never fails to name a legal target', () => {
    // The exhaustive version of SC-007: 27 defenders × every rule × every seat
    // that has anything in reach. If any combination could deadlock, it is here.
    let checked = 0;

    for (const hero of getAllHeroes()) {
      const state = atTurn(board(SIX, [hero.id]), 5);

      for (const actor of state.heroes.filter((h) => h.side === 'defender')) {
        const power = powerOfTier(hero.id, 0);
        const candidates = enemiesOf(state, actor.instanceId, power);
        if (candidates.length === 0) continue;

        for (const rule of TARGET_RULES) {
          const chosen = chooseTarget(
            state,
            SEED,
            0n,
            actor.instanceId,
            power,
            config({ targeting: [rule, 'nearest'] }),
            candidates,
          );
          expect(candidates).toContain(chosen.targetInstanceId);
          checked++;
        }
      }
    }

    expect(checked).toBeGreaterThan(1000);
  });
});
