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
  CONTROL_DURATION,
  absorb,
  applyStatus,
  battleEnded,
  damagePreview,
  dotTickForTier,
  durationForTier,
  effectiveStat,
  HP_PER_TOUGHNESS,
  healPreview,
  heroStateOf,
  isStanding,
  legalTargets,
  maxHp,
  onCrit,
  onDeath,
  onMissed,
  onStrike,
  applyPassiveEffects,
  potencyForTier,
  riderLandProbability,
  shapeIncoming,
  shapeOutgoing,
  shieldForTier,
  shredFraction,
  statChangeForTier,
  targetingFor,
  type BattleState,
  type Conclusion,
  type HeroState,
  type StatusInstance,
  type Tier,
} from '../rules/index.js';
import { getHero, powerEffectiveness, type Power, type Rider } from '@lmntlz/content';
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

/**
 * Build the effect a rider describes, at the magnitude its tier buys (020).
 *
 * **The rider says *what*; the tier says *how much*.** Nothing here reads a
 * number off the authored data, because the authored data has none — that is
 * Constitution XV, and it is what lets a rebalance edit one table in
 * `05-status.md` rather than 87 entries.
 */
function instanceFor(
  rider: Rider,
  power: Power,
  applier: HeroState,
  bearer: HeroState,
): StatusInstance | null {
  const tier = power.tier as Tier;
  const might = effectiveStat(applier, getHero(applier.heroId).stats, 'might');

  const base = {
    kind: rider.kind,
    stat: rider.stat,
    sourceInstanceId: applier.instanceId,
    sourcePowerId: power.id,
    escalation: 0,
    ticksDealt: 0,
    cleansable: true,
  } as const;

  switch (rider.kind) {
    case 'burn':
    case 'bleed':
    case 'poison': {
      const tick = dotTickForTier(tier, might);
      /**
       * **Snapshotted at application** — the type multiplier against *this*
       * target, folded in now and never recalculated. The applier can die, be
       * buffed or be debuffed and the effect is unchanged, which is why a
       * damage-over-time effect needs no fallback rule for a dead applier.
       */
      const typed = tick * powerEffectiveness(power, getHero(bearer.heroId));
      if (typed <= 0) return null;
      return { ...base, magnitude: Math.round(typed), turnsRemaining: durationForTier(tier) };
    }

    case 'buff':
    case 'debuff':
      return {
        ...base,
        magnitude: statChangeForTier(tier),
        turnsRemaining: durationForTier(tier),
      };

    case 'shred':
      return {
        ...base,
        magnitude: shredFraction(rider.band ?? 'small'),
        turnsRemaining: durationForTier(tier),
      };

    case 'shield':
      return {
        ...base,
        magnitude: shieldForTier(tier, might),
        turnsRemaining: durationForTier(tier),
      };

    /**
     * **Control is priced separately and never scales with tier.** One turn of
     * stun is the strongest single effect in the game; taking its duration from
     * the tier table would hand a tier-5 a four-turn stun.
     */
    case 'stun':
    case 'silence':
      return { ...base, magnitude: 0, turnsRemaining: CONTROL_DURATION };

    case 'taunt':
    case 'fade':
      return { ...base, magnitude: 0, turnsRemaining: durationForTier(tier) };

    default:
      return null;
  }
}

interface RiderOutcome {
  readonly state: BattleState;
  readonly landed: readonly string[];
  readonly resisted: readonly string[];
  readonly drawsUsed: bigint;
}

/**
 * Stage 3 of the draw order: **one contest per rider, per struck target.**
 *
 * Four rules, and each one is a place this could silently go wrong:
 *
 * - **A self-rider is never contested** and consumes no draw. A hero does not
 *   resist its own buff, and `05-status.md` says friendly effects skip the
 *   contest entirely.
 * - **Each rider is contested separately** (FR-004) — resisting a burn does not
 *   resist a slow. Every door is its own roll.
 * - **Order is the authored order**, never an object's key order, which is a
 *   replay hazard that does not look like one.
 * - **Only heroes still standing** take a rider. Applying a burn to a corpse
 *   would consume a draw for an effect that can never tick.
 */
function enactRiders(
  seed: Seed,
  state: BattleState,
  actor: HeroState,
  power: Power,
  struck: readonly string[],
  drawIndex: bigint,
): RiderOutcome {
  if (power.riders.length === 0) {
    return { state, landed: [], resisted: [], drawsUsed: 0n };
  }

  let next = state;
  let used = 0n;
  const landed: string[] = [];
  const resisted: string[] = [];

  for (const rider of power.riders) {
    if (rider.at === 'self') {
      // Uncontested, and it costs no draw.
      const applier = heroStateOf(next, actor.instanceId);
      next = applyOrRemove(next, applier, rider, power, applier, landed);
      continue;
    }

    for (const targetId of struck) {
      const bearer = heroStateOf(next, targetId);
      if (!isStanding(bearer)) continue;

      const chance = riderLandProbability(
        next,
        actor.instanceId,
        targetId,
        potencyForTier(power.tier as Tier),
      );
      const sticks = drawBelow(seed, drawIndex + used, chance);
      used += 1n;

      if (!sticks) {
        resisted.push(`${rider.kind}:${targetId}`);
        continue;
      }

      next = applyOrRemove(next, heroStateOf(next, actor.instanceId), rider, power, bearer, landed);
    }
  }

  return { state: next, landed, resisted, drawsUsed: used };
}

/** Apply an effect, or strip every effect of that kind. */
function applyOrRemove(
  state: BattleState,
  applier: HeroState,
  rider: Rider,
  power: Power,
  bearer: HeroState,
  landed: string[],
): BattleState {
  const current = heroStateOf(state, bearer.instanceId);

  if (rider.op === 'remove') {
    const before = current.statuses.length;
    const statuses = current.statuses.filter((s) => s.kind !== rider.kind || !s.cleansable);
    if (statuses.length === before) return state;
    landed.push(`${rider.kind}:${current.instanceId}`);
    return replaceHero(state, { ...current, statuses });
  }

  const built = instanceFor(rider, power, applier, current);
  if (built === null || built.turnsRemaining <= 0) return state;

  /**
   * **Shaped on the way out, then on the way in** (020 US2).
   *
   * `It Catches` and `Wears Through` change what the *applier* produces — a Fire
   * burn escalates, a Water shred does not expire — and `The Deep Holds` changes
   * what the *bearer* accepts. Two hooks rather than one because they belong to
   * two different heroes, and a single "modify the effect" hook would have to
   * guess which.
   *
   * A `null` from the incoming shape means the effect **does not land at all**:
   * control is priced at one turn, so shortening it by one removes it. The rider
   * still spent its draw — it won the contest and was then held.
   */
  const instance = shapeIncoming(current, shapeOutgoing(applier, built));
  if (instance === null || instance.turnsRemaining <= 0) return state;

  const statuses = applyStatus(current.statuses, instance);
  landed.push(`${rider.kind}:${current.instanceId}`);

  /**
   * **A `Toughness` buff is temporary hit points** (`05-status.md`).
   *
   * It raises maximum HP *and* grants the same amount as current HP, which is
   * what makes it useful the moment it lands rather than only after the next
   * heal. Without this it would be a bigger empty pool — worth nothing to a
   * champion about to die, which is exactly when it is cast.
   *
   * Granted only when the effect is genuinely new: `applyStatus` refreshes rather
   * than stacks a re-cast from the same source, and paying the HP again would
   * turn a refresh into a heal that spams.
   */
  const isNew = statuses.length > current.statuses.length;
  const grant =
    isNew && instance.kind === 'buff' && instance.stat === 'toughness'
      ? instance.magnitude * HP_PER_TOUGHNESS
      : 0;

  return replaceHero(state, { ...current, statuses, hp: current.hp + grant });
}

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

  /**
   * ---- choose the target -------------------------------------------------
   *
   * **The two arguments this call has never passed** (020). `legalTargets` has
   * accepted `filters` and `compulsion` since 002 and was called with three of
   * five, so every taunt and fade on the board was invisible to it — which is why
   * Tank and Buffer had no mechanical existence at all.
   */
  const { filters, compulsion } = targetingFor(state, actor.instanceId);
  const legal = legalTargets(state, actor.instanceId, power.id, filters, compulsion);

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
    /**
     * **The defender's own passives fire on an evasion** (020 US2) — `Never Where
     * You Struck` is the whole of Air's House rule, and it triggers on being
     * missed rather than on acting.
     *
     * Every hero the payload would have reached, not only the named target: the
     * hit draw is per *packet*, so a party power that misses was dodged by all of
     * them.
     */
    const evaded = targetsOf(state, power, primary);
    const dodged = applyPassiveEffects(
      state,
      evaded.flatMap((defender) =>
        onMissed({ state, attacker: actor, defender, power, defenderHpFraction: 1 }),
      ),
      maxHp,
    );

    // A miss is NOT the end of a turn's draws in general — a reaction can fire
    // on an evaded attack — but no reactive power is authored yet, so nothing
    // draws here today. When one is, its contest goes at step 3.
    return {
      state: dodged,
      packet: {
        hit: false,
        crit: false,
        damage: 0,
        healing: 0,
        overheal: 0,
        ridersLanded: [],
        ridersResisted: [],
        deaths: [],
        conclusion: battleEnded(dodged),
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

  /**
   * **The fallen as they stood, not as they lie.** `The Veil Closes` measures
   * reach to the hero that fell, and reach needs a row — which the post-death
   * state still carries, but only because a body is left on the board at 0 HP.
   * Keeping the pre-damage snapshot means the passive does not depend on that.
   */
  const fallen: HeroState[] = [];

  const struck: string[] = [];

  for (const target of targetsOf(state, power, primary)) {
    const perTarget = damagePreview(next, actor.instanceId, power.id, target.instanceId);
    const raw = crit ? perTarget.critFinal : perTarget.final;

    const current = heroStateOf(next, target.instanceId);
    if (!isStanding(current)) continue;

    /**
     * **The shield eats first, and a broken one passes the remainder through in
     * the same step** — it never absorbs a whole strike for free.
     */
    const { throughput, statuses } = absorb(current, raw);

    const hp = Math.max(0, current.hp - throughput);
    total += Math.min(throughput, current.hp);
    next = replaceHero(next, { ...current, hp, statuses });

    if (hp === 0) {
      deaths.push(current.instanceId);
      fallen.push(current);
    } else struck.push(current.instanceId);
  }

  // ---- 3. riders — one contest each, only on a payload that connected ------
  const { state: afterRiders, landed, resisted, drawsUsed } = enactRiders(
    seed,
    next,
    actor,
    power,
    struck,
    at(),
  );
  consumed += drawsUsed;
  next = afterRiders;

  /**
   * ---- `EFFECT_ORDER` step 2: on-hit triggers ----------------------------
   *
   * **After the riders and before the second death check**, which is the order
   * `phases.ts` fixed in 002 and nothing has ever run. Passives never draw, so
   * this whole block is invisible to the draw index — the reason `goldenPath` and
   * the three determinism suites keep reconstructing it exactly.
   *
   * Read off `next`, not `state`: `Find the Seam` counts the marks a target
   * already carries, and a party power striking one hero twice in a turn is not a
   * thing, but a rider that just landed is.
   */
  const strikeEffects = struck.flatMap((id) => {
    const defender = heroStateOf(next, id);
    const pool = maxHp(defender);
    const ctx = {
      state: next,
      attacker: heroStateOf(next, actor.instanceId),
      defender,
      power,
      defenderHpFraction: pool > 0 ? defender.hp / pool : 0,
    };
    /**
     * **The resolver decides which hook, the rule decides what it does.** `rules/`
     * may not declare a `crit: boolean` — `purity.test.ts` refuses it, because a
     * module that knows a swing critted is the resolver — so the branch lives
     * here and `The Cut Reopens` never sees a flag.
     */
    return crit ? [...onStrike(ctx), ...onCrit(ctx)] : onStrike(ctx);
  });
  next = applyPassiveEffects(next, strikeEffects, maxHp);

  /**
   * ---- `EFFECT_ORDER` step 5: what a death sets off ----------------------
   *
   * `The Veil Closes` feeds on it. Folded after the on-hit triggers so a champion
   * that killed and was healed in the same action reports one board, not two.
   */
  next = applyPassiveEffects(next, fallen.flatMap((f) => onDeath(next, f)), maxHp);

  const ridersLanded = landed;
  const ridersResisted = resisted;

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
