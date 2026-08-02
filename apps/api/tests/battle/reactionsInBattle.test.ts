/**
 * 🔴 **WIRING — a counter fires inside a real turn, and its clock is its owner's.**
 *
 * `packages/sim` proves a reaction resolves. This proves the turn loop carries it:
 * the counter reaches the packet a client is handed, its cooldown lands on the
 * *reactor* rather than the attacker, and — the claim that cannot be checked
 * inside `resolveOne` at all — **that cooldown ticks in the reactor's own
 * Resolution, never in the attacker's.**
 *
 * `04-turns.md`: *"a reactive power has a cooldown like any other, counted in its
 * **owner's** turns and ticking in its owner's Resolution — not the attacker's. So
 * a defender under fire from a fast attacker counters at most once per its own
 * turn cycle, however many times it is hit."*
 *
 * That sentence is a statement about two heroes' turns, so it needs two turns to
 * test, and `takeTurn` is the only thing that has them.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { effectsInPool, heroStateOf, poolOf, type BattleState } from '@lmntlz/sim/rules';
import { createSeed } from '@lmntlz/sim/resolver';
import { takeTurn } from '../../src/battle/turnLoop.js';
import { board, sixOf, withHero } from './fixtures.js';
import { buildInitialState } from '../../src/battle/board.js';

/** Kaellis — `Redouble`, tier 1, cooldown 1. The only reactive power on the roster. */
const KAELLIS = 'h19';
/** Vantric — same Role, same reach, no counter. */
const INERT = 'h22';

const A0 = 'a-front-0';
const D0 = 'd-front-0';

const auto = (heroId: string): string => getHero(heroId).powers.find((p) => p.tier === 0)!.id;

const faceOff = (attackerId: string, defenderId: string): BattleState =>
  buildInitialState(sixOf(attackerId), sixOf(defenderId), {
    engineVersion: 'e-test',
    contentVersion: 'c-test',
  });

/**
 * Run one attacker turn on `state` and hand back everything.
 *
 * Seeded per call so a caller can search for a seed that produced a counter —
 * a reaction is still a contested blow and a fixed seed is a coin flip.
 */
const swing = (state: BattleState, actorId: string, targetId: string, drawIndex = 0n) =>
  takeTurn(
    createSeed(),
    state,
    {
      sequence: 1,
      actorInstanceId: actorId,
      powerId: auto(heroStateOf(state, actorId).heroId),
      targetInstanceId: targetId,
    },
    drawIndex,
  );

/** Swing until a counter actually happens, or give up loudly. */
function untilCountered(state: BattleState, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const turn = swing(state, A0, D0);
    if ((turn.outcome.reactions ?? []).length > 0) return turn;
  }
  throw new Error(`no counter in ${tries} swings — the wiring is dead, not unlucky`);
}

describe('a counter reaches the packet a client is handed', () => {
  it('🔴 arrives on the turn outcome, naming the reactor and the power', () => {
    const turn = untilCountered(faceOff(INERT, KAELLIS));
    const [reaction] = turn.outcome.reactions!;

    expect(reaction!.actorInstanceId).toBe(D0);
    expect(reaction!.targetInstanceId).toBe(A0);
    expect(reaction!.powerId).toBe('Redouble');
  });

  /**
   * 🔴 **The control.** Six champions that own no reactive power provoke nothing,
   * and the field is absent rather than an empty array — the same shape a replay
   * recorded before today carries.
   */
  it('🔴 and is absent entirely when nothing on the board can counter', () => {
    for (let i = 0; i < 20; i++) {
      const turn = swing(faceOff(INERT, INERT), A0, D0);
      expect(turn.outcome.reactions).toBeUndefined();
    }
  });
});

describe('the cooldown is the reactor’s, and ticks on the reactor’s turn', () => {
  /**
   * 🔴 **Charged on the defender by the attacker's turn**, which is the whole
   * oddity of a reaction: a hero's cooldown record changes while somebody else is
   * acting.
   */
  it('🔴 lands on the reactor and leaves the attacker untouched', () => {
    const turn = untilCountered(faceOff(INERT, KAELLIS));

    expect(heroStateOf(turn.state, D0).cooldowns.Redouble).toBe(2);
    expect(heroStateOf(turn.state, A0).cooldowns.Redouble).toBeUndefined();
  });

  /**
   * 🔴 **The attacker's Resolution does not tick it.**
   *
   * `resolveClocks` ticks exactly one hero — whoever's turn it is — so a second
   * attacker turn must leave the defender's charge exactly where it was. Get this
   * wrong and a fast attacker would tick a slow defender's counter back up for
   * free, by hitting it.
   */
  it('🔴 does not move when the ATTACKER takes another turn', () => {
    const first = untilCountered(faceOff(INERT, KAELLIS));
    const charged = heroStateOf(first.state, D0).cooldowns.Redouble;
    expect(charged).toBe(2);

    const second = swing(first.state, A0, D0, first.drawsConsumed);

    expect(heroStateOf(second.state, D0).cooldowns.Redouble, 'the attacker ticked it').toBe(2);
    expect(second.outcome.reactions, 'countered twice in one of its own turn cycles').toBeUndefined();
  });

  /**
   * 🔴 **And it does move when the reactor takes its own turn** — the other half,
   * without which the test above would also pass on a charge that never ticks at
   * all and locks `Redouble` out for the rest of the battle.
   */
  it('🔴 ticks down on the reactor’s own turn, and comes back', () => {
    const first = untilCountered(faceOff(INERT, KAELLIS));
    expect(heroStateOf(first.state, D0).cooldowns.Redouble).toBe(2);

    const defenderTurn = swing(first.state, D0, A0, first.drawsConsumed);
    expect(heroStateOf(defenderTurn.state, D0).cooldowns.Redouble, 'one own turn').toBe(1);

    const secondDefenderTurn = swing(
      defenderTurn.state,
      D0,
      A0,
      first.drawsConsumed + defenderTurn.drawsConsumed,
    );
    expect(
      heroStateOf(secondDefenderTurn.state, D0).cooldowns.Redouble,
      'a cooldown of 0 is removed, not stored',
    ).toBeUndefined();
  });
});

describe('a counter’s consequences are the turn’s consequences', () => {
  /**
   * 🔴 **A counter that kills is a death the board hears about.**
   *
   * Attacker on a sliver, so any landed counter is lethal. The turn's `deaths`
   * list is what removes a champion from the client's board; a kill reported only
   * inside the reaction event would leave the corpse standing.
   */
  it('🔴 reports a counter’s kill in the turn’s death list', () => {
    const brittle = withHero(faceOff(INERT, KAELLIS), A0, { hp: 1 });

    for (let i = 0; i < 80; i++) {
      const turn = swing(brittle, A0, D0);
      const fromCounter = (turn.outcome.reactions ?? []).flatMap((r) => r.deaths);
      if (fromCounter.length === 0) continue;

      expect(turn.outcome.deaths).toContain(A0);
      expect(new Set(turn.outcome.deaths).size).toBe(turn.outcome.deaths.length);
      return;
    }

    throw new Error('no counter landed on a 1 HP attacker in 80 swings');
  });

  /**
   * 🔴 **A rune that fired inside a counter is reported like any other.**
   *
   * `Again, There` marks whoever its bearer lands a blow on, so a defender
   * carrying it fires it *as the attacker of its own counter* — the case the turn
   * loop could most easily drop, since the bearer is on the defending side of the
   * action that provoked it.
   *
   * ⚠️ **Two wrong instruments before this one, and both would have passed for the
   * wrong reason had the counts been raised instead of read.** `Too Close`
   * reflects **on being struck**, so it fires in the main strike and never in the
   * counter. `The Way In` is an attacker-side effect and does fire — but it sits
   * in the **pierce** pool, and Kaellis is slash/light, so no player could ever put
   * it on her. A fixture that fields an impossible loadout tests a game nobody is
   * playing. `Again, There` is her own primary pool.
   */
  it('🔴 carries a rune fired during the counter into the turn’s runesFired', () => {
    const armed = withHero(faceOff(INERT, KAELLIS), D0, { runeEffects: ['again-there'] });

    for (let i = 0; i < 80; i++) {
      const turn = swing(armed, A0, D0);
      const inCounter = (turn.outcome.reactions ?? []).flatMap((r) => r.runesFired);
      if (inCounter.length === 0) continue;

      for (const id of inCounter) expect(turn.outcome.runesFired).toContain(id);
      return;
    }

    throw new Error('no rune fired inside a counter in 80 swings');
  });
});

describe('the board itself', () => {
  /**
   * 🔴 **The rune the test above fields is one Kaellis could actually buy.**
   *
   * Pool membership is derived from `primary`/`secondary` (Constitution XV), so a
   * fixture can hand a champion an effect the Forge would refuse — and then prove
   * a behaviour of a loadout no account can hold.
   */
  it('🔴 fields a rune that is genuinely in Kaellis’s pool', () => {
    expect(effectsInPool(poolOf(KAELLIS, 'primary')).map((e) => e.id)).toContain('again-there');
  });

  /** Six a side, so nothing above is measured on an empty formation. */
  it('is a full formation on both sides', () => {
    const state = faceOff(INERT, KAELLIS);
    expect(state.heroes.filter((h) => h.side === 'attacker')).toHaveLength(6);
    expect(state.heroes.filter((h) => h.side === 'defender')).toHaveLength(6);
    expect(heroStateOf(state, D0).heroId).toBe(KAELLIS);
  });

  /** And `board()`'s default squads still exist, so the fixture was not broken. */
  it('leaves the default fixture alone', () => {
    expect(board().heroes).toHaveLength(12);
  });
});
