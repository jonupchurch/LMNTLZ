/**
 * `choosePower` — the ranking is the whole of the decision.
 *
 * Highest-ranked power that is **off cooldown and past its gate**. No scoring,
 * no matchup chasing, no cleverness. The tier-0 auto-attack has cooldown 0 and
 * no gate, so a legal choice always exists and there is no fallback rule to get
 * wrong.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { choosePower } from '../../ai/powerChoice.js';
import { atTurn, board, clearRows, config, powerOfTier, withHero } from './fixtures.js';

describe('choosePower', () => {
  it('takes the highest-ranked power that is available', () => {
    // Turn 5: everything is past its gate and nothing is on cooldown.
    const state = board(['h01'], ['h01'], 5);
    const choice = choosePower(state, 'd0', config({ ranking: [3, 5, 4, 2, 1, 0] }));

    expect(choice).toEqual({ powerId: powerOfTier('h01', 3) });
  });

  it('skips a power that is on cooldown and takes the next one down', () => {
    const state = withHero(board(['h01'], ['h01'], 5), 'd0', {
      cooldowns: { [powerOfTier('h01', 5)]: 3, [powerOfTier('h01', 4)]: 1 },
    });

    expect(choosePower(state, 'd0', config({ ranking: [5, 4, 3, 2, 1, 0] }))).toEqual({
      powerId: powerOfTier('h01', 3),
    });
  });

  it('holds tier 4 until turn 3 and tier 5 until turn 5', () => {
    const greedy = config({ ranking: [5, 4, 3, 2, 1, 0] });

    // Turn 1 — both ultimates gated, so the highest available is tier 3.
    expect(choosePower(board(['h01'], ['h01'], 1), 'd0', greedy)).toEqual({
      powerId: powerOfTier('h01', 3),
    });
    // Turn 3 — tier 4 opens.
    expect(choosePower(board(['h01'], ['h01'], 3), 'd0', greedy)).toEqual({
      powerId: powerOfTier('h01', 4),
    });
    // Turn 5 — tier 5 opens and outranks it.
    expect(choosePower(board(['h01'], ['h01'], 5), 'd0', greedy)).toEqual({
      powerId: powerOfTier('h01', 5),
    });
  });

  it('falls to tier 0 when everything above it is on cooldown', () => {
    const hero = getHero('h01');
    const cooldowns = Object.fromEntries(
      hero.powers.filter((p) => p.tier > 0).map((p) => [p.id, 5]),
    );
    const state = withHero(board(['h01'], ['h01'], 9), 'd0', { cooldowns });

    expect(choosePower(state, 'd0', config())).toEqual({ powerId: powerOfTier('h01', 0) });
  });

  it('always finds a choice, for every hero at every turn of a real battle', () => {
    // The claim that makes a fallback rule unnecessary: tier 0 has cooldown 0
    // and no gate, so it is available on every turn of every battle.
    for (const hero of getAllHeroes()) {
      for (let turn = 1; turn <= 9; turn++) {
        const state = board(['h01'], [hero.id], turn);
        const choice = choosePower(state, 'd0', config({ ranking: [5, 4, 3, 2, 1, 0] }));
        expect(choice).not.toHaveProperty('pass');
      }
    }
  });

  it('passes only when NO power the hero owns has a legal target in reach', () => {
    // A reach-1 hero in the defender back seat, with rows 4 and 5 still
    // occupied: distance to the nearest enemy is 3. Nothing it owns can reach.
    const state = board(['h01'], ['h01'], 5);
    const boxedIn = withHero(state, 'd5', { heroId: 'h01' });

    expect(getHero('h01').reach).toBe(1);
    expect(choosePower(boxedIn, 'd5', config())).toEqual({ pass: true });
  });

  it('stops passing the moment the line collapses and reach opens up', () => {
    const state = board(['h01'], ['h01'], 5);
    expect(choosePower(state, 'd5', config())).toEqual({ pass: true });

    // Empty rows are skipped, so clearing rows 4, 5 and 3 brings row 2 within
    // reach 1 of the back seat. The mechanic, not an optimization.
    const collapsed = clearRows(state, [4, 5, 3]);
    expect(choosePower(collapsed, 'd5', config())).not.toHaveProperty('pass');
  });

  it('does NOT re-rank to chase a matchup — on all 729 pairings, at every turn', () => {
    // The answer is the top-ranked AVAILABLE power and nothing else, whatever
    // the matchup. Asserted across every attacker/defender pair so that an
    // optimizer could not hide in the one pairing a hand-picked case missed.
    //
    // The ranking is the defender's lever. An optimizer that noticed a lower
    // power was super-effective and took it would collapse every defense toward
    // the same choice, and the deepest configuration in the game would stop
    // mattering.
    const ranking = [5, 4, 3, 2, 1, 0] as const;
    let checked = 0;

    for (const attacker of getAllHeroes()) {
      for (const defender of getAllHeroes()) {
        for (const turn of [1, 3, 5]) {
          const state = board([attacker.id], [defender.id], turn);
          const expected = ranking
            .map((tier) => defender.powers.find((p) => p.tier === tier)!)
            .find((p) => turn >= p.gateTurn)!;

          expect(choosePower(state, 'd0', config({ ranking }))).toEqual({ powerId: expected.id });
          checked++;
        }
      }
    }

    expect(checked).toBe(729 * 3);
  });

  it('is a pure function of the state it is handed', () => {
    const state = board(['h01'], ['h14'], 6);
    const cfg = config({ ranking: [4, 5, 2, 3, 1, 0] });
    const first = choosePower(state, 'd0', cfg);

    for (let i = 0; i < 100; i++) {
      expect(choosePower(state, 'd0', cfg)).toEqual(first);
    }
  });

  it('rejects a ranking that is not a permutation of the six tiers', () => {
    const state = board(['h01'], ['h01'], 5);
    expect(() =>
      choosePower(state, 'd0', config({ ranking: [5, 5, 4, 3, 2, 1] as never })),
    ).toThrow();
  });

  it('honours the ordering that switches everything off — surfaced, not blocked', () => {
    // `0·…` is legal and self-defeating. Constitution XVIII: deliberate is fine,
    // accidental is the failure — so the engine plays it and `firingProfile`
    // is what warns.
    const state = atTurn(board(['h01'], ['h01']), 9);
    expect(choosePower(state, 'd0', config({ ranking: [0, 5, 4, 3, 2, 1] }))).toEqual({
      powerId: powerOfTier('h01', 0),
    });
  });
});
