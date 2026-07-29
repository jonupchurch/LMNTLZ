/**
 * The turn engine (007 T020/T022 groundwork).
 *
 * ### The assertion that matters most is agreement with the projected queue
 *
 * The player is shown `turnQueue` and plans against it — which power to hold,
 * whether a heal lands before a hit. If the engine's own ordering diverged from
 * that projection the game would be **quietly lying on every screen**, and the
 * symptom would be "my ultimate went off at the wrong time", reported as a bug
 * in the wrong feature.
 *
 * `turnQueue` is a pure function in `@lmntlz/sim/rules`; `nextActor` is the
 * engine. They are two implementations of one rule, so they are checked against
 * each other rather than each against a hand-written expectation.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { gainPerTick, isIncapacitated, turnQueue } from '@lmntlz/sim/rules';
import { applyResolution, nextActor, takeTurn } from '../../src/battle/turnLoop.js';
import { autoPowerOf, board, fell, ROSTER, withHero } from './fixtures.js';

const ATTACKER = 'a-front-0';

describe('the engine and the projected queue agree', () => {
  it('acts in exactly the order the player was shown, for twenty turns', () => {
    /**
     * **Two implementations of one rule, checked against each other.** A shared
     * misunderstanding would still pass, but the realistic failure — one of
     * them drains, resets or breaks ties differently — cannot.
     */
    const start = board();
    const projected = turnQueue(start, 20);

    const actual: string[] = [];
    let state = start;
    for (let i = 0; i < 20; i++) {
      const step = nextActor(state);
      expect(step, `stalled after ${i} turns`).not.toBeNull();
      actual.push(step!.instanceId);
      state = step!.state;
    }

    expect(actual).toEqual([...projected]);
  });

  it('keeps agreeing after heroes have fallen', () => {
    // Reach opens and the roster shrinks as a battle wears on; the two
    // implementations have to track that identically, not just at turn one.
    const start = fell(board(), 'd-front-0', 'a-middle-1');
    const projected = turnQueue(start, 12);

    const actual: string[] = [];
    let state = start;
    for (let i = 0; i < 12; i++) {
      const step = nextActor(state)!;
      actual.push(step.instanceId);
      state = step.state;
    }

    expect(actual).toEqual([...projected]);
  });
});

describe('the accumulator is drained, not tested once', () => {
  it('lets a hero far over the threshold act again without waiting', () => {
    /**
     * **A single `if` here would cost the fastest champions their Speed.** A
     * hero arriving at 250 has earned two turns and part of a third; resetting
     * to zero, or acting once and dropping the remainder, silently caps the
     * whole stat.
     */
    const state = withHero(board(), ATTACKER, { accumulator: 250 });

    const first = nextActor(state)!;
    expect(first.instanceId).toBe(ATTACKER);

    // 250 + gain, minus 100 for the turn taken — still above the threshold.
    const remaining = first.state.heroes.find((h) => h.instanceId === ATTACKER)!.accumulator;
    expect(remaining).toBeGreaterThanOrEqual(100);

    const second = nextActor(first.state)!;
    expect(second.instanceId).toBe(ATTACKER);
  });

  it('drains exactly one turn’s worth, never to zero', () => {
    const state = withHero(board(), ATTACKER, { accumulator: 180 });

    const step = nextActor(state)!;
    expect(step.instanceId).toBe(ATTACKER);
    expect(step.state.heroes.find((h) => h.instanceId === ATTACKER)!.accumulator).toBe(80);
  });
});

describe('the clock only moves when nobody can act', () => {
  /**
   * **The rule that keeps Speed proportional.** Ticking on every turn while
   * only one hero spends means the board gains far more than it spends, the
   * accumulator pool grows without bound, and turns stop tracking Speed. That
   * mistake measured **2.82×** between the fastest and slowest champion against
   * a designed ceiling of 1.92× — a Speed stat worth roughly twice what it was
   * priced at, and nothing about it would have thrown.
   */
  it('does not tick when somebody is already over the threshold', () => {
    const before = withHero(board(), ATTACKER, { accumulator: 150 });
    const step = nextActor(before)!;

    expect(step.instanceId).toBe(ATTACKER);

    for (const hero of step.state.heroes) {
      if (hero.instanceId === ATTACKER) continue;
      const was = before.heroes.find((h) => h.instanceId === hero.instanceId)!;
      expect(hero.accumulator, hero.instanceId).toBe(was.accumulator);
    }
  });

  it('ticks the whole board the same number of times, then charges one hero', () => {
    /**
     * From a standing start nobody can act — every gain is under 100 at
     * ungeared Speed — so the clock runs until somebody crosses. **Every hero
     * gains on every one of those ticks**; the loser of a tick keeps its
     * progress, because resetting the field is how a slow hero never acts at
     * all.
     *
     * The tick count is derived rather than hard-coded: it depends on the
     * champions in the fixture, and a test that pinned "one tick" would be
     * asserting the roster instead of the rule.
     */
    const before = board();
    const step = nextActor(before)!;

    const actorWas = before.heroes.find((h) => h.instanceId === step.instanceId)!;
    const actorNow = step.state.heroes.find((h) => h.instanceId === step.instanceId)!;
    const ticks = (actorNow.accumulator + 100 - actorWas.accumulator) / gainPerTick(actorWas);

    expect(Number.isInteger(ticks), `derived a fractional tick count: ${ticks}`).toBe(true);
    expect(ticks).toBeGreaterThan(0);

    for (const hero of step.state.heroes) {
      const was = before.heroes.find((h) => h.instanceId === hero.instanceId)!;
      const gained = was.accumulator + gainPerTick(was) * ticks;
      expect(hero.accumulator, hero.instanceId).toBe(
        hero.instanceId === step.instanceId ? gained - 100 : gained,
      );
    }
  });

  it('keeps turns proportional to gain over a long run', () => {
    /**
     * The arithmetic the conditional tick forces: over `T` ticks the board
     * gains `T · Σgain` and spends `100` per turn, so each hero's share of
     * turns is its share of gain. Asserted as a ratio against `gainPerTick`
     * rather than against a remembered constant, so it stays true if the base
     * constant is ever retuned.
     */
    let state = board();
    const counts = new Map<string, number>();
    const TURNS = 600;

    for (let i = 0; i < TURNS; i++) {
      const step = nextActor(state)!;
      counts.set(step.instanceId, (counts.get(step.instanceId) ?? 0) + 1);
      state = step.state;
    }

    const gains = new Map(board().heroes.map((h) => [h.instanceId, gainPerTick(h)]));
    const totalGain = [...gains.values()].reduce((a, b) => a + b, 0);

    for (const [id, count] of counts) {
      const expected = TURNS * (gains.get(id)! / totalGain);
      expect(Math.abs(count - expected) / expected, `${id} share of turns`).toBeLessThan(0.05);
    }
  });
});

describe('speed buys turns at the rate the design promises', () => {
  it('gives a fast hero more turns than a slow one, bounded by the base constant', () => {
    /**
     * `50 + Speed` per tick is what keeps the ratio bounded: at Speed 15 vs 45
     * the fast hero acts 1.46× as often, not 3×. **The base constant is the
     * balance lever**, and a loop that dropped it would turn Speed into the
     * only stat worth having.
     */
    let state = board();
    const counts = new Map<string, number>();

    for (let i = 0; i < 300; i++) {
      const step = nextActor(state)!;
      counts.set(step.instanceId, (counts.get(step.instanceId) ?? 0) + 1);
      state = step.state;
    }

    const speeds = new Map(
      board().heroes.map((h) => [h.instanceId, getHero(h.heroId).stats.speed]),
    );
    const entries = [...counts].sort((a, b) => speeds.get(b[0])! - speeds.get(a[0])!);

    const fastest = entries[0]!;
    const slowest = entries[entries.length - 1]!;
    const ratio = fastest[1] / slowest[1];

    // The ungeared ceiling is 1.46× at the roster's Speed spread; allow a
    // little slack for a 300-turn sample, but nothing like 2×.
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.92);
  });
});

describe('Resolution is unconditional', () => {
  const auto = autoPowerOf(ROSTER[0]!);

  it('puts the fired power on cooldown at its full value', () => {
    /**
     * Ticking before writing the new cooldown is the whole of it. Writing first
     * and ticking after returns a 3-turn power after 2 — a bug that reads as a
     * balance complaint about one champion.
     */
    const hero = ROSTER[0]!;
    const power = getHero(hero).powers.find((p) => p.cooldown > 0);
    if (!power) return;

    const state = board([hero, hero, hero, hero, hero, hero], ROSTER.slice(6, 12));
    const after = applyResolution(state, ATTACKER, power.id);

    expect(after.heroes.find((h) => h.instanceId === ATTACKER)!.cooldowns[power.id]).toBe(
      power.cooldown,
    );
  });

  it('ticks every other cooldown down by one', () => {
    const state = withHero(board(), ATTACKER, { cooldowns: { [auto]: 3, other: 1 } });
    const after = applyResolution(state, ATTACKER, null).heroes.find(
      (h) => h.instanceId === ATTACKER,
    )!;

    expect(after.cooldowns[auto]).toBe(2);
    // A cooldown reaching zero is removed, not stored as 0 — absent and zero
    // mean the same thing to every reader.
    expect(after.cooldowns['other']).toBeUndefined();
  });

  it('ticks the cooldowns of a hero that lost its turn to crowd control', () => {
    /**
     * **Skipping Resolution would make a one-turn stun cost two.** The hero
     * does nothing, consumes no draws, and still reaches the end of its turn.
     */
    const stunned = withHero(board(), ATTACKER, {
      cooldowns: { [auto]: 2 },
      statuses: [{ kind: 'stun', turnsRemaining: 1, potency: 0, sourceInstanceId: 'd-front-0' }],
    });

    expect(isIncapacitated(stunned.heroes.find((h) => h.instanceId === ATTACKER)!)).toBe(true);

    const taken = takeTurn(fakeSeed(), stunned, intent(auto), 0n);
    const after = taken.state.heroes.find((h) => h.instanceId === ATTACKER)!;

    expect(taken.drawsConsumed).toBe(0n);
    expect(after.cooldowns[auto]).toBe(1);
    expect(taken.outcome.damage).toBe(0);
  });

  it('expires a status that has run out and keeps one that has not', () => {
    const state = withHero(board(), ATTACKER, {
      statuses: [
        { kind: 'stun', turnsRemaining: 1, potency: 0, sourceInstanceId: 'd-front-0' },
        { kind: 'bleed', turnsRemaining: 3, potency: 10, sourceInstanceId: 'd-front-0' },
      ],
    });

    const after = applyResolution(state, ATTACKER, null).heroes.find(
      (h) => h.instanceId === ATTACKER,
    )!;

    expect(after.statuses.map((s) => s.kind)).toEqual(['bleed']);
    expect(after.statuses[0]!.turnsRemaining).toBe(2);
  });

  it('counts one hero turn, not one round', () => {
    // Tier gates and the 300-turn cap are both measured in hero turns.
    const state = board();
    expect(applyResolution(state, ATTACKER, null).heroTurn).toBe(state.heroTurn + 1);
  });
});

describe('a battle with nobody standing', () => {
  it('reports no next actor rather than spinning', () => {
    const empty = fell(board(), ...board().heroes.map((h) => h.instanceId));
    expect(nextActor(empty)).toBeNull();
  });
});

// --- helpers ---------------------------------------------------------------

const intent = (powerId: string) => ({
  sequence: 0,
  actorInstanceId: ATTACKER,
  powerId,
  targetInstanceId: 'd-front-0',
});

/** A seed is opaque by construction; a stunned turn never draws from it. */
function fakeSeed() {
  return { __brand: 'Seed' } as unknown as Parameters<typeof takeTurn>[0];
}
