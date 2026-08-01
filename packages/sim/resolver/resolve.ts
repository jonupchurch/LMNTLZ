/**
 * Resolution — where a probability becomes an outcome.
 *
 * Everything here consumes randomness and **all of it is still a pure function
 * of `(seed, initialState, log)`**. That is the load-bearing fact of the whole
 * architecture: every request re-derives the battle from its log, so a draw from
 * a live entropy source would make the same request produce a different past.
 *
 * ### A deviation from `contracts/resolver.d.ts`, and why
 *
 * The contract writes `replay(seed, log)`. The squads a battle is fought with
 * are not in the action log — they belong to the battle row, which is feature
 * 007's repository. A two-argument `replay` would therefore have to *fetch*
 * them, and FR-002 forbids exactly that: no I/O, no ambient state.
 *
 * So the initial state is a **parameter**. Feature 007 reads the row and passes
 * it in. The function stays pure and the contract's intent — replay is the
 * primitive, resolveAction is built on it — is unchanged.
 */

import {
  battleEnded,
  damagePreview,
  healPreview,
  heroStateOf,
  isStanding,
  legalTargets,
  maxHp,
  type BattleState,
  type Conclusion,
  type HeroState,
} from '../rules/index.js';
import { getHero, type Power } from '@lmntlz/content';
import { drawBelow, drawInt } from './rng.js';
import type { Seed } from './seed.js';
import { nextDrawIndex, orderedLog, type BattleAction, type Provenance, type ReDeriveResult } from './replay.js';

export interface ResolvedPacket {
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly healing: number;
  /**
   * **Healing the target had no room for** (2026-08-01, reported from play).
   *
   * `healPreview` has always computed this and the resolver threw it away, so a
   * heal on a full-health ally and a broken heal were the same event on the
   * wire: `healing: 0`, with nothing to say which. That is half of *"healing
   * doesn't always work"* — the half where it genuinely did nothing, correctly,
   * and the screen could not say so.
   *
   * Reported rather than prevented. Overhealing is a legitimate play — topping
   * up a nearly-full tank before a burst — and refusing the cast would be worse
   * than wasting it.
   */
  readonly overheal: number;
  readonly ridersLanded: readonly string[];
  readonly ridersResisted: readonly string[];
  readonly deaths: readonly string[];
  readonly conclusion: Conclusion | null;
}

export interface ActionIntent {
  readonly sequence: number;
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string | null;
}

const powerOf = (heroId: string, powerId: string): Power => {
  const found = getHero(heroId).powers.find((p) => p.id === powerId);
  if (!found) throw new Error(`hero "${heroId}" has no power "${powerId}"`);
  return found;
};

/**
 * **Sort every per-target loop explicitly** — by row, then instance id (T017).
 *
 * Iteration order is a replay hazard that does not look like one. A `Map`
 * preserves insertion order and a plain object does not, across engines, for
 * integer-like keys. Anything that iterates a collection the resolver did not
 * order itself is a divergence waiting for a different runtime.
 */
function inResolutionOrder(heroes: readonly HeroState[]): readonly HeroState[] {
  return [...heroes].sort(
    (a, b) => a.row - b.row || (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0),
  );
}

/**
 * Which heroes one action touches.
 *
 * `single` is the named target; `row` and a numeric count fan out from it in
 * resolution order; `party` takes the whole side.
 */
function targetsOf(
  state: BattleState,
  power: Power,
  primary: HeroState,
): readonly HeroState[] {
  const pool = state.heroes.filter((h) => h.side === primary.side && isStanding(h));

  if (power.targets === 'single') return [primary];
  if (power.targets === 'party') return inResolutionOrder(pool);
  if (power.targets === 'row') {
    return inResolutionOrder(pool.filter((h) => h.row === primary.row));
  }

  // A numeric count: the named target first, then the rest in resolution order.
  const rest = inResolutionOrder(pool.filter((h) => h.instanceId !== primary.instanceId));
  return [primary, ...rest].slice(0, power.targets);
}

const replaceHero = (state: BattleState, next: HeroState): BattleState => ({
  ...state,
  heroes: state.heroes.map((h) => (h.instanceId === next.instanceId ? next : h)),
});

export interface Resolution {
  readonly state: BattleState;
  readonly packet: ResolvedPacket;
  readonly drawsConsumed: bigint;
}

/**
 * Resolve one action, taking draws from `drawIndex` onward.
 *
 * **The within-action draw order is fixed and is part of the engine contract**
 * (T016). Adding, removing or reordering a draw changes every in-flight battle's
 * future, which is what `engineVersion` identifies and why deploys drain before
 * switching:
 *
 *   1. **hit** — exactly one draw
 *   2. **crit** — one draw per *packet*, and **only if the hit landed**
 *   3. **riders** — one contest each, and only if the payload connected
 *   4. **targeting tiebreak** — only if the earlier tiebreaks left a choice
 *
 * "Lazy" is not an order. Each step is skipped rather than drawn-and-discarded,
 * which is why a miss consumes one index and a landed hit consumes two.
 */
export function resolveOne(
  seed: Seed,
  state: BattleState,
  intent: ActionIntent,
  drawIndex: bigint,
): Resolution {
  const actor = heroStateOf(state, intent.actorInstanceId);
  const power = powerOf(actor.heroId, intent.powerId);

  let consumed = 0n;
  const at = (): bigint => drawIndex + consumed;

  // ---- choose the target -------------------------------------------------
  const legal = legalTargets(state, actor.instanceId, power.id);

  if (legal.candidates.length === 0) {
    // The hero passes. It still reached Resolution; it simply had nothing to do.
    return {
      state,
      packet: {
        hit: false,
        crit: false,
        damage: 0,
        healing: 0,
        overheal: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
        conclusion: battleEnded(state),
      },
      drawsConsumed: 0n,
    };
  }

  let primaryId = intent.targetInstanceId ?? legal.compelled ?? legal.candidates[0]!;

  if (!legal.candidates.includes(primaryId)) {
    // The named target is not legal — a compulsion, a fallen hero, or a stale
    // client. Fall back rather than throwing: a battle must always advance.
    primaryId = legal.compelled ?? legal.candidates[0]!;
  }

  // Step 4, taken here because it decides WHICH target the rest applies to. It
  // only draws when the earlier stages genuinely left a choice.
  if (intent.targetInstanceId === null && legal.compelled === null && legal.candidates.length > 1) {
    const ordered = inResolutionOrder(
      legal.candidates.map((id) => heroStateOf(state, id)),
    );
    const { value, consumed: used } = drawInt(seed, at(), ordered.length);
    consumed += used;
    primaryId = ordered[value - 1]!.instanceId;
  }

  const primary = heroStateOf(state, primaryId);

  // ---- a friendly power runs the short path ------------------------------
  if (power.friendly) {
    let next = state;
    let healed = 0;
    let wasted = 0;

    for (const target of targetsOf(state, power, primary)) {
      const preview = healPreview(next, actor.instanceId, power.id, target.instanceId);
      const current = heroStateOf(next, target.instanceId);
      const restored = Math.min(preview.amount, maxHp(current) - current.hp);
      healed += restored;
      /**
       * **Kept rather than discarded**, which is the whole of the reported bug.
       * `healPreview` computes it and this loop used to drop it on the floor, so
       * a heal on a full-health ally left the engine as `healing: 0` — the same
       * event a broken heal would produce. Summed across targets like `healed`,
       * so a party heal reports the total waste rather than the last target's.
       */
      wasted += preview.overheal;
      next = replaceHero(next, { ...current, hp: current.hp + restored });
    }

    return {
      state: next,
      packet: {
        hit: true, // a heal is never dodged
        crit: false,
        damage: 0,
        healing: healed,
        overheal: wasted,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
        conclusion: battleEnded(next),
      },
      drawsConsumed: consumed,
    };
  }

  // ---- 1. hit — exactly one draw -----------------------------------------
  const preview = damagePreview(state, actor.instanceId, power.id, primary.instanceId);
  const hit = drawBelow(seed, at(), preview.hitProbability);
  consumed += 1n;

  if (!hit) {
    // A miss is NOT the end of a turn's draws in general — a reaction can fire
    // on an evaded attack — but no reactive power is authored yet, so nothing
    // draws here today. When one is, its contest goes at step 3.
    return {
      state,
      packet: {
        hit: false,
        crit: false,
        damage: 0,
        healing: 0,
        overheal: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
        conclusion: battleEnded(state),
      },
      drawsConsumed: consumed,
    };
  }

  // ---- 2. crit — one draw PER PACKET, not per target ---------------------
  const crit = drawBelow(seed, at(), preview.critChance);
  consumed += 1n;

  // ---- apply, in explicit resolution order -------------------------------
  let next = state;
  let total = 0;
  const deaths: string[] = [];

  for (const target of targetsOf(state, power, primary)) {
    const perTarget = damagePreview(next, actor.instanceId, power.id, target.instanceId);
    const amount = crit ? perTarget.critFinal : perTarget.final;

    const current = heroStateOf(next, target.instanceId);
    if (!isStanding(current)) continue;

    const hp = Math.max(0, current.hp - amount);
    total += Math.min(amount, current.hp);
    next = replaceHero(next, { ...current, hp });

    if (hp === 0) deaths.push(current.instanceId);
  }

  // ---- 3. riders ----------------------------------------------------------
  // The mechanism is here and the draw slot is reserved. No rider is authored on
  // any power yet — `03-powers.md` describes them in prose and the workbook has
  // no column — so this loop is empty today and consumes nothing. See
  // packages/content/README.md.
  const ridersLanded: string[] = [];
  const ridersResisted: string[] = [];

  return {
    state: next,
    packet: {
      hit: true,
      crit,
      damage: total,
      healing: 0,
      overheal: 0,
      ridersLanded,
      ridersResisted,
      deaths,
      conclusion: battleEnded(next),
    },
    drawsConsumed: consumed,
  };
}

/**
 * **The primitive.** Pure in `(seed, initial, log)` — no I/O, no clock, no
 * ambient state.
 *
 * Every request replays, so this is the hot path and it is the simple one.
 */
export function replay(
  seed: Seed,
  initial: BattleState,
  log: readonly BattleAction[],
): BattleState {
  let state = initial;
  let turn = initial.heroTurn;

  for (const action of orderedLog(log)) {
    const { state: next } = resolveOne(
      seed,
      { ...state, heroTurn: turn },
      {
        sequence: action.sequence,
        actorInstanceId: action.actorInstanceId,
        powerId: action.powerId,
        targetInstanceId: action.targetInstanceId,
      },
      action.drawIndexBefore,
    );
    state = next;
    turn += 1;
  }

  return { ...state, heroTurn: turn };
}

/** Every packet a log produces, in order. Used to build the replay artifact. */
export function replayEvents(
  seed: Seed,
  initial: BattleState,
  log: readonly BattleAction[],
): { readonly state: BattleState; readonly events: readonly ResolvedPacket[] } {
  let state = initial;
  let turn = initial.heroTurn;
  const events: ResolvedPacket[] = [];

  for (const action of orderedLog(log)) {
    const resolution = resolveOne(
      seed,
      { ...state, heroTurn: turn },
      {
        sequence: action.sequence,
        actorInstanceId: action.actorInstanceId,
        powerId: action.powerId,
        targetInstanceId: action.targetInstanceId,
      },
      action.drawIndexBefore,
    );
    state = resolution.state;
    events.push(resolution.packet);
    turn += 1;
  }

  return { state: { ...state, heroTurn: turn }, events };
}

/**
 * `replay` **plus one appended action** — built on replay, never the reverse.
 */
export function resolveAction(
  seed: Seed,
  initial: BattleState,
  log: readonly BattleAction[],
  intent: ActionIntent,
  battleId: string,
): { readonly packet: ResolvedPacket; readonly appendedAction: BattleAction } {
  const state = replay(seed, initial, log);
  const drawIndexBefore = nextDrawIndex(log);

  const resolution = resolveOne(seed, state, intent, drawIndexBefore);

  return {
    packet: resolution.packet,
    appendedAction: {
      battleId,
      sequence: intent.sequence,
      actorInstanceId: intent.actorInstanceId,
      powerId: intent.powerId,
      targetInstanceId: intent.targetInstanceId,
      drawIndexBefore,
      drawsConsumed: resolution.drawsConsumed,
    },
  };
}

/**
 * The engine's turn.
 *
 * **Every *choice* is delegated to `@lmntlz/sim/ai` and every *draw* to this
 * module**, so a defense plays reproducibly. The chooser is injected rather than
 * imported so that feature 004 can supply it without this module depending on a
 * package that does not exist yet — and so a test can drive a known choice.
 */
export type DefenderChooser = (state: BattleState) => ActionIntent;

export function resolveDefenderTurn(
  seed: Seed,
  initial: BattleState,
  log: readonly BattleAction[],
  choose: DefenderChooser,
  battleId: string,
): { readonly packet: ResolvedPacket; readonly appendedAction: BattleAction } {
  const state = replay(seed, initial, log);
  return resolveAction(seed, initial, log, choose(state), battleId);
}

/**
 * Re-derivation, **for investigation only** (FR-016).
 *
 * A version mismatch is **returned, never thrown and never papered over**. An
 * in-flight battle under a changed engine cannot be continued honestly, and
 * quietly continuing it would produce a battle that is neither the old engine's
 * nor the new one's. Feature 007 decides what happens next; the resolver's job
 * is to give the answer.
 *
 * The two versions are checked **separately** because they fail for different
 * reasons and a caller may well treat them differently (Constitution XVI).
 */
export function reDerive(
  seed: Seed,
  initial: BattleState,
  provenance: Provenance,
  log: readonly BattleAction[],
  current: { engineVersion: string; contentVersion: string },
): ReDeriveResult {
  if (provenance.engineVersion !== current.engineVersion) {
    return {
      ok: false,
      reason: 'engine-version',
      was: provenance.engineVersion,
      now: current.engineVersion,
    };
  }

  if (provenance.contentVersion !== current.contentVersion) {
    return {
      ok: false,
      reason: 'content-version',
      was: provenance.contentVersion,
      now: current.contentVersion,
    };
  }

  return { ok: true, state: replay(seed, initial, log) };
}
