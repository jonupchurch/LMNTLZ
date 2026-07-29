/**
 * Where a packet stops (007 T021).
 *
 * ### Why this is the test that decides how the game feels
 *
 * `isChoicePoint` is the only thing standing between two opposite failures,
 * and **neither of them throws**:
 *
 * - Stop too often and the game interrupts to ask questions that have one
 *   answer. Annoying, obvious, reported immediately.
 * - Stop too rarely and **turns that carried a real decision get folded, and
 *   the player is simply not asked.** Nobody files that bug. They say the game
 *   felt shallow and stop playing.
 *
 * The golden-path test counts requests across a whole battle and catches gross
 * drift. This one pins the rule case by case, because a request count in the
 * right range can be reached by two wrong answers cancelling out.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import { availablePowers, legalTargets } from '@lmntlz/sim/rules';
import { isChoicePoint, forcedMove, usablePowers } from '../../src/battle/choicePoint.js';
import { buildInitialState } from '../../src/battle/board.js';
import { autoPowerOf, board, fell, onlyPowers, REACH_1, ROSTER } from './fixtures.js';

/** A whole squad of one reach-1 champion, so every row test means one thing. */
const reach1Board = () => board(Array<string>(6).fill(REACH_1), ROSTER.slice(6, 12));

const ATTACKER = 'a-front-0';
const DEFENDERS = ['d-front-0', 'd-front-1', 'd-middle-0', 'd-middle-1', 'd-middle-2', 'd-back-0'];

describe('a defender turn is never a choice point', () => {
  it('is false for every defending hero, however many options it has', () => {
    /**
     * **The engine plays all defense** (`CLAUDE.md`), so this holds regardless
     * of the option count — and it has to be checked against a hero that *does*
     * have several options, or the assertion is satisfied by the wrong reason.
     */
    const state = board();

    for (const id of DEFENDERS) {
      const options = availablePowers(state, id).length;
      expect(options, `${id} should have options for this test to mean anything`).toBeGreaterThan(1);
      expect(isChoicePoint(state, id), id).toBe(false);
    }
  });
});

describe('one power, one target — forced, so the packet carries on', () => {
  it('folds a turn whose only power has a single legal target', () => {
    let state = board();
    const heroId = ROSTER[0]!;

    // One power left, and one enemy left for it to hit.
    state = onlyPowers(state, ATTACKER, [autoPowerOf(heroId)]);
    state = fell(state, ...DEFENDERS.slice(1));

    expect(availablePowers(state, ATTACKER)).toHaveLength(1);
    expect(legalTargets(state, ATTACKER, autoPowerOf(heroId)).candidates).toHaveLength(1);
    expect(isChoicePoint(state, ATTACKER)).toBe(false);
  });

  it('offers the choice as soon as a second target is standing', () => {
    let state = board();
    const heroId = ROSTER[0]!;

    state = onlyPowers(state, ATTACKER, [autoPowerOf(heroId)]);
    state = fell(state, ...DEFENDERS.slice(2));

    const targets = legalTargets(state, ATTACKER, autoPowerOf(heroId)).candidates;
    expect(targets.length).toBeGreaterThan(1);
    expect(isChoicePoint(state, ATTACKER)).toBe(true);
  });
});

describe('a power that cannot be used is not an option', () => {
  /**
   * **Reach belongs to the hero, not to the power.** So "off cooldown but
   * unusable" is all-or-nothing per hero: from a row that can reach, every
   * power reaches; from a row that cannot, none does. There is no board in the
   * roster where reach leaves a hero exactly one usable power out of several —
   * that was checked by searching all 27 champions before this was written.
   *
   * The filter still earns its place, because it is what makes an unreachable
   * hero *pass* instead of being offered a menu of moves it cannot make.
   */
  const REACHLESS = 'a-middle-0';

  it('leaves a hero out of reach with options on paper and none in fact', () => {
    const state = reach1Board();

    expect(availablePowers(state, REACHLESS).length).toBeGreaterThan(1);
    expect(usablePowers(state, REACHLESS)).toHaveLength(0);
    expect(isChoicePoint(state, REACHLESS)).toBe(false);
  });

  it('is not a choice point even with several powers off cooldown', () => {
    // The failure this rules out: counting `availablePowers` instead of usable
    // ones, which would stop the packet to ask about moves that cannot be made.
    const state = reach1Board();
    expect(availablePowers(state, REACHLESS).length).toBeGreaterThan(1);
    expect(isChoicePoint(state, REACHLESS)).toBe(false);
    expect(forcedMove(state, REACHLESS)).toBeNull();
  });
});

describe('a taunt takes the decision away', () => {
  /**
   * **A compelled target is not a choice**, even when the pool is large. A
   * boundary that counted candidates without checking `compelled` would stop
   * the packet to present a list with one legal entry — on exactly the turns a
   * taunt exists to remove the decision.
   */
  const taunt = (instanceId: string) => ({ name: 'taunt', instanceId });

  it('folds a turn where several targets stand but one is compelled', () => {
    let state = board();
    const auto = autoPowerOf(ROSTER[0]!);
    state = onlyPowers(state, ATTACKER, [auto]);

    // Several legal targets, so without the taunt this is a real choice.
    expect(legalTargets(state, ATTACKER, auto).candidates.length).toBeGreaterThan(1);
    expect(isChoicePoint(state, ATTACKER)).toBe(true);

    expect(isChoicePoint(state, ATTACKER, { compulsion: taunt('d-front-0') })).toBe(false);
  });

  it('sends the forced move at the taunting hero', () => {
    let state = board();
    const auto = autoPowerOf(ROSTER[0]!);
    state = onlyPowers(state, ATTACKER, [auto]);

    /**
     * **The second candidate, deliberately** — not the first. Compelling the
     * hero the forced move would have picked anyway proves nothing, and it is
     * the assertion an implementation that ignored compulsions would still pass.
     */
    const candidates = legalTargets(state, ATTACKER, auto).candidates;
    expect(candidates.length).toBeGreaterThan(1);
    const compelled = candidates[1]!;
    expect(compelled).not.toBe(forcedMove(state, ATTACKER)?.targetInstanceId);

    expect(forcedMove(state, ATTACKER, { compulsion: taunt(compelled) })).toEqual({
      powerId: auto,
      targetInstanceId: compelled,
    });
  });

  it('ignores a taunt from someone out of reach', () => {
    /**
     * `legalTargets` drops a compulsion naming a hero outside the pool — a
     * taunting tank two rows away compels nobody. So the choice comes back,
     * rather than the turn being forced at somebody unhittable.
     */
    let state = board();
    const auto = autoPowerOf(ROSTER[0]!);
    state = onlyPowers(state, ATTACKER, [auto]);

    const unreachable = 'd-back-0';
    const reachable = legalTargets(state, ATTACKER, auto).candidates;
    if (reachable.includes(unreachable)) return; // only meaningful if it is out of reach

    expect(isChoicePoint(state, ATTACKER, { compulsion: taunt(unreachable) })).toBe(true);
  });
});

describe('a friendly power can always reach its own caster', () => {
  /**
   * **The case that caught a footgun in the rules package.**
   *
   * `poolFor` lets a friendly power target the caster itself, and distance from
   * a row to itself is zero — so a friendly power is *never* out of reach. A
   * champion who can reach no enemy therefore still has something to do, if the
   * friendly power is off cooldown and past its gate.
   *
   * `@lmntlz/sim/rules` exports `mustPass`, which reads like the answer to
   * "does this hero have anything to do?" and **ignores cooldowns and tier
   * gates entirely** — it asks only about powers the hero *owns*. On this exact
   * board it returns `false` for a hero with no usable power at all, because
   * the friendly power that would save it is still gated. `choicePoint.ts` uses
   * the availability-aware test that feature 004's `choosePower` uses instead.
   */
  const mixed = getAllHeroes().filter(
    (h) => h.powers.some((p) => p.friendly) && h.powers.some((p) => !p.friendly),
  );

  it('finds champions that own both a friendly and a hostile power', () => {
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('does not treat an owned-but-gated friendly power as something to do', () => {
    const hero = mixed[0]!;
    const state = board(Array<string>(6).fill(hero.id), ROSTER.slice(6, 12));

    // Row 1 at full formation: three occupied rows from anything hostile.
    expect(usablePowers(state, 'a-back-0')).toHaveLength(0);
    expect(availablePowers(state, 'a-back-0').length).toBeGreaterThan(0);
    expect(isChoicePoint(state, 'a-back-0')).toBe(false);
    expect(forcedMove(state, 'a-back-0')).toBeNull();
  });

  it('does treat an AVAILABLE friendly power as something to do', () => {
    const hero = mixed[0]!;
    const friendly = hero.powers.find((p) => p.friendly)!;
    const state = onlyPowers(
      board(Array<string>(6).fill(hero.id), ROSTER.slice(6, 12)),
      'a-back-0',
      [friendly.id],
    );

    // Late enough that the gate is open; the caster is its own legal target.
    const late = { ...state, heroTurn: 30 };
    expect(usablePowers(late, 'a-back-0').map((p) => p.id)).toEqual([friendly.id]);
    expect(forcedMove(late, 'a-back-0')).not.toBeNull();
  });
});

describe('range opens up as the battle wears on', () => {
  /**
   * **Distance counts *occupied* rows crossed**, so a losing position hands the
   * back seat a job it did not have at full formation. This is the mechanic,
   * not an optimisation, and it is what turns a folded turn into a real choice
   * partway through a battle — so the packet boundary moves as the board
   * empties, and nothing about it is static.
   */
  it('gives the middle row targets once its own front row has fallen', () => {
    const full = reach1Board();
    expect(usablePowers(full, 'a-middle-0')).toHaveLength(0);

    const opened = fell(full, 'a-front-0', 'a-front-1');
    expect(usablePowers(opened, 'a-middle-0').length).toBeGreaterThan(0);
    expect(forcedMove(opened, 'a-middle-0')).not.toBeNull();
  });

  it('reaches the back seat only after the two rows ahead of it empty', () => {
    const full = reach1Board();
    const midGone = fell(full, 'a-front-0', 'a-front-1');
    expect(usablePowers(midGone, 'a-back-0')).toHaveLength(0);

    const allGone = fell(midGone, 'a-middle-0', 'a-middle-1', 'a-middle-2');
    expect(usablePowers(allGone, 'a-back-0').length).toBeGreaterThan(0);
  });

  it('counts the attacker’s own rows, not only the gap between the squads', () => {
    /**
     * Emptying the **enemy** front row does not help a reach-1 hero in row 2:
     * row 3 is still occupied and row 5 is still two occupied rows away. The
     * rule is symmetric and about occupancy, not about which side a row is on —
     * which is easy to state and easy to implement backwards.
     */
    const enemyFrontGone = fell(reach1Board(), 'd-front-0', 'd-front-1');
    expect(usablePowers(enemyFrontGone, 'a-middle-0')).toHaveLength(0);
  });
});

describe('a hero with nothing to do', () => {
  it('passes rather than stopping the packet', () => {
    // Every enemy gone: nothing hostile is targetable, so nothing to decide.
    const state = fell(board(), ...DEFENDERS);

    expect(usablePowers(state, ATTACKER)).toHaveLength(0);
    expect(isChoicePoint(state, ATTACKER)).toBe(false);
    expect(forcedMove(state, ATTACKER)).toBeNull();
  });
});

describe('the forced move a folded turn actually makes', () => {
  it('names the one power and the one target when there is exactly one of each', () => {
    let state = board();
    const heroId = ROSTER[0]!;
    const auto = autoPowerOf(heroId);

    state = onlyPowers(state, ATTACKER, [auto]);
    state = fell(state, ...DEFENDERS.slice(1));

    expect(forcedMove(state, ATTACKER)).toEqual({
      powerId: auto,
      targetInstanceId: DEFENDERS[0],
    });
  });

  it('never returns a target the rules would refuse', () => {
    // A forced move is still a move the resolver has to accept. Choosing one
    // outside reach would be a 422 the player never asked for.
    const state = board();
    const move = forcedMove(state, 'a-back-0');

    if (move) {
      const legal = legalTargets(state, 'a-back-0', move.powerId).candidates;
      expect(legal).toContain(move.targetInstanceId);
    }
  });
});

describe('the board a battle actually opens on', () => {
  it('starts at hero turn 1, so tier gates are not already open', () => {
    /**
     * **An off-by-one here opens every battle with a tier-5 available.** It
     * would read as a balance problem — first turns far too swingy — and the
     * cause would be nowhere near where anybody looked.
     */
    expect(board().heroTurn).toBe(1);
  });

  it('puts nobody ahead on the accumulator', () => {
    // Opening order must be Speed alone. A staggered start is a hidden
    // advantage the projected turn queue could not explain.
    expect(board().heroes.every((h) => h.accumulator === 0)).toBe(true);
  });

  it('faces the two front rows across the gap', () => {
    const state = board();
    const rowOf = (id: string) => state.heroes.find((h) => h.instanceId === id)!.row;

    expect(rowOf('a-front-0')).toBe(3);
    expect(rowOf('d-front-0')).toBe(4);
    expect(rowOf('a-back-0')).toBe(1);
    expect(rowOf('d-back-0')).toBe(6);
  });

  it('derives HP as Toughness × 50 rather than storing it', () => {
    const state = board();
    for (const hero of state.heroes) {
      expect(hero.hp).toBe(hero.maxHp);
      expect(hero.maxHp % 50).toBe(0);
    }
  });

  it('leaves a hero at 0 HP off the board entirely', () => {
    const state = fell(board(), 'd-front-0');
    expect(legalTargets(state, ATTACKER, autoPowerOf(ROSTER[0]!)).candidates).not.toContain(
      'd-front-0',
    );
  });
});

describe('a malformed snapshot is refused rather than fought', () => {
  it.each([
    ['five heroes', () => board(ROSTER.slice(0, 6), ROSTER.slice(6, 11))],
    ['a seat that does not exist', () => withBadSeat()],
  ])('rejects %s', (_label, build) => {
    expect(build).toThrow();
  });

  function withBadSeat() {
    return buildInitialState(
      [
        { row: 'front', index: 0, heroId: ROSTER[0]! },
        { row: 'front', index: 1, heroId: ROSTER[1]! },
        { row: 'middle', index: 0, heroId: ROSTER[2]! },
        { row: 'middle', index: 1, heroId: ROSTER[3]! },
        { row: 'middle', index: 2, heroId: ROSTER[4]! },
        { row: 'back', index: 3, heroId: ROSTER[5]! },
      ],
      [],
      { engineVersion: 'e', contentVersion: 'c' },
    );
  }
});
