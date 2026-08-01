/**
 * A battle, start to finish (007 T014).
 *
 * ### Counting the requests is the real assertion
 *
 * A packet ends where the player faces a choice. That rule is checked case by
 * case in `choicePoint.test.ts`; **this counts what it produces across a whole
 * battle**, which is the only check that exercises the boundary, the turn
 * order, the defence AI and the ending conditions at once.
 *
 * | Requests | What it means |
 * |---|---|
 * | over ~45 | the boundary is too fine — something forced is being treated as a decision |
 * | 20–40 | the predicted range: ~51 player-side turns, 40–80% of them real choices |
 * | under ~15 | **worse** — turns that carried a decision are being folded and the player is not being asked |
 *
 * The measured figures do not match the prediction, and the reason is content
 * rather than code — see the block above `folds several turns into every
 * request`. Run over several random seeds rather than one fixed one: the claim
 * is about a
 * distribution, and a single seed that happened to land in range would prove
 * nothing about the rule.
 */

import { describe, expect, it } from 'vitest';
import { createSeed, type ActionIntent } from '@lmntlz/sim/resolver';
import { heroStateOf, sideOfRow, type BattleState } from '@lmntlz/sim/rules';
import type { battleEnded } from '@lmntlz/sim/rules';
import { decideAction, type SquadMemberConfig } from '@lmntlz/sim/ai';
import { isChoicePoint, usablePowers } from '../../src/battle/choicePoint.js';
import { legalTargets } from '@lmntlz/sim/rules';
import { openingPacket, resolveToNextChoice, type DefenderConfigs } from '../../src/battle/packet.js';
import type { ActionPacket } from '../../src/battle/idempotency.js';
import { autoPowerOf, board, REACH_1, ROSTER, withHero } from './fixtures.js';

const DEFENDERS = ['d-front-0', 'd-front-1', 'd-middle-0', 'd-middle-1', 'd-middle-2', 'd-back-0'];

const config: SquadMemberConfig = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
};

const configs: DefenderConfigs = Object.fromEntries(DEFENDERS.map((id) => [id, config]));

/**
 * A player who always takes the first legal move.
 *
 * **Deliberately not a good player.** The count under test is how often the
 * game *asks*, which is a property of the boundary rule and not of the answers
 * — and a clever chooser would make the battle shorter in a way that flatters
 * the request count.
 */
function playerMove(state: BattleState, instanceId: string): ActionIntent {
  const usable = usablePowers(state, instanceId);
  const power = usable[0];
  if (!power) throw new Error(`asked ${instanceId} to choose with nothing usable`);

  const targeting = legalTargets(state, instanceId, power.id);
  const target = targeting.compelled ?? targeting.candidates[0]!;

  return { sequence: 0, actorInstanceId: instanceId, powerId: power.id, targetInstanceId: target };
}

interface Fought {
  readonly acts: number;
  readonly heroTurns: number;
  readonly packets: readonly ActionPacket[];
  readonly draws: bigint;
  readonly conclusion: ReturnType<typeof battleEnded>;
}

/** Play one battle to its end, counting the requests a client would have made. */
function fight(seed: ReturnType<typeof createSeed>, attackers = ROSTER.slice(0, 6)): Fought {
  const start = board(attackers, ROSTER.slice(6, 12));

  let index = 0n;
  const packets: ActionPacket[] = [];

  const opening = openingPacket(seed, start, index, configs);
  index += opening.drawsConsumed;
  packets.push(opening.packet);

  let state = opening.packet.state;
  let conclusion = opening.packet.conclusion;
  let acts = 0;

  while (!conclusion && acts < 200) {
    const up = state.turnOfInstance;
    expect(up, 'a packet ended without naming whose turn it is').not.toBeNull();

    const move = playerMove(state, up!);
    const result = resolveToNextChoice(seed, state, move, index, configs);

    index += result.drawsConsumed;
    packets.push(result.packet);
    state = result.packet.state;
    conclusion = result.packet.conclusion;
    acts += 1;
  }

  return {
    acts,
    heroTurns: state.heroTurn,
    packets,
    draws: index,
    conclusion,
  };
}

describe('a battle fought end to end', () => {
  const seeds = Array.from({ length: 8 }, () => createSeed());
  const fights = seeds.map((s) => fight(s));

  it('reaches a conclusion every time', () => {
    for (const f of fights) expect(f.conclusion, `after ${f.acts} acts`).not.toBeNull();
  });

  /**
   * ### The 20–40 request count is not asserted, and that is deliberate
   *
   * Measured, a battle asks the player **~85 times over ~260–280 hero turns**,
   * against a design prediction of 20–40 over ~102. Every stop is a genuine
   * choice point — checked below, turn by turn — so **the boundary rule is not
   * what is off; the battle is simply two and a half times longer than the
   * design assumes.**
   *
   * Damage lands at **4.5% of a hero's health pool per acting turn** where the
   * design's length implies about 11%, and **30% of all turns are passes**
   * because a reach-1 champion in rows 1–2 can reach nothing at full formation.
   * Both belong to the hero-numbers pass, which `resources/mechanics/README.md`
   * has parked on purpose and which now carries these figures.
   *
   * So this file asserts the **rule** and reports the **numbers**. Pinning
   * 20–40 today would fail on untuned content rather than on a defect, and
   * widening it to 15–95 would assert nothing at all.
   */
  it('folds several turns into every request', () => {
    // The property the packet exists for, and the one that is independent of
    // how long a battle runs: a request is never one hero turn.
    for (const f of fights) {
      const turnsPerRequest = f.heroTurns / (f.acts + 1);
      expect(turnsPerRequest, `${f.heroTurns} turns over ${f.acts} acts`).toBeGreaterThan(1);
      expect(turnsPerRequest).toBeLessThan(20);
    }
  });

  it('stays inside the engine’s own hard limits', () => {
    // Not a balance assertion — a check that nothing runs away. The 300-turn
    // cap is the engine's, and a battle brushing it is a content signal.
    for (const f of fights) {
      expect(f.heroTurns, `${f.heroTurns} hero turns in ${f.acts} acts`).toBeGreaterThan(20);
      expect(f.heroTurns).toBeLessThanOrEqual(301);
    }
  });

  it('reports what a battle currently costs, for the hero-numbers pass', () => {
    /**
     * **A reported measurement, not a pinned expectation.** It exists so the
     * figure is visible in the run rather than buried in a document, and so
     * that when the numbers pass moves it, the movement is obvious.
     */
    const acts = fights.map((f) => f.acts);
    const turns = fights.map((f) => f.heroTurns);
    const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

    console.info(
      `[hero-numbers] ${fights.length} battles: ` +
        `${mean(acts)} requests (design 20–40), ` +
        `${mean(turns)} hero turns (design ~102)`,
    );

    // An order-of-magnitude guard, so a genuinely broken boundary still fails.
    expect(mean(acts)).toBeGreaterThan(5);
    expect(mean(acts)).toBeLessThan(200);
  });

  it('folds more turns than it asks about', () => {
    // The point of the packet: one request carries several hero turns.
    for (const f of fights) expect(f.heroTurns).toBeGreaterThan(f.acts);
  });
});

describe('the packets themselves', () => {
  const seed = createSeed();
  const fought = fight(seed);

  it('records an intent for every event, engine turns included', () => {
    /**
     * **This is what makes a divergence detectable.** A replay does re-run the
     * defense AI — `act.ts` explains why it must — so the recorded intent is
     * the thing its answer gets checked against. An event without an actor is
     * an event nothing can be compared to.
     */
    for (const packet of fought.packets) {
      for (const event of packet.events) {
        expect(event.actorInstanceId).toBeTruthy();
        expect(['player', 'engine']).toContain(event.source);
        // A pass has no power and no target; anything else has both recorded.
        if (event.powerId !== null) expect(event.targetInstanceId).not.toBeUndefined();
      }
    }
  });

  it('attributes every defender turn to the engine and every attacker turn to the player', () => {
    const start = board(ROSTER.slice(0, 6), ROSTER.slice(6, 12));
    const sideOf = (id: string) => sideOfRow(heroStateOf(start, id).row);

    for (const packet of fought.packets) {
      for (const event of packet.events) {
        expect(event.source, event.actorInstanceId).toBe(
          sideOf(event.actorInstanceId) === 'attacker' ? 'player' : 'engine',
        );
      }
    }
  });

  it('stops on a choice point and nowhere else', () => {
    /**
     * Every packet that did not end the battle must leave a hero up who
     * genuinely has a decision. A packet stopping anywhere else is the "asks
     * too often" failure, and it would be invisible in a request count that
     * happened to stay in range.
     */
    for (const packet of fought.packets) {
      if (packet.conclusion) continue;
      const up = packet.state.turnOfInstance!;
      expect(isChoicePoint(packet.state, up), `stopped on ${up} with no choice`).toBe(true);
    }
  });

  it('never leaves a concluded battle with a hero still up', () => {
    const last = fought.packets[fought.packets.length - 1]!;
    expect(last.conclusion).not.toBeNull();
  });
});

describe('the same seed replays identically', () => {
  it('produces byte-identical packets for two runs of one seed', () => {
    /**
     * **The property every stored replay depends on.** The resolver is pure in
     * `(seed, state, drawIndex)`, and this is the end-to-end version of that
     * claim: same seed, same squads, same battle — including every choice the
     * defence AI made.
     */
    const seed = createSeed();
    const a = fight(seed);
    const b = fight(seed);

    expect(a.acts).toBe(b.acts);
    expect(a.draws).toBe(b.draws);
    expect(JSON.stringify(a.packets)).toBe(JSON.stringify(b.packets));
  });

  it('produces different battles for different seeds', () => {
    // Otherwise the test above passes for the wrong reason — a resolver that
    // ignored the seed entirely would satisfy it perfectly.
    const one = fight(createSeed());
    const two = fight(createSeed());
    expect(JSON.stringify(one.packets)).not.toBe(JSON.stringify(two.packets));
  });
});

describe('the draw window is accounted for exactly', () => {
  it('sums each packet’s draws to the running index', () => {
    /**
     * `drawsConsumed` is what a replay uses to know where the next turn's draws
     * begin. A packet that under-reports leaves the next one reading indices
     * already spent — and the battle would still look plausible while being a
     * different battle.
     */
    const seed = createSeed();
    const start = board(ROSTER.slice(0, 6), ROSTER.slice(6, 12));

    let index = 0n;
    const opening = openingPacket(seed, start, index, configs);
    expect(opening.drawsConsumed).toBeGreaterThanOrEqual(0n);
    index += opening.drawsConsumed;

    let state = opening.packet.state;
    let conclusion = opening.packet.conclusion;
    let total = opening.drawsConsumed;

    while (!conclusion) {
      const move = playerMove(state, state.turnOfInstance!);
      const result = resolveToNextChoice(seed, state, move, index, configs);

      // Each packet reports exactly the span it used, so indices never overlap.
      index += result.drawsConsumed;
      total += result.drawsConsumed;
      state = result.packet.state;
      conclusion = result.packet.conclusion;
    }

    expect(index).toBe(total);
    expect(total).toBeGreaterThan(0n);
  });
});

describe('the draws a DECISION consumes are part of the packet', () => {
  /**
   * **`decideAction` reads from the seed.** When the deterministic tiebreaks
   * leave two candidates genuinely identical, the defence AI resolves it with a
   * draw — and that draw has to advance the running index before the turn is
   * resolved, or the resolution reads from indices the decision already spent.
   *
   * Nothing about that failure is visible in a battle: it produces a perfectly
   * coherent fight, and only a replay comparing recorded draws against consumed
   * ones would ever notice. A uniform attacking squad makes the tie certain —
   * two identical champions in the same row, indistinguishable by every rule.
   */
  const uniform = Array<string>(6).fill(ROSTER[0]!);

  it('finds a board where the defence has to break a tie with a draw', () => {
    const seed = createSeed();
    const state = board(uniform, ROSTER.slice(6, 12));
    const decision = decideAction(state, seed, 0n, 'd-front-0', config);

    expect(decision.drawsConsumed).toBeGreaterThan(0n);
  });

  it('counts them, so the next turn does not re-read a spent index', () => {
    const seed = createSeed();

    /**
     * **A defender is put up first, deliberately.** Left alone, the opening
     * packet on this board stops immediately — the fastest attacker has four
     * usable powers, so it is a choice point and the packet carries no events
     * at all. Nudging one defender over the threshold makes the packet contain
     * the engine turns this test is about.
     */
    const state = withHero(board(uniform, ROSTER.slice(6, 12)), 'd-front-0', { accumulator: 99 });

    const opening = openingPacket(seed, state, 0n, configs);
    const acted = opening.packet.events.filter((e) => e.powerId !== null);
    const engineTurns = acted.filter((e) => e.source === 'engine').length;

    expect(acted.length, 'the opening packet resolved nothing').toBeGreaterThan(0);
    expect(engineTurns, 'no engine turn in the opening packet').toBeGreaterThan(0);

    /**
     * **The span is reconstructed independently, not bounded loosely.**
     *
     * The resolver's draw order is fixed: one draw for the hit, and a second
     * for the crit only if the hit landed. A friendly power takes neither. Each
     * engine turn additionally spends **one** decision draw on this board,
     * because a uniform attacking squad makes the tiebreak certain.
     *
     * **Plus one draw per hostile rider contested** (020, step 3). Riders are
     * contested one at a time and only against a hero the payload connected
     * with; a rider aimed at the caster is never contested and spends nothing.
     * The two are separable without looking up the power, because a landed
     * rider records the instance it sits on — a self-rider names the actor.
     *
     * **What is no longer asserted, and why** (020). This used to add exactly
     * `engineTurns` for the decisions, on the reasoning that a uniform attacking
     * squad makes every tiebreak certain. That stopped being true once riders
     * landed — and for a good reason rather than a bad one: the first attack now
     * also applies an effect, so by the second decision the attackers are no
     * longer identical and `lowest-current-hp` picks a target outright, spending
     * no draw. The count was never a property of the boundary rule; it was a
     * property of a board where nothing had happened yet.
     *
     * So the floor is asserted exactly and the decisions are asserted to be
     * *present*. That still catches the regression this test exists for —
     * dropping decision draws entirely, so the next turn re-reads a spent index —
     * without pinning a number that legitimately moves.
     */
    const riderDraws = acted.reduce((sum, e) => {
      const onOthers = e.outcome.ridersLanded.filter(
        (r) => !r.endsWith(`:${e.actorInstanceId}`),
      ).length;
      return sum + BigInt(onOthers + e.outcome.ridersResisted.length);
    }, 0n);

    const resolutionDraws = acted.reduce(
      (sum, e) => sum + (e.outcome.healing > 0 && e.outcome.damage === 0 ? 0n : e.outcome.hit ? 2n : 1n),
      0n,
    );
    const floor = resolutionDraws + riderDraws;

    expect(opening.drawsConsumed, 'fewer draws than the events alone require').toBeGreaterThanOrEqual(
      floor,
    );
    expect(
      opening.drawsConsumed,
      'the decision draws were not counted — the next turn will re-read a spent index',
    ).toBeGreaterThan(floor);
  });
});

describe('a hero that passes still ends its turn', () => {
  /**
   * **Skipping Resolution on a pass is how a cooldown stops paying down.** A
   * champion out of reach passes for several turns at the start of a battle; if
   * those turns did not tick, it would arrive in range with every power still
   * on the cooldown it had when the fight began — and then fire all of them.
   */
  it('ticks the cooldowns of a champion with nothing in reach', () => {
    const seed = createSeed();
    const reachless = 'a-middle-0';

    const base = board(Array<string>(6).fill(REACH_1), ROSTER.slice(6, 12));
    const auto = autoPowerOf(REACH_1);
    const state = withHero(base, reachless, { cooldowns: { [auto]: 5 }, accumulator: 99 });

    // It cannot reach anything, so its turn is a pass folded into the packet.
    expect(usablePowers(state, reachless)).toHaveLength(0);

    const opening = openingPacket(seed, state, 0n, configs);
    const passed = opening.packet.events.find(
      (e) => e.actorInstanceId === reachless && e.powerId === null,
    );
    expect(passed, 'the reachless hero never took its turn in this packet').toBeDefined();

    const after = opening.packet.state.heroes.find((h) => h.instanceId === reachless)!;
    expect(after.cooldowns[auto]).toBeLessThan(5);
  });
});
