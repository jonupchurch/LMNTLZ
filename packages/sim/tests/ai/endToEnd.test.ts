/**
 * The manual pass from [quickstart.md](../../../../specs/004-defense-ai/quickstart.md),
 * run as a test — and the proof that this feature actually plugs into the one
 * seam feature 003 left for it.
 *
 * `resolveDefenderTurn` takes an **injected** `DefenderChooser` precisely so the
 * resolver would not have to depend on a package that did not exist yet. This is
 * where the injection is finally satisfied by the real thing rather than by a
 * test stub, which is the only way to find out whether the two halves fit.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import {
  nextDrawIndex,
  resolveDefenderTurn,
  type ActionIntent,
  type BattleAction,
} from '../../resolver/index.js';
import { firingProfile } from '../../rules/firingProfile.js';
import { mustPass } from '../../rules/targeting.js';
import { decideAction } from '../../ai/decide.js';
import { defaultConfigFor } from '../../ai/defaults.js';
import type { BattleState } from '../../rules/state.js';
import { atTurn, board, bytes, clearRows, config, fixedSeed } from './fixtures.js';

const BATTLE = 'b-004-endtoend';
const SIX = ['h01', 'h02', 'h14', 'h19', 'h23', 'h25'];

/**
 * The adapter feature 007 will write, in miniature: read the board, ask the AI,
 * hand the resolver an intent. **Nothing about it is defense-specific** — the
 * intent is exactly the shape a player's client sends, so the resolver cannot
 * tell whose turn it resolved.
 */
function chooserFor(
  log: readonly BattleAction[],
  actorInstanceId: string,
  sequence: number,
): (state: BattleState) => ActionIntent {
  return (state) => {
    const actor = state.heroes.find((h) => h.instanceId === actorInstanceId)!;
    const cfg = defaultConfigFor(getHero(actor.heroId));
    const decision = decideAction(state, fixedSeed(), nextDrawIndex(log), actorInstanceId, cfg);

    return {
      sequence,
      actorInstanceId,
      powerId: decision.powerId ?? getHero(actor.heroId).powers.find((p) => p.tier === 0)!.id,
      targetInstanceId: decision.targetInstanceId,
    };
  };
}

/** Play `turns` defender actions and return the log. */
function playDefense(turns: number): readonly BattleAction[] {
  const seed = fixedSeed();
  const initial = atTurn(board(['h01'], SIX), 1);
  let log: BattleAction[] = [];

  for (let i = 0; i < turns; i++) {
    const actor = `d${i % 6}`;
    const { appendedAction } = resolveDefenderTurn(
      seed,
      initial,
      log,
      chooserFor(log, actor, i + 1),
      BATTLE,
    );
    log = [...log, appendedAction];
  }

  return log;
}

describe('the engine drives a real battle through the resolver', () => {
  it('plays a defender turn end to end', () => {
    const log = playDefense(1);

    expect(log).toHaveLength(1);
    expect(log[0]!.actorInstanceId).toBe('d0');
    expect(log[0]!.targetInstanceId).not.toBeNull();
    expect(log[0]!.battleId).toBe(BATTLE);
  });

  it('runs the same battle twice from one seed and makes every choice identical', () => {
    // Quickstart step 3. If these diverge, something in `ai/` reached for a
    // local random source instead of the resolver's seeded generator — and it
    // would show up as a battle that changed underneath a player between one
    // request and the next, because in-progress state is never stored.
    expect(bytes(playDefense(12))).toBe(bytes(playDefense(12)));
  });

  it('advances the draw index monotonically, with no gaps and no reuse', () => {
    const log = playDefense(12);

    let expected = 0n;
    for (const action of log) {
      expect(action.drawIndexBefore).toBe(expected);
      expected = action.drawIndexBefore + action.drawsConsumed;
    }
    expect(expected).toBeGreaterThan(0n);
  });

  it('produces a null target ONLY where the hero genuinely had nothing to hit', () => {
    // A pass is not a tactical choice (FR-012) — but it is a real outcome, and
    // this battle contains one: the defender back seat holds a reach-1 champion
    // three occupied rows from the enemy line, so nothing it owns can reach.
    //
    // `mustPass` is the independent witness. Asserting "never null" would have
    // been the comfortable claim and the false one.
    const initial = atTurn(board(['h01'], SIX), 1);
    const passers = new Set(
      initial.heroes
        .filter((h) => h.side === 'defender' && mustPass(initial, h.instanceId))
        .map((h) => h.instanceId),
    );

    expect(passers.size).toBeGreaterThan(0);
    expect(passers.size).toBeLessThan(6);

    for (const action of playDefense(6)) {
      if (action.targetInstanceId === null) {
        expect(passers, `${action.actorInstanceId} passed with a target available`).toContain(
          action.actorInstanceId,
        );
      }
    }
  });

  it('lets the same hero act once the line collapses and reach opens up', () => {
    const initial = atTurn(board(['h01'], SIX), 1);
    const boxedIn = [...initial.heroes].find(
      (h) => h.side === 'defender' && mustPass(initial, h.instanceId),
    )!;

    const collapsed = clearRows(initial, [4, 5, 3]);
    expect(mustPass(collapsed, boxedIn.instanceId)).toBe(false);
  });
});

describe('the manual pass', () => {
  it('step 1 — the worst ranking reports both ultimates dead', () => {
    // `1·2·3·4·5·0`, on every hero, at the horizon a player experiences.
    for (const heroId of SIX) {
      const profile = firingProfile(getHero(heroId), [1, 2, 3, 4, 5, 0]);
      const dead = profile.filter((e) => e.fires === 0).map((e) => e.tier);

      expect(dead, `${getHero(heroId).name}`).toContain(5);
      expect(dead, `${getHero(heroId).name}`).toContain(4);
    }
  });

  it('step 2 — `middle` with no rune behaves as `furthest`, not `nearest`', () => {
    const state = atTurn(board(['h01'], ['h02']), 5);
    const rowFor = (rule: 'nearest' | 'middle' | 'furthest') => {
      const decision = decideAction(state, fixedSeed(), 0n, 'd0', config({ targeting: [rule, rule] }));
      return state.heroes.find((h) => h.instanceId === decision.targetInstanceId)!.row;
    };

    expect(rowFor('middle')).toBe(rowFor('furthest'));
    expect(rowFor('middle')).not.toBe(rowFor('nearest'));
  });

  it('step 4 — the action log carries no trace of the configuration', () => {
    // What an attacker eventually sees is built from this. A ranking or a
    // targeting pair leaking here would let somebody read a defense once and
    // beat it every time after without ever fighting it again.
    const serialised = bytes(playDefense(6));

    for (const field of ['ranking', 'targeting', 'allyRule', 'lowest-current-hp', 'nearest']) {
      expect(serialised, field).not.toContain(field);
    }
  });
});
