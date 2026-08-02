/**
 * Passives — the thirteen Role and House rules, and the hooks they hang on
 * (`resources/mechanics/03-powers.md`, feature 020 US2).
 *
 * ### What this file ends
 *
 * `hero.passives` is a tuple of three names and **had no consumer anywhere in
 * `packages/sim` or `apps/api`**. The roster drawer printed the names; the engine
 * never read them. So `Role` set the stat budget and then vanished, and a House
 * was a colour. Forty passives, forty pieces of decoration.
 *
 * ### The invariant that shapes every one of them: **a passive never draws**
 *
 * Every trigger here is something that *already* passed a contest — a hit landed,
 * a crit came up, a rider stuck, a hero fell. Nothing in this file consumes
 * randomness, which buys three things at once:
 *
 * - `rules/` stays pure, so `purity.test.ts` and `determinism.test.ts` hold
 *   (Constitution XII);
 * - the **draw order is untouched**, so `goldenPath` and the three determinism
 *   suites keep reconstructing it exactly;
 * - the client's `damagePreview` and the server's resolution agree about what a
 *   swing is worth, because both read `damageMultiplierFor` from here.
 *
 * The engine version still moves — outcomes change, so an in-flight battle cannot
 * be re-derived across the boundary (Constitution XVI) — but no *index* moves.
 *
 * ### Magnitudes are anchored, not invented
 *
 * `03-powers.md` states what each passive does and, for eight of the thirteen, no
 * number at all. Every number below is pinned to something already settled and
 * the anchor is named at its definition, so a tuning pass edits {@link
 * PASSIVE_MAGNITUDES} rather than hunting through thirteen closures.
 *
 * **Passives are priced at tier 1**, the lowest rung of `05-status.md`'s ladder.
 * A passive costs nothing — no cooldown, no gate, no card — so it should sit
 * below a power of any tier; and Constitution XIV makes *too weak* the cheap
 * direction to be wrong in, because the fix is raising the other twenty-six
 * rather than writing off somebody's spend.
 */

import { getHero, type Power } from '@lmntlz/content';
import {
  effectiveStat,
  heroStateOf,
  maxHp,
  mightOf,
  type BattleState,
  type HeroState,
  type StatusInstance,
} from './state.js';
import { distance, inReach } from './reach.js';
import {
  PERMANENT,
  accumulateStatus,
  applyStatus,
  clearFromSource,
  composeTargeting,
  definitionOf,
  dotTickForTier,
  durationForTier,
  cleanse,
  markCount,
  shieldForTier,
  statChangeForTier,
  statusFrom,
  targetingStatuses,
  type StatKey,
  type Tier,
} from './status.js';
import { runeHooksFor } from './runeEffects.js';
import type { Compulsion, TargetFilter } from './targeting.js';

// ---------------------------------------------------------------------------
// The numbers, in one place
// ---------------------------------------------------------------------------

/** The rung of `05-status.md`'s ladder every passive is priced at. */
export const PASSIVE_TIER: Tier = 1;

export const PASSIVE_MAGNITUDES = Object.freeze({
  /**
   * `Finish It` and `Measured Shot` — **one step on the effectiveness ladder**
   * (×1.25, a Fault), which is the only conditional damage multiplier the game
   * already prices.
   *
   * One constant for both, deliberately: they differ in **uptime**, not in size.
   * `Finish It` pays on roughly the back half of a target's life; `Measured Shot`
   * pays whenever a reach-2 hero is at its natural station. If either turns out
   * wrong, uptime is the honest knob — the condition, not the number.
   */
  roleDamageBonus: 0.25,

  /** `Finish It` — "below half pool", read literally. */
  finishItThreshold: 0.5,

  /** `Measured Shot` — `03-powers.md` says distance 2, and reach caps at 2 + runes. */
  measuredShotDistance: 2,

  /**
   * `Never Where You Struck` — the tier-1 stat change, in `Agility`.
   *
   * **Bounded twice over without any cap of its own**: the 75 stat cap, and the
   * 65% floor on hit probability that exists precisely so an `Agility` build
   * cannot become invincible. Re-applying from one source refreshes rather than
   * stacks, so this is uptime rather than a ladder.
   */
  missedAgility: statChangeForTier(PASSIVE_TIER),

  /**
   * `The Deep Holds` — control on this hero is **one turn shorter**.
   *
   * ⚠️ **Control is priced at exactly one turn** (`CONTROL_DURATION`), so this is
   * effectively immunity to `stun` and `silence` for the three Earth champions.
   * That is what the text says, and the magnitude is *derived* — it is 1 because
   * `CONTROL_DURATION` is 1, not because a number was chosen.
   *
   * It is not absolute: `Banked Coals` puts Cindara's control at two turns, so she
   * can still stun an Earth hero for one. **The row most likely to want an edit**,
   * and cheap to change because it is this constant alone.
   */
  controlShortening: 1,

  /**
   * `The Veil Closes` — a nearby death restores `Might × 1.0`.
   *
   * Anchored to `SHIELD_FRACTION` at tier 1: the same quantity of hit points a
   * tier-1 shield is worth. Deaths are rare and late — a median battle has eleven
   * at most — so the trigger is its own limiter.
   *
   * *"Nearby"* is **within reach**, reusing `inReach` rather than inventing an
   * adjacency rule. It widens as the line collapses, which is the passive working
   * as its name reads.
   */
  veilHealFraction: 1.0,

  /** `Nothing Holds` — five points of `Armor` a strike, to the `large` shred band. */
  nothingHoldsStep: 0.05,
  nothingHoldsCap: 0.4,

  /**
   * `Find the Seam` — `Penetration` per prior strike on the same target, capped at
   * the top of the stat-change ladder (`statChangeForTier(5)` = 25).
   */
  findTheSeamStep: 5,
  findTheSeamCap: statChangeForTier(5),

  /** `It Catches` — `05-status.md` states this one outright: +50% of base a tick. */
  itCatchesEscalation: 0.5,

  // -------------------------------------------------------------------------
  // The nineteen uniques — approved line by line, 2026-08-01
  // -------------------------------------------------------------------------

  /**
   * `The Long Patience` — `+5` `Might` a quiet turn, to the top of the ladder.
   *
   * Five turns to reach `statChangeForTier(5)`, which is the largest stat change
   * any power in the game can buy — and Bramwen only reaches it by being ignored
   * for five of her own turns in a battle that now runs about thirty. **Undone
   * rather than paused** by a landed hit: the whole shape is a threat a player
   * can answer with a single cheap attack.
   */
  longPatienceStep: 5,
  longPatienceCap: statChangeForTier(5),

  /**
   * `The Bone Beneath` — ⚠️ **`Magic Resist`, never `Armor`.**
   *
   * `05-status.md`'s balance review settled the stat and not the number: every
   * arcane champion sits at the roster-minimum `Armor` 15, so an `Armor` grant
   * would raise the stat they have least of *and* the one answering fewest
   * attacks. The magnitude is the tier-4 stat change, one rung below the top,
   * because the condition creates itself — every tank reaches half pool.
   */
  boneBeneathMagicResist: statChangeForTier(4),
  boneBeneathThreshold: 0.5,

  /**
   * `Something Green Returns` — **half of `The Veil Closes`, because it pays the
   * whole squad** rather than the witness alone.
   *
   * ⚠️ The trigger is reach-gated and the payout is not. Terragosa must be within
   * reach of the champion that fell — the same test `The Veil Closes` uses — and
   * everyone still standing on her side is then restored, wherever they stand.
   * Reach gates *targeting*: which head a power may choose. Nothing is chosen
   * here.
   */
  somethingGreenFraction: 0.5,

  /**
   * `Out of Reach` — one row, for one turn, renewed every time she acts.
   *
   * Anchored to the reach rune, which buys exactly `+1` **permanently**. This
   * rents what that buys, and the rent is due every turn: miss a turn to a stun
   * and the row is gone.
   */
  outOfReachRows: 1,

  /**
   * `Word Travels` — the copy Cirrolan keeps is **half** what the ally got.
   *
   * The buff was already paid for by the power that cast it; the discount is the
   * passive. Half rather than full because a Buffer that mirrored its own kit at
   * full strength would be the best target for its own powers, which inverts the
   * Role.
   */
  wordTravelsFraction: 0.5,

  /**
   * `Gravity Is a Suggestion` — `Seams Everywhere` exactly, gated on distance.
   *
   * One constant shared with Vantric's, deliberately: they are the same effect
   * priced differently, one always-on for a champion built around it and one
   * conditional for a champion that has to hold the back seat to keep it.
   */
  gravityMitigation: 0.7,
  gravityDistance: 2,

  /** `Nothing Left to Take` — one step on the effectiveness ladder, same as a Role. */
  nothingLeftBonus: 0.25,

  /** `Under Judgement` — the mirror of the above, read from the other side. */
  underJudgementBonus: 0.25,

  /**
   * `No Ripple` — the tier-2 stat change in `Agility`, **until anything lands.**
   *
   * It ends on the first hit Nix takes and never returns, which is why it can be
   * larger than the tier-1 change `Never Where You Struck` grants: that one
   * renews forever.
   */
  noRippleAgility: statChangeForTier(2),

  /**
   * `Nothing Casts Twice` — one turn, and **the only passive that touches a
   * cooldown.**
   *
   * Tempo rather than damage. Powerful across a long fight and close to invisible
   * in a short one — worth watching now that battles run about thirty hero turns
   * rather than the ~102 the design assumes.
   */
  nothingCastsTwiceTurns: 1,

  /**
   * `Still Burning` — survive at exactly 1, **once per battle**.
   *
   * The strongest single thing on the approval table, and once-per-battle is the
   * whole of its price. Spent by a mark that never expires and cannot be
   * cleansed, so nothing in the game can refund it.
   */
  stillBurningHp: 1,

  /**
   * `Merciful` — narrower and larger than `Finish It`, **and they stack.**
   *
   * Nyxara is a Striker, so under 25% she carries both: `1.25 × 1.40 = 1.75`.
   * That is intended — the two are a Role's floor and a champion's signature, and
   * a champion whose signature did not compound with its Role would be a champion
   * who plays like every other Striker.
   */
  mercifulBonus: 0.4,
  mercifulThreshold: 0.25,

  /**
   * `The Duelist's Habit` — **the exact inverse of Reckoning**, and the same size
   * as the Role bonus it is priced beside.
   *
   * Authored in `03-powers.md` with no magnitude, which is why it sat with the
   * nineteen rather than with the eight.
   */
  duelistBonus: 0.25,

  /**
   * `Confluence` — a payoff for playing Reyna's whole kit, not for a stat.
   *
   * Below a ladder step, because unlike every other conditional multiplier here
   * it **never turns off** once it is on.
   */
  confluenceBonus: 0.2,

  /** `Seams Everywhere` — the anchor the other mitigation passive is priced from. */
  seamsMitigation: 0.7,

  /**
   * `The Ledger Kept` — `+10` `Might` per fallen ally, permanent, capped at `+50`.
   *
   * The cap is five allies, which is a full wipe of everyone but Corvane — by
   * which point the battle is lost. So the effective ceiling is two or three, and
   * the number that looks uncapped is bounded by the fiction that produces it.
   */
  ledgerStep: 10,
  ledgerCap: 50,

  /** `Room to Swing` — `+5` `Armor` per enemy in reach, to `+30`. Already balanced. */
  roomToSwingStep: 5,
  roomToSwingCap: 30,

  /**
   * `First Guard` — the first blow each enemy lands on Lord Aiguille is worth
   * **75%** of itself.
   *
   * Once per attacker, so a full enemy squad spends it six times and never again.
   * It is a tax on opening a fight against him, not a wall.
   */
  firstGuardReduction: 0.75,

  /**
   * `No Warning` — Boldrek's critical hits land at **×2.5** rather than ×2.
   *
   * Crit chance is `Luck × 0.5%`, so at the roster's highest `Luck` this fires on
   * roughly one swing in five at best. A lottery ticket by design: the largest
   * multiplier in the game on the least reliable trigger.
   */
  noWarningCrit: 2.5,
} as const);

// ---------------------------------------------------------------------------
// The hook surface
// ---------------------------------------------------------------------------

/** Everything a passive needs to know about one swing. */
export interface StrikeContext {
  readonly state: BattleState;
  readonly attacker: HeroState;
  readonly defender: HeroState;
  readonly power: Power;
  /**
   * `defender.hp / maxHp(defender)`.
   *
   * **Passed in rather than computed**, because `maxHp` lives in `damage.ts` and
   * `damage.ts` reads this module — importing it back would be a value-level
   * cycle between the two halves of one pipeline.
   */
  readonly defenderHpFraction: number;
}

/**
 * Something a passive does that is not a number: a status to place, or hit points
 * to restore.
 *
 * Returned as data rather than applied in place so the hooks stay pure and the
 * **order** of application belongs to the caller — `EFFECT_ORDER` in `phases.ts`
 * fixes it, and every one of these can kill.
 */
export type PassiveEffect =
  | {
      readonly kind: 'status';
      readonly bearerInstanceId: string;
      readonly status: StatusInstance;
    }
  | {
      readonly kind: 'accumulate';
      readonly bearerInstanceId: string;
      readonly status: StatusInstance;
      readonly step: number;
      readonly cap: number;
    }
  | { readonly kind: 'heal'; readonly instanceId: string; readonly amount: number }
  /**
   * **Undo, not expire.** `The Long Patience` is the only passive whose build is
   * *removed* by an event rather than run down by a clock, and a duration cannot
   * say that.
   */
  | {
      readonly kind: 'clear';
      readonly bearerInstanceId: string;
      readonly sourceInstanceId: string;
      readonly sourcePowerId: string;
    }
  /**
   * **Damage with no attack behind it** (021 US2) — `Too Close` reflects a
   * fraction of the packet back at whoever swung.
   *
   * It is a `PassiveEffect` rather than a second call into the damage pipeline
   * because it is not an attack: no accuracy contest, no mitigation, no type
   * multiplier, no crit. The fraction is taken off the packet that already landed
   * and delivered. Anything else would make a defensive rune a second attack the
   * defender never aimed.
   *
   * **It can kill**, which is why it is ordered by `EFFECT_ORDER` with the rest —
   * and why `fold` runs it through `lethalGuard`, the same doorway a killing blow
   * and a burn tick already use.
   */
  | { readonly kind: 'damage'; readonly bearerInstanceId: string; readonly amount: number }
  /**
   * **Strip every effect of one polarity**, which is what a cleanse is.
   *
   * `negative` is the cleanse a player recognises; `positive` is a strip. One kind
   * with a parameter rather than two, because `cleanse` in `status.ts` is already
   * the single implementation and it takes the polarity. `cleansable: false` is
   * honoured there, so an uncleansable effect survives this exactly as it survives
   * a rider-borne cleanse.
   */
  | {
      readonly kind: 'cleanse';
      readonly bearerInstanceId: string;
      readonly polarity: 'negative' | 'positive';
    };

export interface DeathContext {
  readonly state: BattleState;
  /** The hero holding the passive. */
  readonly witness: HeroState;
  readonly fallen: HeroState;
}

/**
 * A third party watching a blow land on somebody else.
 *
 * `Ground Yielded` is the only passive that reads one: Tidewarden Coll shields
 * the ally beside her when that ally is struck, so the hero holding the passive
 * is neither the attacker nor the defender. Every existing hook assumed it was
 * one of the two.
 */
export interface WitnessContext {
  readonly state: BattleState;
  /** The hero holding the passive. Never the attacker, never the defender. */
  readonly witness: HeroState;
  readonly attacker: HeroState;
  readonly defender: HeroState;
  readonly power: Power;
}

/**
 * An effect this hero has just placed on somebody, **after** it landed.
 *
 * Read only by `Word Travels`, and only for effects that went to *another* hero:
 * a self-copy that could itself trigger a copy would not terminate.
 */
export interface ApplyContext {
  readonly state: BattleState;
  readonly applier: HeroState;
  readonly bearer: HeroState;
  readonly instance: StatusInstance;
}

/** What a conditional stat grant needs: the board, and the hero holding it. */
export interface StatContext {
  readonly state: BattleState;
  readonly hero: HeroState;
}

/**
 * An accuracy contest, with no power behind it.
 *
 * Narrower than {@link StrikeContext} deliberately — `hitProbability` is asked
 * *"can this hero hit that one"* long before a power is chosen, by the turn packet
 * and by every projection the client draws. A hook needing the power could not be
 * read there.
 */
export interface ContestContext {
  readonly state: BattleState;
  /** The hero whose hook is being asked — not necessarily either combatant. */
  readonly holder: HeroState;
  readonly attacker: HeroState;
  readonly defender: HeroState;
}

/**
 * A heal about to land, or one that just has.
 *
 * `holder` is the hero whose hook is being asked and is **neither** the healer nor
 * the target in the case this exists for: `Runs Dry` belongs to the enemy who
 * marked the target, and is watching somebody else's heal.
 */
export interface HealContext {
  readonly state: BattleState;
  readonly holder: HeroState;
  readonly healer: HeroState;
  readonly target: HeroState;
}

/**
 * A turn that has just finished, offered to the champion that took it.
 *
 * `killed` is *"did anything fall during that turn"*, which is as much as the
 * board can honestly say — a payload death and a reflected death are both the
 * champion's doing, and there is no third party who could have caused one during
 * somebody else's turn.
 */
export interface TurnEndContext {
  readonly state: BattleState;
  readonly hero: HeroState;
  readonly killed: boolean;
}

/** Permanent taunt, permanent fade, and who sees through them. */
export interface TargetingFlags {
  readonly taunts?: boolean;
  readonly fades?: boolean;
  readonly ignoresFade?: boolean;
  readonly immuneToTaunt?: boolean;
}

/**
 * What a bearer's incoming shaping produced.
 *
 * `instance` is the effect as it will land, and `null` means **it does not land at
 * all**. `paid` is what refusing it cost — the channel `lethalGuard` already uses,
 * and the reason `Not This Time`'s single charge needs no field on `HeroState`.
 *
 * **The two travel together because one decision produces both.** A ward that
 * decided "refused" in one function and "spent" in another would be two answers to
 * one question, free to disagree — and the disagreement here is a charge that
 * refuses every stun for the whole battle.
 */
export interface ShapedIncoming {
  readonly instance: StatusInstance | null;
  readonly paid: readonly PassiveEffect[];
}

/** An effect passing through unchanged, which is what almost every shaping does. */
export const shapedAs = (instance: StatusInstance | null): ShapedIncoming => ({
  instance,
  paid: [],
});

/**
 * The flags a hook grants **on this board**, collapsing the static and predicate
 * forms into one answer.
 *
 * Every reader goes through here, so a hook that became conditional cannot be read
 * as an object by something that has not been updated — the compiler refuses it.
 */
export function targetingFlagsOf(hooks: PassiveHooks, ctx: StatContext): TargetingFlags {
  if (!hooks.targeting) return {};
  return typeof hooks.targeting === 'function' ? hooks.targeting(ctx) : hooks.targeting;
}

/**
 * What one passive can hook.
 *
 * **Named hooks rather than a `passive.apply(state)` interface or an event bus.**
 * A bus makes ordering emergent, and `EFFECT_ORDER` exists precisely because
 * every effect in that phase can kill and *"the order decides who is still
 * standing to act."* A single `apply` would hide which moment a passive cares
 * about, forcing the engine to offer all forty every opportunity. This surface is
 * auditable: `rg 'onStrike' rules/passives.ts` lists everything that fires on a
 * hit.
 */
export interface PassiveHooks {
  readonly name: string;
  /** Multiplies outgoing damage. Read by `damagePreview`, so previews match. */
  readonly damageMultiplier?: (ctx: StrikeContext) => number;
  /** Adds flat `Penetration` to an outgoing attack. Also read by `damagePreview`. */
  readonly penetrationBonus?: (ctx: StrikeContext) => number;
  /** Fires on the attacker after its payload connects. */
  readonly onStrike?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /**
   * Fires on the attacker after a **critical** blow connects, in addition to
   * `onStrike`.
   *
   * **A separate hook rather than a flag on `StrikeContext`**, and `purity.test.ts`
   * is why: `rules/` may never declare a `crit: boolean`, because the module that
   * knows whether a swing critted is by definition the resolver. Splitting the
   * hook moves that knowledge back where it belongs — the resolver decides *which*
   * hook to call, and the rule only says what happens when it is called.
   */
  readonly onCrit?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /** Fires on the **defender** after an attack against it misses. */
  readonly onMissed?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /** Fires on the **defender** after a blow against it lands. */
  readonly onStruck?: (ctx: StrikeContext) => readonly PassiveEffect[];
  /** Fires on a **bystander** when a blow lands on somebody else. */
  readonly onAllyStruck?: (ctx: WitnessContext) => readonly PassiveEffect[];
  /** Fires on the **applier** after an effect it placed lands on another hero. */
  readonly onApplied?: (ctx: ApplyContext) => readonly PassiveEffect[];
  /** Fires on the hero at the top of its own Upkeep, before it acts. */
  readonly onUpkeep?: (ctx: StatContext) => readonly PassiveEffect[];
  /** Fires on the hero at the end of its own turn, after durations tick. */
  readonly onAct?: (ctx: StatContext) => readonly PassiveEffect[];
  /** Fires on any standing hero when somebody falls within its reach. */
  readonly onDeathNearby?: (ctx: DeathContext) => readonly PassiveEffect[];
  /**
   * Fires on any standing hero when somebody falls **anywhere**.
   *
   * A second death hook rather than a `withinReach` flag on the first, because
   * the two ask different questions and a flag would let a caller forget to
   * check it. `The Veil Closes` feeds on a death it could have reached; `The
   * Ledger Kept` counts a squadmate it could not save.
   */
  readonly onAnyDeath?: (ctx: DeathContext) => readonly PassiveEffect[];
  /**
   * Points added to one of the bearer's stats **while a condition holds**.
   *
   * Not a status: nothing applies these and nothing expires them. `Room to
   * Swing` is worth more as enemies close in and less as they fall, on the same
   * turn, with nothing written to the board. Read at the two places a stat is
   * consumed — `damagePreview` for the mitigation pair, `probability.ts` for the
   * accuracy contest.
   */
  readonly statBonus?: (ctx: StatContext, stat: StatKey) => number;
  /** Multiplies the mitigation an outgoing attack faces, before Penetration. */
  readonly mitigationMultiplier?: (ctx: StrikeContext) => number;
  /** Multiplies damage landing **on** this hero. Read by `damagePreview`. */
  readonly incomingMultiplier?: (ctx: StrikeContext) => number;
  /** Replaces `CRIT_MULTIPLIER` for this hero's own critical blows. */
  readonly critMultiplier?: number;
  /** Extra turns added to a cooldown an **enemy** just started. */
  readonly cooldownPenalty?: number;
  /**
   * Refuses a lethal blow, leaving the hero at 1 HP.
   *
   * Returns the effects that **pay for it** — `null` means the guard is not
   * available, which is how "once per battle" is expressed without a field on
   * `HeroState`.
   */
  readonly lethalGuard?: (ctx: StatContext) => readonly PassiveEffect[] | null;
  /**
   * Reshapes an effect this hero is **applying**, before it lands.
   *
   * The `StatContext` arrived in 021: the wrapper has always held the hero and
   * simply did not pass it down, so a rule that depended on the applier's own
   * state could not be written at all.
   */
  readonly shapeOutgoing?: (instance: StatusInstance, ctx: StatContext) => StatusInstance;
  /**
   * Reshapes an effect landing **on** this hero.
   *
   * Returns {@link ShapedIncoming} rather than a bare instance, because a ward has
   * to be able to say *"refused, and here is what that cost"* — see the type.
   */
  readonly shapeIncoming?: (instance: StatusInstance, ctx: StatContext) => ShapedIncoming;
  /**
   * Permanent taunt, permanent fade, and who sees through them.
   *
   * **Either a fixed set of flags or a function of the board** (021). The nine
   * House passives are unconditional and stay written as objects; `No One Saw`
   * fades its bearer only below half health, and a static object cannot say that.
   * Read through {@link targetingFlagsOf}, never destructured directly — reading a
   * function as an object takes it as truthy and fades its bearer forever.
   */
  readonly targeting?: TargetingFlags | ((ctx: StatContext) => TargetingFlags);
  /**
   * Multiplies a heal, wherever this hero stands in relation to it.
   *
   * **Consulted on every standing hero, not only on the target** — the same scan
   * `cooldownExtensionFor` already does — because the two effects that need it sit
   * on opposite sides: `Draws It Up` raises healing its own bearer receives, and
   * `Runs Dry` halves a heal on somebody the bearer marked. A hook read only on
   * the target could express the first and never the second.
   */
  readonly healMultiplier?: (ctx: HealContext) => number;
  /** Fires on any standing hero after a heal has landed. What `Runs Dry` spends. */
  readonly onHealed?: (ctx: HealContext) => readonly PassiveEffect[];
  /**
   * This hero cannot be critically hit.
   *
   * The crit is still **rolled** — one draw per packet, unconditionally — and then
   * not applied to this defender. Cancelling the draw would make a defender's rune
   * change the attacker's draw sequence, which is an `engineVersion` concern for
   * everybody else on the board.
   */
  readonly critImmune?: boolean;
  /**
   * Refuses a **critical** blow, which then lands as a normal hit.
   *
   * Exactly `lethalGuard`'s shape and for the same reason: `null` means the charge
   * is not available, and a non-null result is the effects that **pay for it**, so
   * *once per battle* needs no field on `HeroState`.
   */
  readonly critDowngrade?: (ctx: StatContext) => readonly PassiveEffect[] | null;
  /** This hero's attacks pass through shields rather than spending them. */
  readonly ignoresShields?: boolean;
  /**
   * A floor on this hero's chance to hit a given defender, or `null` for none.
   *
   * ⚠️ **The one exception to the 65–95% clamp** (`probability.ts`), and it is
   * deliberate: `Held in the Light` reads *"enemies below half HP cannot dodge
   * your attacks"*, which is a capability rather than a magnitude — the shape the
   * catalog requires of anything conditional. Documented at the clamp itself,
   * where a reader will look.
   */
  readonly hitFloor?: (ctx: ContestContext) => number | null;
  /**
   * Whether this champion takes another turn straight away, and what that costs.
   *
   * `lethalGuard`'s shape a third time: `null` is *"not this turn"*, and a
   * non-null result is the effects that **pay for it** — which is where the chain
   * bound lives (spec A-04). An extra turn that could grant another extra turn is
   * a champion that never stops while it keeps killing.
   */
  readonly actsAgain?: (ctx: TurnEndContext) => readonly PassiveEffect[] | null;
}

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

const M = PASSIVE_MAGNITUDES;

const passivePowerId = (name: string): string => `passive:${name}`;

/**
 * A status a passive places, at the passive tier.
 *
 * `sourcePowerId` is `passive:<name>` and never a real power id — that is what
 * keeps a `The Cut Reopens` bleed a *different source* from a bleed the same hero
 * applied by rider, so the two stack toward the cap of 3 instead of refreshing
 * each other into one.
 */
function fromPassive(
  name: string,
  applier: HeroState,
  kind: StatusInstance['kind'],
  fields: {
    readonly magnitude: number;
    readonly turnsRemaining: number;
    readonly stat?: StatKey | null;
    readonly escalation?: number;
    readonly cleansable?: boolean;
  },
): StatusInstance {
  /* The shape and its defaults live in `status.ts` (021), because rune effects
     build instances the same way and two copies of `cleansable ?? true` is how
     two sources of one effect start behaving differently. Only the id prefix
     belongs to this file. */
  return statusFrom(passivePowerId(name), applier, kind, fields);
}

/**
 * **`effectiveStat`, not the authored number.** A passive that read base `Might`
 * would ignore both the player's runes and any buff standing on the hero — and
 * `instanceFor` in the resolver already reads it this way, so a rider-applied
 * bleed and a passive-applied one would otherwise disagree about the same hero.
 */
// ---------------------------------------------------------------------------
// The four Role passives
// ---------------------------------------------------------------------------

const FINISH_IT: PassiveHooks = {
  name: 'Finish It',
  /**
   * **The target below half pool, not the attacker.** `07-defense-ai.md` pairs
   * this passive with the Striker's *lowest current HP* preference and calls it
   * *"pays for closing out — burst first"*; a self-referential reading would be a
   * comeback mechanic, which is the opposite kit.
   */
  damageMultiplier: (ctx) =>
    ctx.defenderHpFraction < M.finishItThreshold ? 1 + M.roleDamageBonus : 1,
};

const MEASURED_SHOT: PassiveHooks = {
  name: 'Measured Shot',
  /**
   * **Distance, not reach.** Distance counts *occupied* rows, so it shrinks as a
   * line collapses — a Ranged hero loses this bonus as the battle closes in, which
   * is the pressure the whole Role is built around.
   */
  damageMultiplier: (ctx) =>
    distance(ctx.state, ctx.attacker.row, ctx.defender.row) >= M.measuredShotDistance
      ? 1 + M.roleDamageBonus
      : 1,
};

/**
 * **Row-scoped taunt, and the scoping needs no code.**
 *
 * `legalTargets` drops a compulsion naming somebody the actor cannot reach, so a
 * tank compels exactly the attackers that could have hit it anyway — which is
 * what *"an attacker that cannot reach the tank chooses freely"* means. A row
 * test here would be a second implementation of reach.
 */
const HOLD_THE_LINE: PassiveHooks = {
  name: 'Hold the Line',
  targeting: { taunts: true },
};

/**
 * **Permanent fade, and self-limiting.** Once the Buffer is the only thing an
 * attacker can reach, the filter would empty the candidate set and `legalTargets`
 * ignores it. That invariant predates this passive by four features.
 */
const BEHIND_THE_LINE: PassiveHooks = {
  name: 'Behind the Line',
  targeting: { fades: true },
};

// ---------------------------------------------------------------------------
// The nine House passives
// ---------------------------------------------------------------------------

const THE_DEEP_HOLDS: PassiveHooks = {
  name: 'The Deep Holds',
  shapeIncoming: (instance) => {
    if (definitionOf(instance.kind).family !== 'control') return shapedAs(instance);
    /**
     * **An uncleansable effect cannot be shortened either** (021).
     *
     * `cleansable: false` reads as *"nothing may end this early"*, and clipping a
     * turn off it is ending it early by another route. Slash's `It Stays Open`
     * says *"cannot be cleansed **or reduced**"* in one breath, which is the same
     * rule — so it is written once, here, rather than as a second flag that would
     * have to be checked in both places and eventually would not be.
     */
    if (!instance.cleansable) return shapedAs(instance);
    const turns = instance.turnsRemaining - M.controlShortening;
    return shapedAs(turns > 0 ? { ...instance, turnsRemaining: turns } : null);
  },
};

const NEVER_WHERE_YOU_STRUCK: PassiveHooks = {
  name: 'Never Where You Struck',
  onMissed: (ctx) => [
    {
      kind: 'status',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Never Where You Struck', ctx.defender, 'buff', {
        stat: 'agility',
        magnitude: M.missedAgility,
        turnsRemaining: durationForTier(PASSIVE_TIER),
      }),
    },
  ],
};

/**
 * **Escalation, not a special case in the tick function** (T031).
 *
 * `upkeepDamage` already reads `escalation * ticksDealt` off the instance, and
 * `ticksDealt` counts ticks *dealt* rather than elapsed duration — which is what
 * makes this survive `Banked Coals` extending the burn by a turn.
 *
 * Scoped to `burn` alone, because `05-status.md` says *"a burn applied by a Fire
 * hero"*. Widening it to the whole damage-over-time family would be a buff, and
 * a buff is the cheap direction to move later.
 */
const IT_CATCHES: PassiveHooks = {
  name: 'It Catches',
  shapeOutgoing: (instance) =>
    instance.kind === 'burn'
      ? { ...instance, escalation: M.itCatchesEscalation }
      : instance,
};

const WEARS_THROUGH: PassiveHooks = {
  name: 'Wears Through',
  shapeOutgoing: (instance) =>
    instance.kind === 'shred' ? { ...instance, turnsRemaining: PERMANENT } : instance,
};

const NOTHING_STAYS_HIDDEN: PassiveHooks = {
  name: 'Nothing Stays Hidden',
  targeting: { ignoresFade: true },
};

const THE_VEIL_CLOSES: PassiveHooks = {
  name: 'The Veil Closes',
  onDeathNearby: (ctx) => [
    {
      kind: 'heal',
      instanceId: ctx.witness.instanceId,
      amount: Math.round(mightOf(ctx.witness) * M.veilHealFraction),
    },
  ],
};

/**
 * **A bleed from the crit itself, uncontested.**
 *
 * The crit already passed two draws — the hit and the crit — and a passive never
 * adds a third. Its magnitude comes from the power's own tier, floored at 1 so a
 * critical auto-attack still opens a cut.
 */
const THE_CUT_REOPENS: PassiveHooks = {
  name: 'The Cut Reopens',
  onCrit: (ctx) => {
    const tier = Math.max(ctx.power.tier, 1) as Tier;
    const magnitude = dotTickForTier(tier, mightOf(ctx.attacker));
    if (magnitude <= 0) return [];

    return [
      {
        kind: 'status',
        bearerInstanceId: ctx.defender.instanceId,
        status: fromPassive('The Cut Reopens', ctx.attacker, 'bleed', {
          magnitude,
          turnsRemaining: durationForTier(tier),
        }),
      },
    ];
  },
};

/**
 * **Sharpens against a repeat target**, counted with a `mark` the strike itself
 * places.
 *
 * The bonus is read in `damagePreview` and the mark is placed in `onStrike`, so
 * the count a swing reads is the count *before* that swing — the first strike on
 * a target is worth nothing extra, which is what "repeat" means.
 */
const FIND_THE_SEAM: PassiveHooks = {
  name: 'Find the Seam',
  penetrationBonus: (ctx) =>
    Math.min(
      markCount(ctx.defender, ctx.attacker.instanceId, passivePowerId('Find the Seam')) *
        M.findTheSeamStep,
      M.findTheSeamCap,
    ),
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Find the Seam', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      /**
       * **The mark counts; the passive caps.** Bounding the counter itself would
       * make it a `Find the Seam` field rather than bookkeeping, and the two
       * other passives that will read a mark — Reckoning and
       * `The Duelist's Habit` — want the raw total.
       */
      cap: PERMANENT,
    },
  ],
};

/**
 * **Crush removes the guard rather than piercing it**, and `03-powers.md` is
 * explicit that this one *stacks*.
 *
 * `accumulateStatus` rather than `applyStatus`, because the same source
 * refreshing is exactly what a stacking shred must not do. The cap is the `large`
 * shred band, so eight strikes reach 40% and the ninth adds nothing.
 */
const NOTHING_HOLDS: PassiveHooks = {
  name: 'Nothing Holds',
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('Nothing Holds', ctx.attacker, 'shred', {
        stat: 'armor',
        magnitude: 0,
        turnsRemaining: PERMANENT,
      }),
      step: M.nothingHoldsStep,
      cap: M.nothingHoldsCap,
    },
  ],
};

// ---------------------------------------------------------------------------
// Uniques whose effect was already authored (US3, T038)
// ---------------------------------------------------------------------------

/**
 * **The four whose effect was already written down**, from `03-powers.md` and
 * `05-status.md` between them. They needed nothing that did not already exist,
 * which is why they shipped a commit ahead of the nineteen.
 *
 * See {@link HELD_UNIQUES} for the three that are still names and what each is
 * waiting on.
 */
const IMMOVABLE: PassiveHooks = {
  name: 'Immovable',
  /** Mauless chooses freely. `composeTargeting` has taken this since US2. */
  targeting: { immuneToTaunt: true },
};

/**
 * **`cleansable: false` is on the instance rather than the kind**, and these two
 * passives are the reason. Ember Saelith's burns and Umbriel's debuffs still
 * expire on their own clock — they cannot be removed *early*.
 */
const NEVER_QUITE_OUT: PassiveHooks = {
  name: 'Never Quite Out',
  shapeOutgoing: (instance) =>
    instance.kind === 'burn' ? { ...instance, cleansable: false } : instance,
};

const WRITTEN_IN_PENCIL: PassiveHooks = {
  name: 'Written in Pencil',
  shapeOutgoing: (instance) =>
    instance.kind === 'debuff' ? { ...instance, cleansable: false } : instance,
};

/**
 * **+1 turn, never added magnitude** — `05-status.md` quotes this one while
 * explaining the duration table.
 *
 * It is the only thing in the game that puts control above one turn, which makes
 * it the single counter to `The Deep Holds`: outgoing shaping runs before
 * incoming, so Cindara's two-turn stun meets Earth's −1 and lands for one.
 *
 * A permanent effect is left alone. `Infinity + 1` is `Infinity` and would be
 * harmless, but reading it as "extended" would be wrong.
 */
const BANKED_COALS: PassiveHooks = {
  name: 'Banked Coals',
  shapeOutgoing: (instance) =>
    Number.isFinite(instance.turnsRemaining)
      ? { ...instance, turnsRemaining: instance.turnsRemaining + 1 }
      : instance,
};

// ---------------------------------------------------------------------------
// The nineteen approved uniques (US3, T039) — approved line by line 2026-08-01
// ---------------------------------------------------------------------------

/**
 * **Every one of these was approved as a sentence, and the sentence is quoted at
 * its definition.** The magnitudes live in {@link PASSIVE_MAGNITUDES} above and
 * in `resources/mechanics/03-powers.md`; nothing here invents a number.
 *
 * Two rows departed from the approved wording and both say so where they are
 * defined: `Gravity Is a Suggestion` and `Seams Everywhere` read *"the mitigation
 * answering this attack"* rather than `Armor` literally, because a literal
 * reading makes the first of them inert on every power its champion owns.
 */

/** *"each turn it has not been damaged: +5 Might, stacking, resets on being hit"* */
const THE_LONG_PATIENCE: PassiveHooks = {
  name: 'The Long Patience',
  onUpkeep: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.hero.instanceId,
      status: fromPassive('The Long Patience', ctx.hero, 'buff', {
        stat: 'might',
        magnitude: 0,
        turnsRemaining: PERMANENT,
      }),
      step: M.longPatienceStep,
      cap: M.longPatienceCap,
    },
  ],
  /**
   * **Cleared, not decremented.** A hit undoes the whole build — five quiet turns
   * for `+25`, and one cheap swing to take all of it back. That asymmetry is the
   * passive: it is a clock any opponent can stop for the price of one attack.
   */
  onStruck: (ctx) => [
    {
      kind: 'clear',
      bearerInstanceId: ctx.defender.instanceId,
      sourceInstanceId: ctx.defender.instanceId,
      sourcePowerId: passivePowerId('The Long Patience'),
    },
  ],
};

/** *"below half pool: +20 Magic Resist"* — ⚠️ Magic Resist, never Armor. */
const THE_BONE_BENEATH: PassiveHooks = {
  name: 'The Bone Beneath',
  statBonus: (ctx, stat) => {
    if (stat !== 'magicResist') return 0;
    const pool = maxHp(ctx.hero);
    if (pool <= 0) return 0;
    return ctx.hero.hp / pool < M.boneBeneathThreshold ? M.boneBeneathMagicResist : 0;
  },
};

/** *"an ally falls within reach: heals every surviving ally for Might × 0.5"* */
const SOMETHING_GREEN_RETURNS: PassiveHooks = {
  name: 'Something Green Returns',
  onDeathNearby: (ctx) => {
    if (ctx.fallen.side !== ctx.witness.side) return [];

    const amount = Math.round(mightOf(ctx.witness) * M.somethingGreenFraction);
    if (amount <= 0) return [];

    /**
     * **The whole squad, including Terragosa herself.** She is one of the
     * survivors, and a rule that excluded the healer would be a special case
     * nothing else in the game has. The reach test above is the trigger; it is
     * not a filter on who is paid.
     */
    return ctx.state.heroes
      .filter((h) => h.side === ctx.witness.side && h.hp > 0)
      .map((h) => ({ kind: 'heal' as const, instanceId: h.instanceId, amount }));
  },
};

/** *"after it acts: +1 reach for one turn"* */
const OUT_OF_REACH: PassiveHooks = {
  name: 'Out of Reach',
  /**
   * **Placed after Resolution has ticked**, or a one-turn effect granted at the
   * end of a turn would expire in the same breath it was granted. So Zephyrine
   * carries the extra row from her second action onward and loses it the moment
   * she misses a turn — which is what makes a stun on her worth more than the
   * turn it costs.
   */
  onAct: (ctx) => [
    {
      kind: 'status',
      bearerInstanceId: ctx.hero.instanceId,
      status: fromPassive('Out of Reach', ctx.hero, 'reach', {
        magnitude: M.outOfReachRows,
        turnsRemaining: durationForTier(PASSIVE_TIER),
      }),
    },
  ],
};

/** *"it buffs an ally: the buff also lands on itself at half magnitude"* */
const WORD_TRAVELS: PassiveHooks = {
  name: 'Word Travels',
  onApplied: (ctx) => {
    /**
     * **Positive effects only, and never onto itself.** Cirrolan's debuffs are
     * not mirrored — that would be a passive that hurts its own champion — and a
     * self-copy that could itself be copied would not terminate. Both guards are
     * load-bearing rather than defensive.
     */
    if (definitionOf(ctx.instance.kind).polarity !== 'positive') return [];
    if (ctx.bearer.instanceId === ctx.applier.instanceId) return [];
    if (ctx.bearer.side !== ctx.applier.side) return [];

    const magnitude = Math.round(ctx.instance.magnitude * M.wordTravelsFraction);
    if (magnitude <= 0) return [];

    return [
      {
        kind: 'status',
        bearerInstanceId: ctx.applier.instanceId,
        status: fromPassive('Word Travels', ctx.applier, ctx.instance.kind, {
          stat: ctx.instance.stat,
          magnitude,
          turnsRemaining: ctx.instance.turnsRemaining,
        }),
      },
    ];
  },
};

/**
 * *"attacking a target 2+ rows away: ignores 30% of Armor"*
 *
 * ⚠️ **Reads "the mitigation answering this attack" rather than `Armor`
 * literally.** Vael is an Air champion and every power she owns is arcane, so an
 * `Armor`-only implementation would be a passive that never once fired for the
 * hero who holds it. Flagged rather than assumed — the approved row says Armor.
 */
const GRAVITY_IS_A_SUGGESTION: PassiveHooks = {
  name: 'Gravity Is a Suggestion',
  mitigationMultiplier: (ctx) =>
    distance(ctx.state, ctx.attacker.row, ctx.defender.row) >= M.gravityDistance
      ? M.gravityMitigation
      : 1,
};

/** *"target has no positive statuses: +25% damage"* */
const NOTHING_LEFT_TO_TAKE: PassiveHooks = {
  name: 'Nothing Left to Take',
  damageMultiplier: (ctx) =>
    ctx.defender.statuses.some((s) => definitionOf(s.kind).polarity === 'positive')
      ? 1
      : 1 + M.nothingLeftBonus,
};

/** *"an ally in its row is struck: that ally gains a shield of Might × 1.0"* */
const GROUND_YIELDED: PassiveHooks = {
  name: 'Ground Yielded',
  onAllyStruck: (ctx) => {
    if (ctx.defender.side !== ctx.witness.side) return [];
    if (ctx.defender.row !== ctx.witness.row) return [];

    const magnitude = shieldForTier(PASSIVE_TIER, mightOf(ctx.witness));
    if (magnitude <= 0) return [];

    return [
      {
        kind: 'status',
        bearerInstanceId: ctx.defender.instanceId,
        status: fromPassive('Ground Yielded', ctx.witness, 'shield', {
          magnitude,
          turnsRemaining: durationForTier(PASSIVE_TIER),
        }),
      },
    ];
  },
};

/** *"it has not been struck this battle: +15 Agility"* */
const NO_RIPPLE: PassiveHooks = {
  name: 'No Ripple',
  statBonus: (ctx, stat) => {
    if (stat !== 'agility') return 0;
    return markCount(ctx.hero, ctx.hero.instanceId, passivePowerId('No Ripple')) > 0
      ? 0
      : M.noRippleAgility;
  },
  /**
   * **One mark, permanent and uncleansable, and it never comes off.** *"This
   * battle"* is a fact about the past, so nothing may undo it — a cleanse that
   * restored Nix's untouched state would let a support hand her back a stat by
   * pretending a hit never landed.
   */
  onStruck: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('No Ripple', ctx.defender, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: 1,
    },
  ],
};

/** *"target carries a debuff: +25% damage"* */
const UNDER_JUDGEMENT: PassiveHooks = {
  name: 'Under Judgement',
  damageMultiplier: (ctx) =>
    ctx.defender.statuses.some(
      (s) => definitionOf(s.kind).polarity === 'negative' && s.kind !== 'mark',
    )
      ? 1 + M.underJudgementBonus
      : 1,
};

/** *"an enemy uses a power: that power's cooldown +1 for that enemy"* */
const NOTHING_CASTS_TWICE: PassiveHooks = {
  name: 'Nothing Casts Twice',
  cooldownPenalty: M.nothingCastsTwiceTurns,
};

/** *"it would fall: survives at 1 HP, once per battle"* */
const STILL_BURNING: PassiveHooks = {
  name: 'Still Burning',
  lethalGuard: (ctx) => {
    if (markCount(ctx.hero, ctx.hero.instanceId, passivePowerId('Still Burning')) > 0) {
      return null;
    }
    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.hero.instanceId,
        status: fromPassive('Still Burning', ctx.hero, 'mark', {
          magnitude: 0,
          turnsRemaining: PERMANENT,
          cleansable: false,
        }),
        step: 1,
        cap: 1,
      },
    ];
  },
};

/** *"+40% damage against a target under 25%"* */
const MERCIFUL: PassiveHooks = {
  name: 'Merciful',
  damageMultiplier: (ctx) =>
    ctx.defenderHpFraction < M.mercifulThreshold ? 1 + M.mercifulBonus : 1,
};

/**
 * *"gains damage against a target it has not yet struck"* (`03-powers.md`), at
 * the magnitude approved with the nineteen.
 *
 * **The exact inverse of `It All Comes Back`**, and it uses the same bookkeeping
 * from the other end: a mark placed on every target it hits, read *before* the
 * blow it is placed by.
 */
const THE_DUELISTS_HABIT: PassiveHooks = {
  name: "The Duelist's Habit",
  damageMultiplier: (ctx) =>
    markCount(ctx.defender, ctx.attacker.instanceId, passivePowerId("The Duelist's Habit")) > 0
      ? 1
      : 1 + M.duelistBonus,
  onStrike: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive("The Duelist's Habit", ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: 1,
    },
  ],
};

/**
 * *"both her Forces have hit this battle: +20% damage for the rest of it"*
 *
 * Reyna's Forces are `slash` and `water`. A mark per Force, keyed by type on the
 * source power id, so the two counts cannot read each other — and placed only for
 * a type she actually holds, because a rune or a future power could give her a
 * third and *"both"* would stop meaning anything.
 */
const CONFLUENCE: PassiveHooks = {
  name: 'Confluence',
  damageMultiplier: (ctx) => {
    const forces = getHero(ctx.attacker.heroId).strengths;
    const landed = forces.every(
      (type) =>
        markCount(ctx.attacker, ctx.attacker.instanceId, passivePowerId(`Confluence:${type}`)) > 0,
    );
    return landed ? 1 + M.confluenceBonus : 1;
  },
  onStrike: (ctx) => {
    const forces = getHero(ctx.attacker.heroId).strengths;
    return ctx.power.types
      .filter((type) => forces.includes(type))
      .map((type) => ({
        kind: 'accumulate' as const,
        bearerInstanceId: ctx.attacker.instanceId,
        status: fromPassive(`Confluence:${type}`, ctx.attacker, 'mark', {
          magnitude: 0,
          turnsRemaining: PERMANENT,
          cleansable: false,
        }),
        step: 1,
        cap: 1,
      }));
  },
};

/**
 * *"×0.70 mitigation before Penetration"* — already balanced, and the anchor the
 * other mitigation passive is priced from.
 *
 * ⚠️ Reads the mitigation answering the attack rather than `Armor` alone; see
 * `Gravity Is a Suggestion` for why the two agree on this.
 */
const SEAMS_EVERYWHERE: PassiveHooks = {
  name: 'Seams Everywhere',
  mitigationMultiplier: () => M.seamsMitigation,
};

/** *"an enemy kills one of its allies: +10 Might per fallen ally, permanent"* */
const THE_LEDGER_KEPT: PassiveHooks = {
  name: 'The Ledger Kept',
  /**
   * **`onAnyDeath`, so reach never gates grief.** Corvane counts a squadmate he
   * could not have reached — that is the whole reading of the name — where `The
   * Veil Closes` feeds only on a death it stood beside.
   */
  onAnyDeath: (ctx) => {
    if (ctx.fallen.side !== ctx.witness.side) return [];
    return [
      {
        kind: 'accumulate',
        bearerInstanceId: ctx.witness.instanceId,
        status: fromPassive('The Ledger Kept', ctx.witness, 'buff', {
          stat: 'might',
          magnitude: 0,
          turnsRemaining: PERMANENT,
        }),
        step: M.ledgerStep,
        cap: M.ledgerCap,
      },
    ];
  },
};

/** *"+5 Armor per enemy in reach, cap +30"* — already balanced. */
const ROOM_TO_SWING: PassiveHooks = {
  name: 'Room to Swing',
  statBonus: (ctx, stat) => {
    if (stat !== 'armor') return 0;

    let enemies = 0;
    for (const other of ctx.state.heroes) {
      if (other.side === ctx.hero.side || other.hp <= 0) continue;
      if (inReach(ctx.state, ctx.hero.instanceId, other.row)) enemies++;
    }

    return Math.min(enemies * M.roomToSwingStep, M.roomToSwingCap);
  },
};

/** *"first time each enemy attacks it: that attack deals 25% less"* */
const FIRST_GUARD: PassiveHooks = {
  name: 'First Guard',
  /**
   * The mark is placed by `onStruck`, which runs **after** the damage it reduced
   * — so the blow that spends the guard is the blow the guard applies to. A mark
   * placed first would make the passive do nothing at all, which is the failure
   * mode a test pins.
   */
  incomingMultiplier: (ctx) =>
    markCount(ctx.defender, ctx.attacker.instanceId, passivePowerId('First Guard')) > 0
      ? 1
      : M.firstGuardReduction,
  onStruck: (ctx) => [
    {
      kind: 'accumulate',
      bearerInstanceId: ctx.defender.instanceId,
      status: fromPassive('First Guard', ctx.attacker, 'mark', {
        magnitude: 0,
        turnsRemaining: PERMANENT,
        cleansable: false,
      }),
      step: 1,
      cap: 1,
    },
  ],
};

/** *"a crit: +50% crit damage (×2.5 not ×2)"* */
const NO_WARNING: PassiveHooks = {
  name: 'No Warning',
  critMultiplier: M.noWarningCrit,
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const REGISTRY: Readonly<Record<string, PassiveHooks>> = Object.freeze({
  [FINISH_IT.name]: FINISH_IT,
  [HOLD_THE_LINE.name]: HOLD_THE_LINE,
  [MEASURED_SHOT.name]: MEASURED_SHOT,
  [BEHIND_THE_LINE.name]: BEHIND_THE_LINE,
  [THE_DEEP_HOLDS.name]: THE_DEEP_HOLDS,
  [NEVER_WHERE_YOU_STRUCK.name]: NEVER_WHERE_YOU_STRUCK,
  [IT_CATCHES.name]: IT_CATCHES,
  [WEARS_THROUGH.name]: WEARS_THROUGH,
  [NOTHING_STAYS_HIDDEN.name]: NOTHING_STAYS_HIDDEN,
  [THE_VEIL_CLOSES.name]: THE_VEIL_CLOSES,
  [THE_CUT_REOPENS.name]: THE_CUT_REOPENS,
  [FIND_THE_SEAM.name]: FIND_THE_SEAM,
  [NOTHING_HOLDS.name]: NOTHING_HOLDS,

  // Uniques — the four whose effect `03-powers.md` and `05-status.md` already
  // carried, and which needed nothing that did not exist.
  [IMMOVABLE.name]: IMMOVABLE,
  [NEVER_QUITE_OUT.name]: NEVER_QUITE_OUT,
  [WRITTEN_IN_PENCIL.name]: WRITTEN_IN_PENCIL,
  [BANKED_COALS.name]: BANKED_COALS,

  // Uniques — the nineteen approved 2026-08-01 (US3).
  [THE_LONG_PATIENCE.name]: THE_LONG_PATIENCE,
  [THE_BONE_BENEATH.name]: THE_BONE_BENEATH,
  [SOMETHING_GREEN_RETURNS.name]: SOMETHING_GREEN_RETURNS,
  [OUT_OF_REACH.name]: OUT_OF_REACH,
  [WORD_TRAVELS.name]: WORD_TRAVELS,
  [GRAVITY_IS_A_SUGGESTION.name]: GRAVITY_IS_A_SUGGESTION,
  [NOTHING_LEFT_TO_TAKE.name]: NOTHING_LEFT_TO_TAKE,
  [GROUND_YIELDED.name]: GROUND_YIELDED,
  [NO_RIPPLE.name]: NO_RIPPLE,
  [UNDER_JUDGEMENT.name]: UNDER_JUDGEMENT,
  [NOTHING_CASTS_TWICE.name]: NOTHING_CASTS_TWICE,
  [STILL_BURNING.name]: STILL_BURNING,
  [MERCIFUL.name]: MERCIFUL,
  [THE_DUELISTS_HABIT.name]: THE_DUELISTS_HABIT,
  [CONFLUENCE.name]: CONFLUENCE,
  [SEAMS_EVERYWHERE.name]: SEAMS_EVERYWHERE,
  [THE_LEDGER_KEPT.name]: THE_LEDGER_KEPT,
  [ROOM_TO_SWING.name]: ROOM_TO_SWING,
  [FIRST_GUARD.name]: FIRST_GUARD,
  [NO_WARNING.name]: NO_WARNING,
});

/**
 * The four uniques that are still names, and **why each one is held rather than
 * overlooked** (T039).
 *
 * | Held | Why |
 * |---|---|
 * | `Already Gone`, `Nothing to Discuss` | both concern **reactive powers**, of which the overlay authors zero — a 020 non-goal, and `04-turns.md` resolved to author the powers rather than replace the passives |
 * | `It All Comes Back` | the passive banks Reckoning; tier 4 **reads** it and tier 5 **spends** it, and no power can yet. Building the bank alone would be a seam with no caller |
 *
 * `The Duelist's Habit` was in this list until 2026-08-01: it was authored with
 * no magnitude, which is why it went to the approval table with the nineteen
 * rather than shipping with the eight.
 *
 * **Three of twenty-seven, and the number is asserted** — `passives.test.ts`
 * reads this list against the registry, so a unique that quietly stops being
 * implemented cannot pass as one that was never approved.
 */
export const HELD_UNIQUES: readonly string[] = Object.freeze([
  'Already Gone',
  'Nothing to Discuss',
  'It All Comes Back',
]);

/** Every passive with an implementation, by name. */
export const IMPLEMENTED_PASSIVES: readonly string[] = Object.freeze(Object.keys(REGISTRY));

/**
 * The hooks a hero actually carries — **read from `hero.passives`, never from its
 * Role or House**.
 *
 * The roster is the source: a champion gets `Hold the Line` because its passive
 * tuple names it, not because it is a Tank. The two agree today, and deriving
 * from Role would make a re-authored roster silently disagree with itself.
 *
 * Unimplemented passives are skipped, not thrown on. Nineteen of the twenty-seven
 * uniques have no authored effect yet (US3), and a battle must not fail because
 * one of them is still a name.
 */
export function hooksFor(heroId: string): readonly PassiveHooks[] {
  const hooks: PassiveHooks[] = [];
  for (const name of getHero(heroId).passives) {
    const found = REGISTRY[name];
    if (found) hooks.push(found);
  }
  return hooks;
}

/**
 * **Every hook this champion carries, from both sources — and the only lookup any
 * reader may use.**
 *
 * There are twenty-two registry lookups in this file. Twenty-one go through here,
 * which is why 021 could turn on thirty-three rune effects across the damage path,
 * the stat path, the targeting path and the turn loop by widening one function
 * rather than editing twenty-one call sites, each of which can be forgotten.
 * `hookReach.test.ts` reads this file's source and fails if a reader calls
 * {@link hooksFor} directly, so the invariant is checked rather than remembered.
 *
 * **The two sources are keyed differently and must stay that way.** Passives are
 * keyed by `heroId` — every copy of a champion has the same three. Rune effects
 * are keyed off the *instance*, because runes are per account: an attacker and a
 * defender fielding the same champion carry different ones.
 */
const hooksOf = (hero: HeroState): readonly PassiveHooks[] =>
  hero.runeEffects.length === 0
    ? hooksFor(hero.heroId)
    : [...hooksFor(hero.heroId), ...runeHooksFor(hero.runeEffects)];

// ---------------------------------------------------------------------------
// Readers — what the damage pipeline asks
// ---------------------------------------------------------------------------

/**
 * The product of every damage multiplier the attacker's passives contribute.
 *
 * **Multiplicative, so composition order cannot matter.** Nothing today stacks
 * two of these on one hero — a champion has one Role — but a unique could, and an
 * additive sum would make the order of `hero.passives` load-bearing.
 */
export function damageMultiplierFor(ctx: StrikeContext): number {
  let factor = 1;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.damageMultiplier) factor *= hooks.damageMultiplier(ctx);
  }
  return factor;
}

/** Flat `Penetration` the attacker's passives add against **this** defender. */
export function penetrationBonusFor(ctx: StrikeContext): number {
  let total = 0;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.penetrationBonus) total += hooks.penetrationBonus(ctx);
  }
  return total;
}

/**
 * The product of every multiplier the attacker's passives put on the **defender's
 * mitigation**, before `Penetration` is subtracted.
 *
 * Multiplicative, like `damageMultiplierFor`, so two shredding passives on one
 * champion compose to `0.49` rather than to `0.40` — a floor that approaches zero
 * without reaching it. Nothing on the roster carries two today.
 */
export function mitigationMultiplierFor(ctx: StrikeContext): number {
  let factor = 1;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.mitigationMultiplier) factor *= hooks.mitigationMultiplier(ctx);
  }
  return factor;
}

/**
 * What the **defender's** passives do to a blow arriving at it.
 *
 * Separate from `damageMultiplierFor` because the two read different heroes'
 * passive lists, and folding them into one function would make `First Guard`
 * depend on who happened to be attacking.
 */
export function incomingMultiplierFor(ctx: StrikeContext): number {
  let factor = 1;
  for (const hooks of hooksOf(ctx.defender)) {
    if (hooks.incomingMultiplier) factor *= hooks.incomingMultiplier(ctx);
  }
  return factor;
}

/**
 * The attacker's critical multiplier, or **`null` when nothing replaces the
 * default**.
 *
 * `null` rather than `CRIT_MULTIPLIER` deliberately: that constant lives in
 * `damage.ts`, which imports this module, and importing it back would put a
 * value-level cycle between them — a temporal-dead-zone crash at load rather
 * than a type error. So the rule answers *"is there an override"* and the damage
 * pipeline keeps ownership of its own default.
 *
 * **The largest override wins rather than the last one read.** Multiplying two
 * crit multipliers together would be a different effect entirely, and `No
 * Warning` is priced as a replacement: ×2.5, not ×2 × 1.5.
 */
export function critMultiplierFor(ctx: StrikeContext): number | null {
  let best: number | null = null;
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.critMultiplier !== undefined && (best === null || hooks.critMultiplier > best)) {
      best = hooks.critMultiplier;
    }
  }
  return best;
}

/**
 * Points a hero's own passives add to one of its stats **right now**.
 *
 * Called from the two places a stat is consumed rather than from `effectiveStat`,
 * and that is not a compromise: these are conditional on the *board*, so a reader
 * with only a `HeroState` could not answer them. `Room to Swing` is worth `+30`
 * with a full enemy squad in reach and `0` after a wipe, with nothing written
 * anywhere in between.
 */
export function statBonusFor(state: BattleState, hero: HeroState, stat: StatKey): number {
  let total = 0;
  for (const hooks of hooksOf(hero)) {
    if (hooks.statBonus) total += hooks.statBonus({ state, hero }, stat);
  }
  return total;
}

/**
 * Extra turns to add to a cooldown **`actorInstanceId` is about to start**.
 *
 * Read from the opposing side: `Nothing Casts Twice` is Lucen's, and it lengthens
 * what an *enemy* just spent. Only standing heroes count — a passive cannot reach
 * out of a grave.
 */
export function cooldownExtensionFor(state: BattleState, actorInstanceId: string): number {
  const actor = heroStateOf(state, actorInstanceId);
  let extra = 0;

  for (const hero of state.heroes) {
    if (hero.side === actor.side || hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      if (hooks.cooldownPenalty) extra += hooks.cooldownPenalty;
    }
  }

  return extra;
}

/**
 * **Whether this hero refuses to fall, and what that costs it.**
 *
 * `null` — the overwhelming case — means the blow lands as it would have. A
 * non-null result means the caller sets the hero's HP to `stillBurningHp` and
 * folds the returned effects, which are what makes the guard once-only.
 *
 * Returned rather than applied, because the two callers are in different packages
 * and at different phases: a killing blow in `resolveOne`, and a burn tick in the
 * API's Upkeep. **A death has two doorways and a guard that watched one would be
 * silently conditional on how the champion died.**
 */
export function lethalGuard(state: BattleState, hero: HeroState): readonly PassiveEffect[] | null {
  for (const hooks of hooksOf(hero)) {
    if (!hooks.lethalGuard) continue;
    const paid = hooks.lethalGuard({ state, hero });
    if (paid !== null) return paid;
  }
  return null;
}

/** What a passive is worth to a hero that survived a lethal blow. */
export const SURVIVAL_HP = PASSIVE_MAGNITUDES.stillBurningHp;

/**
 * **Whether this crit lands as a crit, and what refusing it cost** (021).
 *
 * Two effects answer, and only one of them is a charge: `All One Piece` is
 * unconditional immunity, `Turned Aside` spends a single use. Both are read here
 * so a caller asks *"does this crit apply"* once rather than checking a flag and
 * then, separately, a guard.
 *
 * The crit **draw still happens** either way. It is one draw per packet, shared by
 * every target the payload reaches, so a defender's rune cancelling it would
 * change the draw sequence for the rest of the board — an `engineVersion` concern
 * for a rule that is supposed to be one champion's business.
 */
export function critRefusal(
  state: BattleState,
  defender: HeroState,
): { readonly refused: boolean; readonly paid: readonly PassiveEffect[] } {
  for (const hooks of hooksOf(defender)) {
    if (hooks.critImmune) return { refused: true, paid: [] };
  }

  for (const hooks of hooksOf(defender)) {
    if (!hooks.critDowngrade) continue;
    const paid = hooks.critDowngrade({ state, hero: defender });
    if (paid !== null) return { refused: true, paid };
  }

  return { refused: false, paid: [] };
}

/** Whether this hero's attacks pass through shields rather than spending them. */
export function ignoresShields(hero: HeroState): boolean {
  return hooksOf(hero).some((h) => h.ignoresShields === true);
}

/**
 * The highest floor any effect on the board puts under this pairing, or `null`.
 *
 * Scanned across every standing hero rather than only the attacker, because a
 * floor is as legitimately a defender's business as an attacker's — nothing
 * authored uses that today, and a reader written to the attacker alone would have
 * to be found and widened when something does.
 */
export function hitFloorFor(
  state: BattleState,
  attacker: HeroState,
  defender: HeroState,
): number | null {
  let floor: number | null = null;

  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      if (!hooks.hitFloor) continue;
      const value = hooks.hitFloor({ state, holder: hero, attacker, defender });
      if (value !== null && (floor === null || value > floor)) floor = value;
    }
  }

  return floor;
}

/**
 * Everything the board says about the size of a heal, multiplied together.
 *
 * **Every standing hero is asked**, the same scan `cooldownExtensionFor` runs,
 * because the two effects that need it stand on opposite sides of the heal:
 * `Draws It Up` on the target, `Runs Dry` on an enemy who marked the target. A
 * reader written to the target alone could not express the second at all.
 */
export function healMultiplierFor(
  state: BattleState,
  healer: HeroState,
  target: HeroState,
): number {
  let multiplier = 1;

  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      if (hooks.healMultiplier) {
        multiplier *= hooks.healMultiplier({ state, holder: hero, healer, target });
      }
    }
  }

  return multiplier;
}

/** What a landed heal set off, board-wide. `Runs Dry` spends its mark here. */
export function onHealed(
  state: BattleState,
  healer: HeroState,
  target: HeroState,
): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];

  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      if (hooks.onHealed) effects.push(...hooks.onHealed({ state, holder: hero, healer, target }));
    }
  }

  return effects;
}

/**
 * Whether the champion that just finished a turn takes another, and what it pays.
 *
 * `null` — the overwhelming case — means the turn order proceeds as it would have.
 * A non-null result means the caller grants the extra turn and folds the effects,
 * which are what stop the extra from granting another.
 */
export function actsAgainAfter(
  state: BattleState,
  hero: HeroState,
  killed: boolean,
): readonly PassiveEffect[] | null {
  if (hero.hp <= 0) return null;
  for (const hooks of hooksOf(hero)) {
    if (!hooks.actsAgain) continue;
    const paid = hooks.actsAgain({ state, hero, killed });
    if (paid !== null) return paid;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Targeting — the passive half of taunt and fade
// ---------------------------------------------------------------------------

/**
 * Taunt and fade **as passives grant them**, merged with the status layer and
 * composed once.
 *
 * This is what the resolver calls; `statusTargeting` no longer exists, because a
 * function answering *"who may this hero target"* from only half the board is a
 * seam waiting to disagree with the other half.
 */
export function targetingFor(
  state: BattleState,
  actorInstanceId: string,
): { readonly filters: readonly TargetFilter[]; readonly compulsion: Compulsion | null } {
  const fromStatuses = targetingStatuses(state);

  const taunting = [...fromStatuses.taunting];
  const faded = [...fromStatuses.faded];

  for (const hero of state.heroes) {
    if (hero.hp <= 0) continue;
    for (const hooks of hooksOf(hero)) {
      /**
       * **Evaluated per hero, against this board** (021). `No One Saw` fades its
       * bearer only below half health, so the answer is a function of the state
       * rather than a property of the champion — and reading `hooks.targeting`
       * as an object here would have silently taken the *function* as truthy and
       * faded its bearer for the whole battle.
       */
      const flags = targetingFlagsOf(hooks, { state, hero });
      if (flags.taunts) taunting.push(hero.instanceId);
      if (flags.fades) faded.push(hero.instanceId);
    }
  }

  /**
   * **`hooksOf`, not `hooksFor` — this was the one reader that bypassed it.**
   *
   * It decides `ignoresFade` and `immuneToTaunt` for the *acting* hero, so reading
   * only `hero.passives` here meant a rune granting fade-piercing was seen for
   * every champion on the board except the one actually taking a turn — which is
   * to say never. Light's `Nowhere to Stand` is exactly that effect, and it is one
   * half of a deliberate counter-pair with Dark's `No One Saw`.
   *
   * Nothing would have failed. The loop above already used `hooksOf`, so the
   * targeting scan looked complete.
   */
  const actor = heroStateOf(state, actorInstanceId);
  const actorFlags = hooksOf(actor).map((h) => targetingFlagsOf(h, { state, hero: actor }));

  return composeTargeting(state, actorInstanceId, {
    taunting,
    faded,
    ignoresFade: actorFlags.some((f) => f.ignoresFade === true),
    immuneToTaunt: actorFlags.some((f) => f.immuneToTaunt === true),
  });
}

// ---------------------------------------------------------------------------
// Shaping an effect on its way in or out
// ---------------------------------------------------------------------------

/** Every `shapeOutgoing` the applier carries, applied in `hero.passives` order. */
export function shapeOutgoing(
  state: BattleState,
  applier: HeroState,
  instance: StatusInstance,
): StatusInstance {
  let shaped = instance;
  for (const hooks of hooksOf(applier)) {
    if (hooks.shapeOutgoing) shaped = hooks.shapeOutgoing(shaped, { state, hero: applier });
  }
  return shaped;
}

/**
 * Every `shapeIncoming` the bearer carries. **A `null` instance means the effect
 * does not land at all** — `The Deep Holds` against a one-turn stun.
 *
 * `paid` accumulates across hooks: two wards refusing the same effect both spend,
 * which is correct and is also unreachable today, since a champion carries at most
 * one of them.
 */
export function shapeIncoming(
  state: BattleState,
  bearer: HeroState,
  instance: StatusInstance,
): ShapedIncoming {
  let shaped: StatusInstance | null = instance;
  const paid: PassiveEffect[] = [];

  for (const hooks of hooksOf(bearer)) {
    if (!shaped || !hooks.shapeIncoming) continue;
    const result = hooks.shapeIncoming(shaped, { state, hero: bearer });
    shaped = result.instance;
    paid.push(...result.paid);
  }

  return { instance: shaped, paid };
}

// ---------------------------------------------------------------------------
// Triggers — pure state → state
// ---------------------------------------------------------------------------

/**
 * Fold one passive effect into the board.
 *
 * A heal is **clamped by the caller**, not here: the pool is `maxHp`, which lives
 * in `damage.ts`, and importing it would put a cycle between the damage pipeline
 * and the passives that modify it. `applyPassiveEffects` takes the clamp as a
 * function for exactly that reason.
 */
function fold(
  state: BattleState,
  effect: PassiveEffect,
  poolOf: (hero: HeroState) => number,
): BattleState {
  const id = effect.kind === 'heal' ? effect.instanceId : effect.bearerInstanceId;
  const hero = state.heroes.find((h) => h.instanceId === id);
  if (!hero || hero.hp <= 0) return state;

  let next: HeroState;

  if (effect.kind === 'heal') {
    next = { ...hero, hp: Math.min(hero.hp + effect.amount, poolOf(hero)) };
  } else if (effect.kind === 'damage') {
    /**
     * **A third doorway to a death, and it goes through the same guard** (021).
     *
     * A blow in `resolveOne` and a burn tick in the Upkeep are the other two, and
     * `Still Burning` watching only some of them would make survival silently
     * conditional on *how* a champion was killed. `Too Close` reflecting into a
     * 1-HP attacker is the case the spec names (FR-019).
     *
     * What fires **because** of the death is the caller's job: `resolveOne` and
     * the API's Upkeep both sweep for whoever fell during a fold, so a
     * reflect-kill is a death like any other rather than a body appearing on the
     * board with no event.
     */
    const hp = Math.max(0, hero.hp - effect.amount);
    if (hp === 0) {
      const paid = lethalGuard(state, hero);
      if (paid !== null) {
        const survived = {
          ...state,
          heroes: state.heroes.map((h) => (h.instanceId === id ? { ...h, hp: SURVIVAL_HP } : h)),
        };
        return applyPassiveEffects(survived, paid, poolOf);
      }
    }
    next = { ...hero, hp };
  } else if (effect.kind === 'cleanse') {
    next = { ...hero, statuses: cleanse(hero.statuses, effect.polarity) };
  } else if (effect.kind === 'accumulate') {
    next = {
      ...hero,
      statuses: accumulateStatus(hero.statuses, effect.status, effect.step, effect.cap),
    };
  } else if (effect.kind === 'clear') {
    next = {
      ...hero,
      statuses: clearFromSource(hero.statuses, effect.sourceInstanceId, effect.sourcePowerId),
    };
  } else {
    /**
     * **A ward refuses a passive-placed effect too**, and it has to pay for it
     * here as much as in the resolver — `The Floor Comes Up` stuns through this
     * path, not through a rider, so a ward that only watched the rider path would
     * be silently conditional on which rule stunned you.
     */
    const shaped = shapeIncoming(state, hero, effect.status);
    if (shaped.instance === null) {
      return shaped.paid.length > 0 ? applyPassiveEffects(state, shaped.paid, poolOf) : state;
    }
    next = { ...hero, statuses: applyStatus(hero.statuses, shaped.instance) };
  }

  /**
   * **A `Toughness` buff is temporary hit points here too** (`05-status.md`).
   *
   * The resolver grants it when a *rider* raises `Toughness`; a passive that did
   * the same and skipped the grant would hand the champion a bigger empty pool,
   * which is worth nothing to the hero about to die that a buff is cast on.
   *
   * Measured as **the growth of the pool** rather than recomputed from the
   * magnitude, so this needs neither `HP_PER_TOUGHNESS` nor a second copy of the
   * arithmetic — and it is correct for any future effect that widens the pool by
   * any route.
   */
  const pool = poolOf(next);
  const grant = Math.max(0, pool - poolOf(hero));

  /**
   * **And the pool can shrink here too**, which is the same defect `clampToPool`
   * exists for in the turn loop: a `clear` that removed a `Toughness` buff would
   * leave a champion holding more health than it has room for. Floored at 1 —
   * losing a buff should return a hero to the brink, never past it, because a
   * death with no killer has no event and nothing a player can read.
   */
  const hp = Math.min(next.hp + grant, Math.max(1, pool));

  return {
    ...state,
    heroes: state.heroes.map((h) => (h.instanceId === id ? { ...next, hp } : h)),
  };
}

export function applyPassiveEffects(
  state: BattleState,
  effects: readonly PassiveEffect[],
  poolOf: (hero: HeroState) => number,
): BattleState {
  let next = state;
  for (const effect of effects) next = fold(next, effect, poolOf);
  return next;
}

/**
 * **Who was standing before a fold and is not after it** (021 US2).
 *
 * Until `Too Close`, nothing but the payload and a burn tick could take a champion
 * off the board, so every caller knew its own deaths. A reflect can kill during an
 * effect fold, and a death that nothing reports is a body on the board with no log
 * line, no `The Veil Closes`, and a conclusion that arrives without explanation.
 *
 * **One implementation, two callers** — `resolveOne` and the API's Upkeep — because
 * *"who fell just now"* asked twice is two answers free to disagree. Returns the
 * heroes **as they stood**: reach needs the row, which a post-death read still
 * carries only by the accident of leaving a body at 0 HP.
 */
export function fallenBetween(before: BattleState, after: BattleState): readonly HeroState[] {
  return before.heroes.filter(
    (h) => h.hp > 0 && (after.heroes.find((x) => x.instanceId === h.instanceId)?.hp ?? 1) <= 0,
  );
}

/**
 * The attacker's on-hit passives, for one struck target.
 *
 * Called **per target** rather than per action, because `Nothing Holds` and
 * `Find the Seam` both mark the hero they hit and a party-wide power hits six.
 */
export function onStrike(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.onStrike) effects.push(...hooks.onStrike(ctx));
  }
  return effects;
}

/**
 * The attacker's on-crit passives, called **in addition to** `onStrike` and only
 * by the resolver, which is the one module allowed to know a swing critted.
 */
export function onCrit(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.attacker)) {
    if (hooks.onCrit) effects.push(...hooks.onCrit(ctx));
  }
  return effects;
}

/** The **defender's** own passives, after an attack against it misses. */
export function onMissed(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.defender)) {
    if (hooks.onMissed) effects.push(...hooks.onMissed(ctx));
  }
  return effects;
}

/**
 * The **defender's** own passives, after a blow against it lands.
 *
 * Three of the nineteen live here and all three are about *the first time*
 * something happened: `The Long Patience` loses a build, `No Ripple` loses a
 * stat for good, `First Guard` spends its discount against one attacker.
 */
export function onStruck(ctx: StrikeContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.defender)) {
    if (hooks.onStruck) effects.push(...hooks.onStruck(ctx));
  }
  return effects;
}

/**
 * Every **bystander** watching a blow land on somebody else, in board order.
 *
 * Neither the attacker nor the defender is offered the hook — they have their
 * own — so a passive here can never double up with one of theirs.
 */
export function onAllyStruck(
  state: BattleState,
  attacker: HeroState,
  defender: HeroState,
  power: Power,
): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];

  for (const witness of state.heroes) {
    if (witness.hp <= 0) continue;
    if (witness.instanceId === defender.instanceId) continue;
    if (witness.instanceId === attacker.instanceId) continue;

    for (const hooks of hooksOf(witness)) {
      if (hooks.onAllyStruck) {
        effects.push(...hooks.onAllyStruck({ state, witness, attacker, defender, power }));
      }
    }
  }

  return effects;
}

/**
 * The **applier's** passives, after an effect it placed has landed on somebody
 * else.
 *
 * Called with the instance **as it landed** — after `shapeOutgoing` and
 * `shapeIncoming` — so `Word Travels` copies what the ally actually received
 * rather than what was cast at them.
 */
export function onApplied(ctx: ApplyContext): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(ctx.applier)) {
    if (hooks.onApplied) effects.push(...hooks.onApplied(ctx));
  }
  return effects;
}

/** The hero's own passives, at the top of its Upkeep and before it acts. */
export function onUpkeep(state: BattleState, hero: HeroState): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(hero)) {
    if (hooks.onUpkeep) effects.push(...hooks.onUpkeep({ state, hero }));
  }
  return effects;
}

/**
 * The hero's own passives at the end of its turn, **after durations have ticked**.
 *
 * The ordering is the whole of `Out of Reach`: a one-turn grant written before
 * the tick would be removed by the same Resolution that created it.
 */
export function onAct(state: BattleState, hero: HeroState): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];
  for (const hooks of hooksOf(hero)) {
    if (hooks.onAct) effects.push(...hooks.onAct({ state, hero }));
  }
  return effects;
}

/**
 * Everyone who feeds on a death, in board order.
 *
 * **Both sides.** `The Veil Closes` does not ask whose champion fell — Dark's
 * signature is endings, not allegiance — and a rule that checked would make a
 * Dark hero's own squad safer to stand near, which is backwards.
 *
 * The fallen hero is read from the state **before** it left the board, so its row
 * is still known; reach is measured from the witness, using the same `inReach`
 * every other rule uses.
 */
export function onDeath(state: BattleState, fallen: HeroState): readonly PassiveEffect[] {
  const effects: PassiveEffect[] = [];

  for (const witness of state.heroes) {
    if (witness.hp <= 0 || witness.instanceId === fallen.instanceId) continue;

    const ctx = { state, witness, fallen };
    const nearby = inReach(state, witness.instanceId, fallen.row);

    for (const hooks of hooksOf(witness)) {
      /**
       * **Board-wide first, then reach-gated.** `The Ledger Kept` counts a
       * squadmate Corvane could not have reached — that is the reading of the
       * name — while `The Veil Closes` feeds only on an ending it stood beside.
       */
      if (hooks.onAnyDeath) effects.push(...hooks.onAnyDeath(ctx));
      if (nearby && hooks.onDeathNearby) effects.push(...hooks.onDeathNearby(ctx));
    }
  }

  return effects;
}
