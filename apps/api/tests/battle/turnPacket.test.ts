/**
 * 🔴 **WIRING — the reach roll reaches the player, not just the board** (021 T052,
 * T055).
 *
 * ### The failure this exists to catch
 *
 * `Further Than It Looks` is the one effect in the catalog the design constrains
 * by *when it is disclosed*: **rolled at turn start and shown before the player
 * chooses**, so it is a decision rather than variance applied to a decision already
 * made. A roll taken at resolution time would enlarge the target list *after* the
 * player had picked from the smaller one, and every unit test in `packages/sim`
 * would still pass — the rune would work perfectly and be worth nothing.
 *
 * So the assertion here is **the size of the legal target list**, never the
 * presence of a flag or a status. *"The grant is on the hero"* is satisfied by a
 * grant nothing reads, which is exactly how this project once shipped a whole
 * status system that no code path consulted, through 393 green tests.
 *
 * ### Element counts before indexing
 *
 * Every count below is asserted before anything is read out of a list. A
 * `.candidates[1]` that silently reads `undefined` is how a "larger list" test
 * passes against a list that did not grow.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { heroStateOf, legalTargets, type BattleState } from '@lmntlz/sim/rules';
import { createSeed } from '@lmntlz/sim/resolver';
import { rollTurnStart } from '@lmntlz/sim/resolver';
import { usablePowers } from '../../src/battle/choicePoint.js';
import { openingPacket, type DefenderConfigs } from '../../src/battle/packet.js';
import { board, withHero } from './fixtures.js';

/**
 * h07 Ember Saelith — **reach 1, and `air` is her secondary**, so this rune is
 * genuinely one of hers. Chosen over h04 Zephyrine deliberately: Zephyrine carries
 * `Out of Reach`, which grants a reach status of its own, and a fixture holding the
 * thing under test's competitor produces a red test against right code.
 */
const BEARER = 'h07';
const ACTOR = 'a-front-0';
const EFFECT = 'further-than-it-looks';

/** A squad of reach-1 champions, so one extra row means one thing. */
const armed = (runes: readonly string[]): BattleState =>
  withHero(board(Array<string>(6).fill(BEARER)), ACTOR, { runeEffects: runes });

const AUTO = getHero(BEARER).powers.find((p) => p.tier === 0)!.id;

const reachable = (state: BattleState): readonly string[] =>
  legalTargets(state, ACTOR, AUTO).candidates;

/**
 * A seed that fires the roll, found rather than assumed.
 *
 * At 25% most seeds do not, and a hard-coded one that happened to fail would make
 * every assertion below compare a list to itself.
 */
function firstFiringSeed(): { state: BattleState; draws: bigint } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const before = armed([EFFECT]);
    const rolled = rollTurnStart(createSeed(), before, ACTOR, 0n);
    const granted = heroStateOf(rolled.state, ACTOR).statuses.some((s) => s.kind === 'reach');
    if (granted) return { state: rolled.state, draws: rolled.drawsConsumed };
  }
  throw new Error('200 seeds and the roll never fired — the chance is not being read');
}

describe('the board this is measured on', () => {
  it('seats a reach-1 champion who can only see the enemy front row', () => {
    expect(getHero(BEARER).reach, 'the premise: one row of reach').toBe(1);

    const base = reachable(armed([]));
    expect(base, 'two defenders share the enemy front row').toHaveLength(2);
  });

  it('offers the effect from one of this champion’s own pools', () => {
    const hero = getHero(BEARER);
    expect([hero.primary, hero.secondary], 'a rune nobody could buy proves nothing').toContain(
      'air',
    );
  });
});

describe('Further Than It Looks, at the point the player is asked', () => {
  /**
   * 🔴 **The list is strictly larger — the assertion T055 names.**
   *
   * A flag on the packet with an unchanged list is the failure this replaces, and
   * it would pass any presence check.
   */
  it('🔴 offers strictly more targets once the roll has fired', () => {
    const before = reachable(armed([EFFECT]));
    const { state } = firstFiringSeed();
    const after = reachable(state);

    expect(before).toHaveLength(2);
    expect(after.length, 'the roll fired and the list did not move').toBeGreaterThan(before.length);
    expect(after, 'the enemy middle row opens: two plus three').toHaveLength(5);

    /* Counted first, then read: every earlier candidate is still offered. */
    for (const id of before) expect(after).toContain(id);
  });

  /**
   * 🔴 **`usablePowers` sees it too**, which is the function the packet boundary
   * actually calls. A rune read by `legalTargets` and not by the boundary would
   * enlarge the list and still never stop the packet to offer it.
   */
  it('🔴 widens what the choice-point boundary counts, not only what targeting returns', () => {
    const { state } = firstFiringSeed();

    const usable = usablePowers(state, ACTOR);
    expect(usable.length, 'the champion has something to do').toBeGreaterThan(0);

    const auto = usable.find((p) => p.id === AUTO);
    expect(auto, 'the tier-0 power is available at turn 1').toBeDefined();
    expect(legalTargets(state, ACTOR, auto!.id).candidates).toHaveLength(5);
  });

  it('costs exactly one draw, whether or not it fires', () => {
    const { draws } = firstFiringSeed();
    expect(draws).toBe(1n);
    expect(rollTurnStart(createSeed(), armed([]), ACTOR, 0n).drawsConsumed, 'the control').toBe(0n);
  });

  /**
   * 🔴 **The control.** Without the rune the list never grows, however the seed
   * falls — so the widening above is the rune's doing and not the board's.
   */
  it('🔴 never widens for a champion that did not buy it', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const rolled = rollTurnStart(createSeed(), armed([]), ACTOR, 0n);
      expect(reachable(rolled.state), `attempt ${attempt}`).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// The wiring itself — that `fold` rolls, and rolls BEFORE it stops
// ---------------------------------------------------------------------------

/**
 * 🔴 **Everything above proves the rule; this proves the call.**
 *
 * `rollTurnStart` could be perfect and never invoked, or invoked one line too late
 * — after `isChoicePoint` has already counted the smaller list — and every
 * assertion in this file would still pass. That is the exact defect shape this
 * project keeps producing: not a broken seam, an *uncalled* one.
 *
 * So this runs the real packet fold and looks at the board it hands back. A packet
 * stops with the choosing champion **up and not yet acted**, so a reach status on
 * that champion can only have come from the turn-start roll inside `fold`.
 */
describe('the packet fold rolls at turn start', () => {
  const DEFENDER_IDS = ['d-front-0', 'd-front-1', 'd-middle-0', 'd-middle-1', 'd-middle-2', 'd-back-0'];
  const configs: DefenderConfigs = Object.fromEntries(
    DEFENDER_IDS.map((id) => [id, { targeting: ['lowest-current-hp', 'nearest'], ranking: [5, 4, 3, 2, 1, 0] }]),
  );

  const openingWith = (runes: readonly string[]) =>
    openingPacket(createSeed(), armed(runes), 0n, configs).packet;

  const grantedOnWhoeverIsUp = (packet: { state: BattleState }): boolean => {
    const up = packet.state.turnOfInstance;
    if (up === null) return false;
    return heroStateOf(packet.state, up).statuses.some((s) => s.kind === 'reach');
  };

  it('🔴 hands back a board already carrying the grant, on some seeds', () => {
    const outcomes = new Set<boolean>();
    for (let attempt = 0; attempt < 300; attempt++) {
      outcomes.add(grantedOnWhoeverIsUp(openingWith([EFFECT])));
    }

    expect(
      outcomes.has(true),
      'fold never granted a row — rollTurnStart is not being called, or is called after the stop',
    ).toBe(true);
    expect(outcomes.has(false), 'it fired every single time — the chance is not being read').toBe(
      true,
    );
  });

  it('🔴 does not, for a squad that bought nothing — the control', () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      expect(grantedOnWhoeverIsUp(openingWith([])), `attempt ${attempt}`).toBe(false);
    }
  });
});
