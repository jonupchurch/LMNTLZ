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
  critRefusal,
  fallenBetween,
  healPreview,
  ignoresShields,
  heroStateOf,
  isStanding,
  legalTargets,
  lethalGuard,
  maxHp,
  onAllyStruck,
  onApplied,
  onCrit,
  onDeath,
  onHealed,
  onMissed,
  onStrike,
  onStruck,
  runeFirings,
  strikeChancesOf,
  struckChancesOf,
  turnStartChancesOf,
  applyPassiveEffects,
  chargeReaction,
  inReactionOrder,
  potencyForTier,
  reactionFor,
  SURVIVAL_HP,
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
  type ChanceHook,
  type PassiveEffect,
  type ReactionCandidate,
  type StatusInstance,
  type StrikeContext,
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
  /**
   * **Which rune effects did something this action** — `<effectId>:<instanceId>`,
   * the same `kind:instanceId` shape `ridersLanded` uses (021 US4).
   *
   * Stage 4 of a rune has never had a voice. A `Both Ways` bleed appeared on the
   * attacker from nowhere and `Too Close` took health off with no line at all, so
   * a player who spent 200 shards on a 25% effect had no way to learn it had ever
   * fired. The pips on the board say an effect *exists*; this says **a rune you
   * bought just did something**, which is the different question.
   *
   * Optional on the wire, because a replay recorded before this field existed
   * cannot be given one and must not be shown an invented empty list — the same
   * reasoning `overheal` carries.
   */
  readonly runesFired?: readonly string[];
  /**
   * **Counters this action provoked**, in the order they resolved (2026-08-02).
   *
   * A reaction is the only thing in the game that happens on somebody else's
   * turn, so it is the only event a log line cannot infer from the action it was
   * given — the attacker swung, and a second attack appeared inside it.
   *
   * **Absent rather than empty when nothing countered.** Most actions provoke
   * nothing, and a replay recorded before the reaction system existed cannot be
   * given a list it never had; both read the same through `?? []`.
   */
  readonly reactions?: readonly ReactionEvent[];
  readonly deaths: readonly string[];
  readonly conclusion: Conclusion | null;
}

/**
 * One counter, as the wire sees it.
 *
 * Deliberately the same shape as the outcome half of {@link ResolvedPacket} —
 * a reaction *is* an attack, resolved by the same pipeline, and giving it a
 * different vocabulary would invite a second set of log rules for the same
 * events. It carries no `conclusion`: the action reports one, once, after every
 * counter has resolved.
 */
export interface ReactionEvent {
  readonly actorInstanceId: string;
  readonly powerId: string;
  readonly targetInstanceId: string;
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly ridersLanded: readonly string[];
  readonly ridersResisted: readonly string[];
  readonly runesFired: readonly string[];
  readonly deaths: readonly string[];
}

/**
 * What {@link resolveOne} and a counter both get back from one payload.
 *
 * `touched` is the reaction candidate list — everybody the payload reached who
 * is still standing, carrying whether it actually connected. It is the one field
 * that exists purely for the caller: the strike itself has no use for it.
 */
interface StrikeOutcome {
  readonly state: BattleState;
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly ridersLanded: readonly string[];
  readonly ridersResisted: readonly string[];
  readonly runesFired: readonly string[];
  readonly deaths: readonly string[];
  readonly touched: readonly ReactionCandidate[];
  readonly drawsConsumed: bigint;
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

interface ChanceOutcome {
  readonly effects: readonly PassiveEffect[];
  readonly drawsUsed: bigint;
}

/** The context a strike-shaped hook is handed, built once and the same way everywhere. */
function strikeContextFor(
  state: BattleState,
  attacker: HeroState,
  defender: HeroState,
  power: Power,
): StrikeContext {
  const pool = maxHp(defender);
  return {
    state,
    attacker,
    defender,
    power,
    defenderHpFraction: pool > 0 ? defender.hp / pool : 0,
  };
}

/**
 * Stage 5a of the draw order: **the attacker's rules that roll** (021 US3).
 *
 * Two rules, and both are borrowed rather than invented:
 *
 * - **One draw per action, not per struck target** — the rule crit already plays
 *   by. `Take It Back` on a row power is one roll whose consequence reaches
 *   everybody the payload reached, so a wide power is not three chances at a
 *   rune that reads as *"25% per attack"*.
 * - **The contest, where there is one, is per target** — the rule `enactRiders`
 *   already plays by. `Knocked Loose`'s stun is a rider in everything but its
 *   name, and every defender resists for itself.
 *
 * **Nothing is drawn when nothing was struck.** A hero whose only target fell to
 * the payload consumes no chance draw, the same way a friendly power consumes no
 * rider contest — `resolveOne`'s "lazy is not an order" note is the whole doctrine.
 */
function enactStrikeChances(
  seed: Seed,
  state: BattleState,
  actor: HeroState,
  power: Power,
  struck: readonly string[],
  drawIndex: bigint,
): ChanceOutcome {
  const chances = strikeChancesOf(actor);
  if (chances.length === 0 || struck.length === 0) return { effects: [], drawsUsed: 0n };

  const effects: PassiveEffect[] = [];
  let used = 0n;

  for (const chance of chances) {
    const fired = drawBelow(seed, drawIndex + used, chance.chance);
    used += 1n;
    if (!fired) continue;

    for (const targetId of struck) {
      const defender = heroStateOf(state, targetId);
      if (!isStanding(defender)) continue;

      if (chance.contestedAt !== undefined) {
        const sticks = drawBelow(
          seed,
          drawIndex + used,
          riderLandProbability(state, actor.instanceId, targetId, chance.contestedAt),
        );
        used += 1n;
        if (!sticks) continue;
      }

      effects.push(...chance.effects(strikeContextFor(state, actor, defender, power)));
    }
  }

  return { effects, drawsUsed: used };
}

/**
 * Stage 5b: **the defenders' rules that roll**, one draw per struck bearer.
 *
 * Per bearer rather than per action, because each defender is answering for its
 * own rune — `Both Ways` belongs to whoever was hit, not to whoever swung. Where a
 * contest applies the roles invert with it: the struck champion is the applier and
 * the attacker is the one resisting.
 */
function enactStruckChances(
  seed: Seed,
  state: BattleState,
  actor: HeroState,
  power: Power,
  struck: readonly string[],
  drawIndex: bigint,
): ChanceOutcome {
  const effects: PassiveEffect[] = [];
  let used = 0n;

  for (const targetId of struck) {
    const defender = heroStateOf(state, targetId);
    if (!isStanding(defender)) continue;

    for (const chance of struckChancesOf(defender)) {
      const fired = drawBelow(seed, drawIndex + used, chance.chance);
      used += 1n;
      if (!fired) continue;

      if (chance.contestedAt !== undefined) {
        const sticks = drawBelow(
          seed,
          drawIndex + used,
          riderLandProbability(state, targetId, actor.instanceId, chance.contestedAt),
        );
        used += 1n;
        if (!sticks) continue;
      }

      effects.push(...chance.effects(strikeContextFor(state, actor, defender, power)));
    }
  }

  return { effects, drawsUsed: used };
}

/**
 * The roll a champion takes at the top of its own turn, **before it is offered
 * targets** (021 US3, `Further Than It Looks`).
 *
 * Exported because the turn loop owns turn start and the resolver owns draws, and
 * this is the one thing that is both. It returns a state rather than effects: the
 * grant has to be *on the board* before `isChoicePoint` counts the hero's options,
 * or the player would be shown the smaller list and the resolver the larger one.
 *
 * **A champion carrying nothing draws nothing**, which is what keeps every battle
 * fought before 021 replaying exactly as it was fought.
 */
export function rollTurnStart(
  seed: Seed,
  state: BattleState,
  instanceId: string,
  drawIndex: bigint,
): { readonly state: BattleState; readonly drawsConsumed: bigint } {
  const hero = heroStateOf(state, instanceId);
  const chances = turnStartChancesOf(hero);
  if (chances.length === 0) return { state, drawsConsumed: 0n };

  let next = state;
  let used = 0n;

  for (const chance of chances) {
    const fired = drawBelow(seed, drawIndex + used, chance.chance);
    used += 1n;
    if (!fired) continue;

    const holder = heroStateOf(next, instanceId);
    next = applyPassiveEffects(next, chance.effects({ state: next, hero: holder }), maxHp);
  }

  return { state: next, drawsConsumed: used };
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
  const shaped = shapeIncoming(state, current, shapeOutgoing(state, applier, built));

  /**
   * **A refusal can cost something** (021). `Not This Time` holds one charge
   * against a Stun or a Silence, and the charge is spent here — the shaping
   * decided both, so the payment travels with the decision rather than being
   * re-derived by a second reader that could disagree.
   */
  const instance = shaped.instance;
  if (instance === null || instance.turnsRemaining <= 0) {
    return shaped.paid.length > 0 ? applyPassiveEffects(state, shaped.paid, maxHp) : state;
  }

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

  const landedOn = replaceHero(state, { ...current, statuses, hp: current.hp + grant });

  /**
   * **`Word Travels` — the applier hears its own good news** (020 US3).
   *
   * Fired with the instance **as it landed**, after both shaping passes, so
   * Cirrolan's copy is half of what the ally actually received rather than half
   * of what was cast at them. The hook itself refuses a self-target, which is
   * what stops a copy from copying itself.
   */
  const echo = onApplied({
    state: landedOn,
    applier: heroStateOf(landedOn, applier.instanceId),
    bearer: heroStateOf(landedOn, current.instanceId),
    instance,
  });

  return echo.length > 0 ? applyPassiveEffects(landedOn, echo, maxHp) : landedOn;
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
 *   5. **rune chances** (021 US3) — the attacker's, then each struck defender's
 *   6. **reactions** (2026-08-02) — each counter's own 1–5 in turn, last of all
 *
 * "Lazy" is not an order. Each step is skipped rather than drawn-and-discarded,
 * which is why a miss consumes one index and a landed hit consumes two.
 *
 * **Steps 5 and 6 draw nothing for a board with no runes and no reactive power on
 * it**, which is what keeps every fixture written before 021 — and every battle
 * fought before it — resolving to the same outcome from the same seed. Turn start
 * has a draw of its own that belongs to the turn loop rather than to an action;
 * see {@link rollTurnStart}.
 *
 * **Step 6 is recursive in shape and bounded to one layer by construction.** A
 * counter runs steps 1–5 itself and then stops: `resolveStrike` cannot reach
 * `enactReactions`. So the draws an action consumes are bounded by the number of
 * heroes its payload touched, never by a chain.
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
    const healedIds: string[] = [];

    for (const target of targetsOf(state, power, primary)) {
      const preview = healPreview(next, actor.instanceId, power.id, target.instanceId);
      const current = heroStateOf(next, target.instanceId);
      const restored = Math.min(preview.amount, maxHp(current) - current.hp);
      healed += restored;
      healedIds.push(current.instanceId);
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

    /**
     * **What a landed heal sets off** (021 US2). `Runs Dry` halves one heal and
     * then lets go, and *"one"* has to be spent somewhere — this is the only
     * moment the board knows a heal happened.
     *
     * Folded after every target, not per target, so a party heal spends the mark
     * once rather than once per ally.
     */
    const healEffects = healedIds.flatMap((id) =>
      onHealed(next, heroStateOf(next, actor.instanceId), heroStateOf(next, id)),
    );
    if (healEffects.length > 0) next = applyPassiveEffects(next, healEffects, maxHp);

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

  const strike = resolveStrike(seed, state, actor, power, primary, at());
  consumed += strike.drawsConsumed;
  let next = strike.state;

  /**
   * ---- `EFFECT_ORDER` step 3: reactions ------------------------------------
   *
   * **The only way a hero acts outside its own turn**, and the last thing in the
   * action to draw. Placed after the strike has fully resolved — riders, rune
   * chances, triggers, the death sweep — so a counter answers the board the blow
   * actually left behind, and a defender the payload killed is already at 0 HP
   * and gates itself out.
   *
   * **It runs on a miss as well**, which is the whole of the 2026-07-27 ruling:
   * otherwise `Agility` — the defender's own defensive stat — suppresses the
   * defender's own counter, so the better your defense the less you retaliate.
   */
  const answered = enactReactions(seed, next, actor.instanceId, strike.touched, at());
  consumed += answered.drawsUsed;
  next = answered.state;

  /**
   * **A counter's kills are the action's kills too.** The client removes a
   * champion from the board off `deaths`, so a reaction that fells the attacker
   * has to appear there or the body stays standing until the next request. The
   * event keeps its own copy for the log line; this is the board's copy.
   *
   * De-duplicated through a `Set` rather than concatenated: nothing today can
   * report one death twice, and a duplicate would be a hero that fell twice in
   * one action on the wire.
   */
  const deaths =
    answered.events.length === 0
      ? strike.deaths
      : [...new Set([...strike.deaths, ...answered.events.flatMap((e) => e.deaths)])];

  return {
    state: next,
    packet: {
      hit: strike.hit,
      crit: strike.crit,
      damage: strike.damage,
      healing: 0,
      overheal: 0,
      ridersLanded: strike.ridersLanded,
      ridersResisted: strike.ridersResisted,
      /**
       * **Collected from the effect lists, not from the board** (021 US4).
       *
       * Diffing before and after would miss every effect whose consequence is not
       * a status — `Too Close` reflects damage, `Take It Back` removes something —
       * and those are precisely the ones a player cannot otherwise tell fired.
       * `runeFirings` reads the effects themselves, so the answer does not depend
       * on the effect leaving a mark.
       */
      runesFired: strike.runesFired,
      ...(answered.events.length > 0 ? { reactions: answered.events } : {}),
      deaths,
      conclusion: battleEnded(next),
    },
    drawsConsumed: consumed,
  };
}

/**
 * What a payload does when it lands — **one pipeline, called from two places.**
 *
 * An ordinary action calls it once. A reaction calls it once more, at the
 * attacker, and that is the entire reason it is a function rather than the body
 * of {@link resolveOne}: hit, crit, absorb, the lethal guard, riders, rune
 * chances, triggers and the death sweep are *the* damage rules, and a counter
 * that carried a second copy of them would drift from the first the moment
 * either changed (Constitution XIII).
 *
 * **It never fires a reaction itself, and that is the fence.** `04-turns.md`
 * bounds phase 4 at exactly one layer deep, because both squads are counter-built
 * by design and two reactive squads would otherwise ping-pong forever on a single
 * strike. Expressed as a call graph rather than a depth counter — `resolveOne` →
 * `enactReactions` → `resolveStrike` → nothing — so a second layer would need
 * somebody to add an edge, not to mis-set a number.
 *
 * Draws run from `drawIndex` in the order documented on {@link resolveOne}; the
 * count is returned rather than assumed.
 */
function resolveStrike(
  seed: Seed,
  state: BattleState,
  actor: HeroState,
  power: Power,
  primary: HeroState,
  drawIndex: bigint,
): StrikeOutcome {
  let consumed = 0n;
  const at = (): bigint => drawIndex + consumed;

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
    const missEffects = evaded.flatMap((defender) =>
      onMissed({ state, attacker: actor, defender, power, defenderHpFraction: 1 }),
    );
    const dodged = applyPassiveEffects(state, missEffects, maxHp);

    /**
     * **A miss is not the end of the action's draws.** The counter still fires —
     * `resolveOne` runs `enactReactions` on this outcome exactly as it does on a
     * landed one, and everybody who dodged is a candidate.
     *
     * `connected: false` is the word *damages* in `Nothing to Discuss`: a hero
     * that was swung at and missed was not damaged, so that passive silences
     * nobody here while `Already Gone` still refuses the counter outright.
     */
    return {
      state: dodged,
      hit: false,
      crit: false,
      damage: 0,
      ridersLanded: [],
      ridersResisted: [],
      runesFired: runeFirings(missEffects),
      deaths: [],
      touched: evaded.map((h) => ({ instanceId: h.instanceId, connected: false })),
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

  /** Read once for the packet: it is a property of the attacker, not of a target. */
  const piercesShields = ignoresShields(actor);

  for (const target of targetsOf(state, power, primary)) {
    const perTarget = damagePreview(next, actor.instanceId, power.id, target.instanceId);

    if (!isStanding(heroStateOf(next, target.instanceId))) continue;

    /**
     * **Crit is decided per packet and applied per target** (021 US2).
     *
     * `All One Piece` is immune to critical hits and `Turned Aside` spends a
     * charge to take the first one as a normal blow — so on a row-hitting power
     * one defender can eat the crit while the one beside it does not. The draw
     * above is untouched: cancelling it would let a defender's rune shift the
     * draw sequence for everybody else on the board.
     */
    const refusal = crit
      ? critRefusal(next, heroStateOf(next, target.instanceId))
      : { refused: false, paid: [] as readonly PassiveEffect[] };
    if (refusal.paid.length > 0) next = applyPassiveEffects(next, refusal.paid, maxHp);

    const raw = crit && !refusal.refused ? perTarget.critFinal : perTarget.final;

    /**
     * **Read after the charge is spent, never before.** `Turned Aside` pays with a
     * mark, and a `current` captured above would be written back over the top of
     * it a few lines down — the ward would refuse every crit for the rest of the
     * battle, and nothing would fail.
     */
    const current = heroStateOf(next, target.instanceId);

    /**
     * **The shield eats first, and a broken one passes the remainder through in
     * the same step** — it never absorbs a whole strike for free. `Straight Past`
     * is the one thing that skips it, deliberately answering `Before the First
     * Blow`, the most-taken effect in the common pool.
     */
    const { throughput, statuses } = absorb(current, raw, piercesShields);

    let hp = Math.max(0, current.hp - throughput);

    /**
     * **`Still Burning` — the one passive that changes whether a champion is on
     * the board** (020 US3).
     *
     * Checked here rather than after the fact because everything downstream reads
     * `deaths`: the second death check, `The Veil Closes`, the conclusion. A
     * guard applied later would have to *resurrect*, and a hero that died and
     * came back in one action is two events on the wire for one thing that
     * happened.
     *
     * The guard returns what it costs — a permanent, uncleansable mark — so
     * "once per battle" needs no field on `HeroState` and nothing can refund it.
     */
    let guardPaid: readonly PassiveEffect[] = [];
    if (hp === 0) {
      const paid = lethalGuard(next, current);
      if (paid !== null) {
        hp = SURVIVAL_HP;
        guardPaid = paid;
      }
    }

    /** HP actually lost, which a survived lethal blow makes different from `throughput`. */
    total += current.hp - hp;
    next = replaceHero(next, { ...current, hp, statuses });
    if (guardPaid.length > 0) next = applyPassiveEffects(next, guardPaid, maxHp);

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
   * ---- 5. rune chances — the only effects in the game that roll ------------
   *
   * Read off `next` for the same reason the trigger block below is: a rider that
   * just landed is part of the board these are answering about.
   *
   * **Attacker first, then defenders.** The order is arbitrary and therefore has
   * to be written down — it is the difference between two engine versions, and a
   * replay reads every later index from wherever this one left off.
   */
  /**
   * **The attacker as it stands now, not as it stood before the swing.** Nothing
   * reads its stats through these hooks today, but `Both Ways` already scales off
   * the *defender's* live `Might` — so a stale attacker here is a difference
   * between two sides of one blow, waiting for the first effect that notices.
   */
  const swinger = heroStateOf(next, actor.instanceId);

  const attackerRolls = enactStrikeChances(seed, next, swinger, power, struck, at());
  consumed += attackerRolls.drawsUsed;
  const defenderRolls = enactStruckChances(seed, next, swinger, power, struck, at());
  consumed += defenderRolls.drawsUsed;
  const chanceEffects = [...attackerRolls.effects, ...defenderRolls.effects];

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
    const attacking = crit ? [...onStrike(ctx), ...onCrit(ctx)] : onStrike(ctx);

    /**
     * **Three heroes have something to say about one blow**, and until US3 only
     * the attacker did. The defender spends `First Guard` and loses `No Ripple`;
     * a bystander in the struck hero's row throws a shield over it.
     */
    return [
      ...attacking,
      ...onStruck(ctx),
      ...onAllyStruck(next, ctx.attacker, defender, power),
    ];
  });
  /**
   * **The rolls fold with the triggers, not after them.** `Too Close` reflects on
   * being struck and `Both Ways` bleeds on being struck; they are siblings, they
   * read the same board, and one fold means the death sweep below catches a kill
   * from either without either having to declare it.
   */
  const beforeTriggers = next;
  const folded = [...strikeEffects, ...chanceEffects];
  next = applyPassiveEffects(next, folded, maxHp);

  /**
   * **A trigger can kill, and the death has to be a death** (021 US2).
   *
   * `Too Close` reflects a fraction of the packet at the attacker, so for the
   * first time something other than the payload or a burn tick can take a champion
   * off the board. Swept rather than reported by the effect itself: the fold is
   * where HP changes, and a sweep is correct for every future effect that can kill
   * without anybody having to remember to declare it.
   *
   * `lethalGuard` has already run inside the fold, so anything found here genuinely
   * fell. Whoever fell is added to `deaths` — the packet the client draws its log
   * from — and to `fallen`, so `The Veil Closes` feeds on it exactly as it would
   * on a killing blow.
   */
  for (const felled of fallenBetween(beforeTriggers, next)) {
    deaths.push(felled.instanceId);
    fallen.push(felled);
  }

  /**
   * ---- `EFFECT_ORDER` step 5: what a death sets off ----------------------
   *
   * `The Veil Closes` feeds on it. Folded after the on-hit triggers so a champion
   * that killed and was healed in the same action reports one board, not two.
   */
  const deathEffects = fallen.flatMap((f) => onDeath(next, f));
  next = applyPassiveEffects(next, deathEffects, maxHp);

  return {
    state: next,
    hit: true,
    crit,
    damage: total,
    ridersLanded: landed,
    ridersResisted: resisted,
    runesFired: runeFirings([...folded, ...deathEffects]),
    deaths,
    /**
     * **Everybody the payload reached — not everybody who may counter.**
     *
     * This list deliberately does *not* filter the fallen, though a trigger
     * folded above can kill one. Standing is a clause of the reaction gate and
     * `reactionFor` owns it; a second copy here passed every test with the first
     * one deleted, which is what a redundant guard looks like from the outside
     * and how two readings of one rule start to disagree.
     */
    touched: struck.map((id) => ({ instanceId: id, connected: true })),
    drawsConsumed: consumed,
  };
}

/**
 * Every counter one action provokes, resolved in order.
 *
 * **Re-asked per candidate against the live board**, never against a list
 * computed up front: the first counter can fell the attacker, and the second
 * must then find nothing to swing at. `reactionFor` answers that; this loop only
 * decides who is asked and in what order.
 *
 * **The cooldown is charged before the counter resolves**, and it is charged
 * whether or not the blow lands — a reaction that missed was still spent, the
 * same as any power. See `reactionCharge` for why a cooldown-0 power is charged
 * here when `resolveClocks` leaves one free.
 */
function enactReactions(
  seed: Seed,
  state: BattleState,
  attackerInstanceId: string,
  touched: readonly ReactionCandidate[],
  drawIndex: bigint,
): {
  readonly state: BattleState;
  readonly events: readonly ReactionEvent[];
  readonly drawsUsed: bigint;
} {
  if (touched.length === 0) return { state, events: [], drawsUsed: 0n };

  let next = state;
  let used = 0n;
  const events: ReactionEvent[] = [];

  for (const candidate of inReactionOrder(next, touched)) {
    const opportunity = reactionFor(
      next,
      candidate.instanceId,
      attackerInstanceId,
      candidate.connected,
    );
    if (opportunity === null) continue;

    const reactor = heroStateOf(next, opportunity.reactorInstanceId);
    const counter = powerOf(reactor.heroId, opportunity.powerId);

    next = replaceHero(next, chargeReaction(reactor, counter.id, counter.cooldown));

    const outcome = resolveStrike(
      seed,
      next,
      heroStateOf(next, reactor.instanceId),
      counter,
      heroStateOf(next, attackerInstanceId),
      drawIndex + used,
    );
    used += outcome.drawsConsumed;
    next = outcome.state;

    events.push({
      actorInstanceId: reactor.instanceId,
      powerId: counter.id,
      targetInstanceId: attackerInstanceId,
      hit: outcome.hit,
      crit: outcome.crit,
      damage: outcome.damage,
      ridersLanded: outcome.ridersLanded,
      ridersResisted: outcome.ridersResisted,
      runesFired: outcome.runesFired,
      deaths: outcome.deaths,
    });
  }

  return { state: next, events, drawsUsed: used };
}

/**
 * **The primitive.** Pure in `(seed, initial, log)` — no I/O, no clock, no
 * ambient state.
 *
 * Every request replays, so this is the hot path and it is the simple one.
 *
 * ⚠️ **It models actions, not turns**, so it does not run {@link rollTurnStart}.
 * Production never re-derives through here — `apps/api` rebuilds a battle with
 * `openingPacket` and `resolveToNextChoice`, which fold whole turns and therefore
 * roll turn start exactly where the original battle did. This stays the
 * action-level primitive the determinism suites are written against.
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
