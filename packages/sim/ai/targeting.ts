/**
 * Which champion gets hit. **This module sorts. It never filters.**
 *
 * `candidates` arrives already filtered by feature 002's stages 1–3 — reach,
 * fade-style restrictions, and compulsion. That signature choice is what makes
 * FR-009 unbreakable rather than merely intended: **there is no parameter here
 * that could remove a candidate**, so the function is structurally incapable of
 * returning "no target" when one was passed in. A priority ranking the only
 * available champion last still takes it.
 *
 * ### The five-step tiebreak, and where the rules/resolver seam falls
 *
 * ```
 *   1  primary rule        defender    rules
 *   2  fallback rule       defender    rules
 *   3  best type matchup   engine      rules
 *   4  nearest row         defender    rules   (indirectly, via placement)
 *   5  seeded random       engine      RESOLVER
 * ```
 *
 * Four of the five are pure, so the client can preview which champions are legal
 * and which one a configuration prefers — and cannot always predict which is
 * struck, because the last step is a draw it will never see.
 *
 * **A taunt beats a priority, always.** Compulsion is stage 3 of feature 002's
 * pipeline and resolves before this is called at all, so there is no rule here
 * that could outrank it and none that needs to know it exists.
 *
 * ### Narrowing, not sorting-then-taking-the-head
 *
 * Each stage scores the survivors and keeps everything **tied at the best**.
 * A stage that cannot discriminate — *"Buffers first"* with no Buffer among the
 * candidates, which is four turns in five — keeps all of them and costs nothing.
 * That is why the menu carries a *pair*: a single role rule leaves the target
 * undefined 49–80% of the time, so **the fallback is the rule that usually
 * fires**.
 */

import { getHero, powerEffectiveness, type Hero, type Power } from '@lmntlz/content';
import { distance, effectiveStat, heroStateOf, resistedBy, type BattleState, type HeroState, type Row } from '../rules/index.js';
import { drawInt } from '../resolver/rng.js';
import type { Seed } from '../resolver/seed.js';
import type { SquadMemberConfig, TargetRule } from './types.js';

export interface TargetChoice {
  readonly targetInstanceId: string;
  /** **Zero when the earlier stages left exactly one candidate.** A draw is only
   *  consumed when it decided something, which is what keeps the draw index a
   *  faithful record of what the engine actually did. */
  readonly drawsConsumed: bigint;
}

/**
 * Higher is better, always — a rule that wants the *lowest* something returns
 * its negation, so every stage compares the same direction and no rule can be
 * accidentally inverted by a caller.
 */
type Score = (candidate: HeroState, hero: Hero) => number;

const ROLE_RULES: Readonly<Record<string, string>> = Object.freeze({
  'strikers-first': 'striker',
  'tanks-first': 'tank',
  'ranged-first': 'ranged',
  'buffers-first': 'buffer',
});

interface Context {
  readonly state: BattleState;
  readonly actor: HeroState;
  readonly power: Power;
  /** The reachable rows on the target's side, nearest first. **Derived on every
   *  evaluation** (FR-020) — see `reachableRowsAmong`. */
  readonly rowsByDistance: readonly Row[];
}

/**
 * The reachable-row window, **computed from `distance()` every time** (FR-020).
 *
 * There is no constant `2` in this module and no array sized to two rows.
 * `02-squads.md` derives a two-entry distance menu from "at base reach a
 * champion sees at most two enemy rows", and the Air rune `Further Than It
 * Looks` grants +1 reach for a turn, which puts a reach-2 front seat in range of
 * three. An implementation that wrote `Math.min(reach + mod, 2)` would look
 * defensive and quietly delete the rune.
 *
 * Derived from the *candidates* rather than from the board, because a row whose
 * occupants were all removed by a filter is not a row this decision can use.
 */
function reachableRowsAmong(state: BattleState, actor: HeroState, candidates: readonly HeroState[]): readonly Row[] {
  const rows = [...new Set(candidates.map((c) => c.row))];
  return rows.sort((a, b) => distance(state, actor.row, a) - distance(state, actor.row, b) || a - b);
}

function scorerFor(rule: TargetRule, context: Context): Score {
  const { state, actor, power, rowsByDistance } = context;

  switch (rule) {
    // --- by role ----------------------------------------------------------
    // Scores 1 or 0, so a rule finding nobody of its role keeps every candidate
    // and costs nothing. That is the 49–80%-undefined case, handled by falling
    // through to the next stage rather than by a special branch.
    case 'strikers-first':
    case 'tanks-first':
    case 'ranged-first':
    case 'buffers-first': {
      const wanted = ROLE_RULES[rule];
      return (_c, hero) => (hero.role === wanted ? 1 : 0);
    }

    // --- by state ---------------------------------------------------------
    case 'lowest-current-hp':
      return (c) => -c.hp;
    case 'highest-current-hp':
      return (c) => c.hp;
    case 'lowest-hp-percentage':
      // NOT the same question as lowest current HP, and confusing them is a
      // live trap: pools run 1,250–2,000, so a Tank at 65% holds more current
      // HP than an untouched Buffer.
      return (c) => -(c.hp / c.maxHp);
    case 'most-damaged':
      return (c) => c.maxHp - c.hp;
    case 'highest-might':
      return (c, hero) => effectiveStat(c, hero.stats, 'might');
    case 'least-mitigation':
      return (c, hero) => -wallAgainst(power, c, hero);
    case 'most-mitigation':
      return (c, hero) => wallAgainst(power, c, hero);

    // --- by distance ------------------------------------------------------
    case 'nearest':
      return (c) => -distance(state, actor.row, c.row);
    case 'furthest':
      return (c) => distance(state, actor.row, c.row);
    case 'middle':
      return middleScorer(state, actor, rowsByDistance);

    // --- the optimizer ----------------------------------------------------
    case 'best-type-matchup':
      return (_c, hero) => powerEffectiveness(power, hero);
  }
}

/**
 * The wall this power actually answers — the same selection `damagePreview`
 * makes, so *"least mitigation"* means least of the thing that will be
 * subtracted rather than least of a stat the power ignores.
 *
 * A mixed martial/arcane power finds the defender's **weaker** wall, which is
 * the defender's misfortune rather than their choice.
 */
function wallAgainst(power: Power, candidate: HeroState, hero: Hero): number {
  const armor = effectiveStat(candidate, hero.stats, 'armor');
  const magicResist = effectiveStat(candidate, hero.stats, 'magicResist');

  switch (resistedBy(power)) {
    case 'armor':
      return armor;
    case 'magicResist':
      return magicResist;
    case 'mixed':
      return Math.min(armor, magicResist);
  }
}

/**
 * *Middle* — get **past the front line**, and degrade to **furthest** rather
 * than nearest when the window is too narrow (FR-021).
 *
 * Dropping a champion that asked for *middle* onto the front row would invert
 * the instruction rather than approximate it. Degrading outward keeps the
 * intent: the defender wanted depth, and when only two rows are reachable the
 * deeper one is the closest thing to what they asked for.
 *
 * With three or more rows the pick is `floor(n / 2)` — index 1 of `[4, 5, 6]`,
 * which is row 5 — and it leans **far** on any wider window, for the same
 * reason.
 */
function middleScorer(state: BattleState, actor: HeroState, rowsByDistance: readonly Row[]): Score {
  const wanted =
    rowsByDistance.length < 3
      ? rowsByDistance.at(-1)
      : rowsByDistance[Math.floor(rowsByDistance.length / 2)];

  return (c) => (c.row === wanted ? 1 : 0) - distance(state, actor.row, c.row) / 100;
}

/** Keep everything tied at the best score. Never empties a non-empty set. */
function narrow(pool: readonly HeroState[], score: Score): readonly HeroState[] {
  if (pool.length <= 1) return pool;

  let best = -Infinity;
  const scored = pool.map((c) => {
    const value = score(c, getHero(c.heroId));
    if (value > best) best = value;
    return { candidate: c, value };
  });

  return scored.filter((s) => s.value === best).map((s) => s.candidate);
}

/**
 * Sort the candidates and name one.
 *
 * ### A deviation from `contracts/defense-ai.d.ts`, and why
 *
 * The contract omits `powerId`. It cannot: tiebreak 3 is *best type matchup* and
 * `least-mitigation` asks which wall answers — both are questions about the
 * power, and the contract's own text says power preference resolves first
 * precisely so the answer is available. The parameter is added rather than the
 * rule dropped.
 */
export function chooseTarget(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  powerId: string,
  config: SquadMemberConfig,
  candidates: readonly string[],
): TargetChoice {
  return decideAmong(state, seed, drawIndex, actorInstanceId, powerId, candidates, [
    config.targeting[0],
    config.targeting[1],
    'best-type-matchup',
    'nearest',
  ]);
}

/**
 * The shared engine behind `chooseTarget` and `chooseAlly`, taking its stages as
 * a list so the ally path can run a **different, shorter** one.
 */
export function decideAmong(
  state: BattleState,
  seed: Seed,
  drawIndex: bigint,
  actorInstanceId: string,
  powerId: string,
  candidates: readonly string[],
  stages: readonly TargetRule[],
): TargetChoice {
  if (candidates.length === 0) {
    throw new Error(
      `chooseTarget was handed an empty candidate set for "${actorInstanceId}". ` +
        `Stages 1–3 decide who is legal; this function only sorts, so an empty ` +
        `set here means the caller skipped feature 002's targeting pipeline.`,
    );
  }

  const actor = heroStateOf(state, actorInstanceId);
  const power = getHero(actor.heroId).powers.find((p) => p.id === powerId);
  if (!power) throw new Error(`hero "${actor.heroId}" has no power "${powerId}"`);

  // Sorted, so the survivor set is a deterministic function of the state and
  // never of the order the caller happened to build its array in.
  let pool = [...candidates]
    .sort()
    .map((id) => heroStateOf(state, id));

  const context: Context = {
    state,
    actor,
    power,
    rowsByDistance: reachableRowsAmong(state, actor, pool),
  };

  for (const rule of stages) {
    if (pool.length === 1) break;
    pool = [...narrow(pool, scorerFor(rule, context))];
  }

  if (pool.length === 1) {
    return { targetInstanceId: pool[0]!.instanceId, drawsConsumed: 0n };
  }

  // ---------------------------------------------------------------------
  // Stage 5 — the only randomness in a defense, and it comes from the
  // resolver's seeded generator (FR-017, T023).
  //
  // **Never a local random source.** `Math.random()` here would make a defense
  // unreplayable: the same battle re-derived from its action log would choose a
  // different champion, and the past would change underneath the player.
  // ---------------------------------------------------------------------
  // `drawInt` is rejection-sampled and returns `[1, n]`, so it consumes a
  // *variable* number of indices — which is why `drawsConsumed` is reported
  // rather than assumed to be one.
  const roll = drawInt(seed, drawIndex, pool.length);
  return { targetInstanceId: pool[roll.value - 1]!.instanceId, drawsConsumed: roll.consumed };
}
