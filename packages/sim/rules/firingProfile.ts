/**
 * Which powers a ranking actually lets fire.
 *
 * **This is the deepest lever in the game and the easiest to pull by accident.**
 * A power fires only when everything ranked above it is on cooldown, and the
 * tier-0 auto-attack has cooldown 0 and no gate — it is available *every* turn.
 * So anything ranked below tier 0 never fires at all. A player who drags their
 * ultimate to the bottom of the list has switched it off, and without this
 * computation nothing in the game would tell them.
 *
 * ### Why it lives in `rules` and not `ai`
 *
 * A firing profile is not a choice. It is arithmetic over the cooldown ladder —
 * a pure function of `(hero, ranking, turns)` with no randomness and no server
 * state. The squad builder (feature 006 FR-018) needs it on every drag of a
 * ranking widget; putting it behind the server-only `ai` boundary would buy an
 * endpoint and a round trip for a calculation the client can do itself.
 *
 * ### Why it simulates
 *
 * The naive `1 / (cooldown + 1)` availability is exact for the top-ranked power
 * and **badly wrong below it** — for Bramwen under greedy it claims tier 1 fires
 * 50% of turns where it fires 18.3%, and tier 0 100% where it fires 3.3%. A
 * power's share is not its availability; it is its availability *in the gaps
 * everything above it leaves*, and only rank 1 is unconstrained. See research.md
 * Q2. `rankOneFiringCount` is the exact form for the one rank it covers, and it
 * exists as the **test** for this simulation rather than as a faster path.
 */

import { getHero, type Hero, type Power } from '@lmntlz/content';
import { isPowerAvailable, tickCooldowns } from './phases.js';

/** Highest priority first. Six tier indices, each exactly once. */
export type PowerRanking = readonly [number, number, number, number, number, number];

export interface FiringProfileEntry {
  readonly tier: number;
  readonly powerId: string;
  /**
   * Times it fires across the horizon. **Zero means the ranking has silently
   * switched this power off** — the case feature 006's FR-018 exists to surface.
   */
  readonly fires: number;
  /** `fires / turns`. */
  readonly share: number;
}

/**
 * The horizon a player actually experiences.
 *
 * **Measured, not derived — and the figure it used to be derived from was
 * wrong.** This was 9, reasoning that a 6v6 ran about 102 hero-turns across 12
 * heroes so a hero took roughly 8.5 of them. No battle ever ran 102 hero-turns:
 * at the old `HP_PER_TOUGHNESS = 50` the median was **299**, and a hero took
 * about 25.
 *
 * Since the pacing pass (engine `e0.2.0`) the median battle is **49 hero-turns**.
 * Across 600 auto-played battles a hero acts:
 *
 * | | p25 | median | mean | p75 | p90 | max |
 * |---|---|---|---|---|---|---|
 * | any hero | 2 | 4 | 4.4 | 6 | 8 | 20 |
 * | **a hero that survives** | 5 | **6** | 6.7 | 8 | 10 | 20 |
 *
 * **Six, from the survivor row, because that is who a ranking is for.** A hero
 * cut down on turn two fired its top-ranked power once and the rest of the
 * ordering never mattered; averaging it in would measure how often heroes die,
 * not how long a ranking gets to breathe.
 *
 * The rounding is down from 6.7 rather than up, and deliberately: the error this
 * constant must avoid is **false reassurance**. A horizon that is too long tells
 * a player a power fires when in their battles it never will — the exact failure
 * the 60-turn figure in `07-defense-ai.md` produces. Too short merely
 * over-warns, and an over-warning is one a player can see and dismiss.
 */
export const BATTLE_TURNS = 6;

/**
 * The horizon the recorded characterisation used, kept **only** for continuity
 * with `07-defense-ai.md` and the safe-set derivation. Never show it to a player.
 */
export const SWEEP_TURNS = 60;

/**
 * The cooldown rule, stated once so every consumer uses the same one (T015).
 *
 * A power fired on turn `t` with cooldown `c` is next available on `t + c + 1`.
 * Cooldown 0 therefore means every turn, with no special case.
 *
 * It falls out of the charge below plus the unconditional Resolution tick, and
 * is written here as well because the *consequence* is what people reason with
 * and the charge is what the code stores.
 */
export function nextAvailableTurn(firedOnTurn: number, cooldown: number): number {
  return firedOnTurn + cooldown + 1;
}

/**
 * What goes into the cooldown record the instant a power fires: `cooldown + 1`.
 *
 * The `+ 1` is not a fudge. **Cooldowns tick in Resolution unconditionally**,
 * including on the very turn the power fired and including for a hero that lost
 * its turn to crowd control (FR-024, FR-025) — so the charge has to absorb that
 * first tick. Storing `cooldown` instead would make every power available one
 * turn early, which is exactly the off-by-one the 19,440-case oracle catches.
 */
export function chargeAfterFiring(cooldown: number): number {
  return cooldown + 1;
}

/**
 * The rank-1 closed form. **Exact**, and verified against the simulation on all
 * 27 heroes × 720 orderings at three horizons.
 *
 * Exists as the **test** for `firingProfile`, not as a faster path — see the
 * module note. A rank-1 power is unconstrained, so it fires on its gate turn and
 * every `cooldown + 1` turns thereafter.
 *
 * **The floor at zero is load-bearing**, not defensive: with a gate past the
 * horizon the raw expression goes negative rather than to zero (cooldown 0, gate
 * 5, 1 turn gives −3), and a negative firing count would sail through any
 * comparison that only asked whether a power was live.
 */
export function rankOneFiringCount(cooldown: number, gateTurn: number, turns: number): number {
  if (turns < gateTurn) return 0;
  return Math.floor((turns - gateTurn) / (cooldown + 1)) + 1;
}

export class InvalidRankingError extends Error {
  constructor(ranking: readonly number[]) {
    super(
      `a ranking must be a permutation of tiers 0–5, each exactly once — got ` +
        `[${ranking.join(', ')}]`,
    );
    this.name = 'InvalidRankingError';
  }
}

function assertRanking(ranking: PowerRanking): void {
  const seen = new Set(ranking);
  if (seen.size !== 6 || [...seen].some((t) => !Number.isInteger(t) || t < 0 || t > 5)) {
    throw new InvalidRankingError(ranking);
  }
}

function powerOfTier(hero: Hero, tier: number): Power {
  const found = hero.powers.find((p) => p.tier === tier);
  if (!found) throw new Error(`hero "${hero.id}" has no tier-${tier} power`);
  return found;
}

/**
 * Simulate the ranking and report what fires.
 *
 * The loop is the engine's turn in miniature: on each turn, walk the ranking
 * highest priority first, take the first power that is **off cooldown and past
 * its gate**, charge it, then tick every cooldown in Resolution. Availability
 * and the tick both come from `phases.ts` — the same two functions the engine
 * itself calls — which is how SC-003's agreement requirement is met by
 * construction rather than by two implementations staying in step.
 *
 * Entries come back **in ranking order**, so a builder rendering the list top to
 * bottom is rendering the priority the player set.
 *
 * @param turns Horizon. Defaults to {@link BATTLE_TURNS} — nine, a real battle.
 *              The characterisation sweep passes {@link SWEEP_TURNS} for
 *              continuity with the recorded analysis and reports both.
 */
export function firingProfile(
  hero: Hero,
  ranking: PowerRanking,
  turns: number = BATTLE_TURNS,
): readonly FiringProfileEntry[] {
  assertRanking(ranking);
  if (!Number.isInteger(turns) || turns < 1) {
    throw new RangeError(`a firing profile needs a horizon of at least one turn — got ${turns}`);
  }

  const powers = ranking.map((tier) => powerOfTier(hero, tier));
  const fired = new Map<string, number>(powers.map((p) => [p.id, 0]));
  let cooldowns: Readonly<Record<string, number>> = {};

  for (let turn = 1; turn <= turns; turn++) {
    // Highest priority first, and the FIRST available one wins. There is no
    // scoring here and there must not be: the ranking is the defender's lever.
    const chosen = powers.find((power) => isPowerAvailable(power, cooldowns, turn));

    if (chosen) {
      fired.set(chosen.id, (fired.get(chosen.id) ?? 0) + 1);
      cooldowns = Object.freeze({ ...cooldowns, [chosen.id]: chargeAfterFiring(chosen.cooldown) });
    }

    cooldowns = tickCooldowns(cooldowns);
  }

  return Object.freeze(
    powers.map((power) => {
      const fires = fired.get(power.id) ?? 0;
      return Object.freeze({
        tier: power.tier,
        powerId: power.id,
        fires,
        share: fires / turns,
      });
    }),
  );
}

/**
 * The bar `07-defense-ai.md` measures "still firing" against: at least 1% of
 * turns. At the 60-turn sweep horizon that is a single firing.
 */
export const LIVE_SHARE_THRESHOLD = 0.01;

/**
 * Is this ranking safe for this hero at this horizon?
 *
 * **Powers the squad builder's warning, so pass the horizon the player
 * experiences** — the default nine, not the sweep's sixty.
 *
 * `tiersChecked` exists because the honest safety property is about **tiers 1–5,
 * not 0–5**. At nine turns *no* ordering keeps all six live, because tier 0 is
 * structurally last and a real battle is too short for the top five to be
 * simultaneously on cooldown. Tier 0 is the fallback; its job is to cover a gap
 * a short battle rarely produces, and counting its silence as a fault would make
 * every ranking in the game unsafe (research.md Finding 3).
 */
export function isSafeOrdering(
  hero: Hero,
  ranking: PowerRanking,
  turns: number = BATTLE_TURNS,
  tiersChecked: readonly number[] = [1, 2, 3, 4, 5],
): boolean {
  const profile = firingProfile(hero, ranking, turns);

  return tiersChecked.every((tier) => {
    const entry = profile.find((e) => e.tier === tier);
    return entry !== undefined && entry.share >= LIVE_SHARE_THRESHOLD;
  });
}

/** `isSafeOrdering` by hero id, for callers holding an id rather than a `Hero`. */
export function isSafeOrderingFor(
  heroId: string,
  ranking: PowerRanking,
  turns?: number,
  tiersChecked?: readonly number[],
): boolean {
  return isSafeOrdering(getHero(heroId), ranking, turns, tiersChecked);
}
