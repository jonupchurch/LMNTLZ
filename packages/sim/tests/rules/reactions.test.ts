/**
 * Reactions — **the gate, not the blow.**
 *
 * `rules/reactions.ts` answers *may this hero counter*, and every clause of that
 * answer is a rule settled in `04-turns.md` § *Reactions* long before anything
 * could exercise it. The counter itself draws, so it is resolver-side and lives
 * in `tests/resolver/reactions.test.ts`.
 *
 * Two of the roster's forty passives exist entirely to bend this gate, and until
 * 2026-08-02 both were dead names — `Already Gone` granted immunity to nothing
 * and `Nothing to Discuss` denied nothing. That is what most of this file is
 * about.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import {
  chargeReaction,
  inReactionOrder,
  reactionCharge,
  reactionFor,
  reactivePowerOf,
} from '../../rules/reactions.js';
import { deniesReactions, refusesReactions } from '../../rules/passives.js';
import { heroStateOf } from '../../rules/state.js';
import { legalTargets } from '../../rules/targeting.js';
import { duel, heroStateFor, stateOf, withHero } from './fixtures.js';

/** Kaellis, Reyna and Grieve — the three that share `Redouble`. */
const KAELLIS = 'h19';
/** Vantric — a Pierce striker with the same Role and reach and no counter. */
const INERT = 'h22';
/** Silka Pinquick — `Already Gone`. */
const SILKA = 'h23';
/** Hettamar Ironfall — `Nothing to Discuss`. */
const HETTAMAR = 'h26';

/** Attacker `a` in row 3, defender `d` in row 4, both standing. */
const facing = (attackerId: string, defenderId: string) => duel(attackerId, defenderId);

describe('which champions own a reactive power', () => {
  /**
   * 🔴 **Exactly three, and they are the three the design named.**
   *
   * `04-turns.md` records that the roster authored zero, which left the whole
   * reaction system governing nothing. The count is asserted rather than the
   * behaviour alone: an overlay edit that silently dropped `Redouble` would leave
   * every test below passing vacuously — a gate that refuses everything looks
   * exactly like a gate with nothing to refuse.
   */
  it('🔴 is the three Slash champions, and nobody else', () => {
    const reactive = getAllHeroes()
      .filter((h) => reactivePowerOf(h.id) !== null)
      .map((h) => h.id);

    expect(reactive).toEqual(['h19', 'h20', 'h21']);
  });

  it('🔴 and the power is Redouble, tier 1', () => {
    const power = reactivePowerOf(KAELLIS);
    expect(power?.name).toBe('Redouble');
    expect(power?.tier, 'a high tier would be spent on its owner’s own turn').toBe(1);
    expect(power?.friendly, 'a counter is aimed at whoever swung').toBe(false);
    expect(power?.targets).toBe('single');
  });

  it('returns null for a champion that owns none', () => {
    expect(reactivePowerOf(INERT)).toBeNull();
  });
});

describe('the gate', () => {
  it('🔴 lets a struck defender counter its attacker', () => {
    const state = facing(INERT, KAELLIS);
    expect(reactionFor(state, 'd', 'a', true)).toEqual({
      reactorInstanceId: 'd',
      powerId: 'Redouble',
    });
  });

  /**
   * 🔴 **The 2026-07-27 ruling, and the reason it exists.**
   *
   * Phase 3 used to end resolution for an evaded target entirely. Left that way,
   * `Agility` — the defender's *own* defensive stat — would suppress the
   * defender's own counter, so the better your defense the less you retaliate.
   * Nobody designs that on purpose.
   */
  it('🔴 fires on an evaded attack exactly as on a landed one', () => {
    const state = facing(INERT, KAELLIS);
    expect(reactionFor(state, 'd', 'a', false)).not.toBeNull();
  });

  it('refuses a champion that owns no reactive power', () => {
    expect(reactionFor(facing(INERT, INERT), 'd', 'a', true)).toBeNull();
  });

  /** *"A dead defender cannot react."* It was removed in phase 3. */
  it('🔴 refuses a fallen defender', () => {
    const state = withHero(facing(INERT, KAELLIS), 'd', { hp: 0 });
    expect(reactionFor(state, 'd', 'a', true)).toBeNull();
  });

  /**
   * 🔴 **And refuses to counter a fallen attacker**, which is not the same rule.
   *
   * Reachable in ordinary play: the first counter of a phase can fell the
   * attacker, and the second must then find nothing to swing at. Phase 4 gives
   * nothing to corpses in either direction.
   *
   * ⚠️ **The second assertion is the one that can fail**, and it took a mutation
   * run to learn it: deleting `isStanding(attacker)` from the gate changes
   * nothing, because targeting already refuses a fallen hero and a corpse is in
   * nobody's pool. Asserting only the gate would be a test nothing can break —
   * green forever, whichever of the two layers somebody deleted. So the layer
   * that actually decides is asserted directly.
   */
  it('🔴 refuses to counter an attacker that is already down', () => {
    const state = withHero(facing(INERT, KAELLIS), 'a', { hp: 0 });
    expect(reactionFor(state, 'd', 'a', true)).toBeNull();

    const { candidates } = legalTargets(state, 'd', 'Redouble');
    expect(candidates, 'a corpse must not be in any pool').toEqual([]);
  });

  /**
   * 🔴 **On its own cooldown**, counted in its owner's turns. A defender under
   * fire from a fast attacker counters at most once per its own turn cycle,
   * however many times it is hit.
   */
  it('🔴 refuses while the counter is charged', () => {
    const state = withHero(facing(INERT, KAELLIS), 'd', { cooldowns: { Redouble: 1 } });
    expect(reactionFor(state, 'd', 'a', true)).toBeNull();
  });

  /**
   * 🔴 **A reaction respects reach**, which `02-squads.md` states once with no
   * exceptions.
   *
   * Kaellis has reach 1. Put her in the back row of a full formation with the
   * rows in front of her occupied and she cannot reach row 3 — so she cannot
   * counter it either.
   */
  it('🔴 refuses a counter it cannot reach', () => {
    const state = stateOf([
      heroStateFor(getHero(INERT), 'attacker', 3, 'a'),
      heroStateFor(getHero(INERT), 'defender', 4, 'wall'),
      heroStateFor(getHero(INERT), 'defender', 5, 'wall2'),
      heroStateFor(getHero(KAELLIS), 'defender', 6, 'd'),
    ]);

    expect(reactionFor(state, 'd', 'a', true), 'three rows out and reach 1').toBeNull();
  });

  /** The control for the reach test: clear the rows between and the counter lands. */
  it('🔴 and allows it once the rows between have emptied', () => {
    const state = stateOf([
      heroStateFor(getHero(INERT), 'attacker', 3, 'a'),
      heroStateFor(getHero(INERT), 'defender', 4, 'wall', { hp: 0 }),
      heroStateFor(getHero(INERT), 'defender', 5, 'wall2', { hp: 0 }),
      heroStateFor(getHero(KAELLIS), 'defender', 6, 'd'),
    ]);

    expect(reactionFor(state, 'd', 'a', true)).not.toBeNull();
  });
});

describe('Already Gone — Silka cannot be countered', () => {
  it('🔴 the premise: she carries it, and it is read off the attacker', () => {
    const state = facing(SILKA, KAELLIS);
    expect(refusesReactions(heroStateOf(state, 'a'))).toBe(true);
    expect(refusesReactions(heroStateOf(state, 'd')), 'not a property of the reactor').toBe(false);
  });

  it('🔴 refuses the counter on a blow that landed', () => {
    expect(reactionFor(facing(SILKA, KAELLIS), 'd', 'a', true)).toBeNull();
  });

  /**
   * 🔴 **And on one that missed** — the half that separates her from Hettamar.
   *
   * *"Cannot be the target of a reactive power"* is about being aimed at, and an
   * evaded swing is still a swing that would otherwise be answered.
   */
  it('🔴 refuses it on a blow that missed, too', () => {
    expect(reactionFor(facing(SILKA, KAELLIS), 'd', 'a', false)).toBeNull();
  });

  /** The control: the same board with a champion who has no such passive. */
  it('🔴 and the identical board without her allows the counter', () => {
    expect(reactionFor(facing(INERT, KAELLIS), 'd', 'a', true)).not.toBeNull();
  });
});

describe('Nothing to Discuss — Hettamar silences whoever he hurt', () => {
  it('🔴 the premise: he carries it, and it is read off the attacker', () => {
    const state = facing(HETTAMAR, KAELLIS);
    expect(deniesReactions(heroStateOf(state, 'a'))).toBe(true);
    expect(deniesReactions(heroStateOf(state, 'd'))).toBe(false);
  });

  it('🔴 refuses the counter when the blow connected', () => {
    expect(reactionFor(facing(HETTAMAR, KAELLIS), 'd', 'a', true)).toBeNull();
  });

  /**
   * 🔴 **The distinguishing case, and the whole reason these are two passives.**
   *
   * The text says *damages*. A blow Hettamar missed with damaged nobody, so it
   * silences nobody — where Silka's immunity holds regardless. Collapse the two
   * into one flag and this is the assertion that dies, quietly, with both heroes
   * still looking implemented.
   */
  it('🔴 but allows it when the blow missed — he damaged nobody', () => {
    expect(reactionFor(facing(HETTAMAR, KAELLIS), 'd', 'a', false)).not.toBeNull();
  });
});

describe('the charge a counter writes', () => {
  /**
   * 🔴 **`cooldown + 1`, and the `+ 1` is the same one `chargeAfterFiring` uses.**
   *
   * A normally-cast power is written *after* its owner's Resolution has ticked,
   * so it stores `cooldown`. A counter fires during somebody else's turn, before
   * its owner's Resolution has run at all — so it stores one more, and the two
   * meet at the same number after the reactor's next turn.
   */
  it('🔴 stores one more than the power’s cooldown', () => {
    expect(reactionCharge(1)).toBe(2);
    expect(reactionCharge(3)).toBe(4);
  });

  /**
   * 🔴 **Even a free power is charged**, which is the one place this differs from
   * `resolveClocks`. Without it a defender would counter *every* incoming blow,
   * and the fence `04-turns.md` names — "at most once per its own turn cycle,
   * however many times it is hit" — would not exist.
   */
  it('🔴 charges a cooldown-0 power rather than leaving it free', () => {
    expect(reactionCharge(0)).toBe(1);
  });

  it('writes it onto the reactor and touches nothing else', () => {
    const state = facing(INERT, KAELLIS);
    const charged = chargeReaction(heroStateOf(state, 'd'), 'Redouble', 1);

    expect(charged.cooldowns).toEqual({ Redouble: 2 });
    expect(charged.hp).toBe(heroStateOf(state, 'd').hp);
  });

  it('🔴 and the charge is what the gate then refuses', () => {
    const state = facing(INERT, KAELLIS);
    const after = withHero(state, 'd', {
      cooldowns: chargeReaction(heroStateOf(state, 'd'), 'Redouble', 1).cooldowns,
    });

    expect(reactionFor(after, 'd', 'a', true), 'countered twice on one turn').toBeNull();
  });
});

describe('the order counters resolve in', () => {
  /**
   * **Row, then instance id** — the same order every per-target loop uses.
   *
   * It matters more here than in most: this decides who counters first, which
   * decides who is still standing to counter at all. Fed deliberately out of
   * order so a passthrough implementation fails.
   */
  it('🔴 sorts by row, then by instance id', () => {
    const state = stateOf([
      heroStateFor(getHero(INERT), 'attacker', 3, 'a'),
      heroStateFor(getHero(KAELLIS), 'defender', 5, 'd-mid'),
      heroStateFor(getHero(KAELLIS), 'defender', 4, 'd-b'),
      heroStateFor(getHero(KAELLIS), 'defender', 4, 'd-a'),
    ]);

    const ordered = inReactionOrder(state, [
      { instanceId: 'd-mid', connected: true },
      { instanceId: 'd-b', connected: true },
      { instanceId: 'd-a', connected: true },
    ]);

    expect(ordered.map((c) => c.instanceId)).toEqual(['d-a', 'd-b', 'd-mid']);
  });

  it('carries each candidate’s connected flag through unchanged', () => {
    const state = facing(INERT, KAELLIS);
    expect(inReactionOrder(state, [{ instanceId: 'd', connected: false }])).toEqual([
      { instanceId: 'd', connected: false },
    ]);
  });
});
