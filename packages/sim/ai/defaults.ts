/**
 * What the engine plays when nobody has configured anything.
 *
 * **An unconfigured defense must be competent, not incoherent.** Most players
 * will never open these controls, and a squad that flails is a squad whose owner
 * loses holds they would have kept and never learns why. Randomness is a tiebreak
 * of last resort here, never a default strategy.
 */

import type { Hero, Role } from '@lmntlz/content';
import type { PowerRanking } from '../rules/firingProfile.js';
import { needsAllyRule, type SquadMemberConfig, type TargetRule } from './types.js';

/**
 * The default ally rule, for every role (T028).
 *
 * `07-defense-ai.md` leaves the ally menu open beyond "short enough to read on a
 * squad-builder row", but names this one — and names the trap it avoids.
 * **Lowest HP percentage and lowest current HP are not the same question.**
 * `HP = Toughness × 50` over a 25–40 `Toughness` range puts maximum pools at
 * 1,250–2,000, so a Tank at 1,300 of 2,000 — 65%, and in real trouble — holds
 * *more* current HP than an untouched Buffer at 1,250 of 1,250. A "lowest
 * current HP" heal would pass over the wounded Tank to top up a Buffer at full
 * health. Percentage is the only entry that means "whoever is most hurt", which
 * is what a player assumes a healer does.
 */
export const DEFAULT_ALLY_RULE: TargetRule = 'lowest-hp-percentage';

/**
 * The 12 universally safe orderings, **as measured** by
 * `tools/characterize-orderings.ts` — 720 orderings × 27 heroes × 60 turns,
 * counting a power live at ≥1% of turns.
 *
 * ### The structural rule, corrected
 *
 * **All 12 end in tier 0**, and that is *provable* rather than measured: a power
 * fires only when everything ranked above it is on cooldown, and the tier-0
 * auto-attack has cooldown 0 and no gate, so it is never on cooldown, so nothing
 * below it ever fires.
 *
 * `07-defense-ai.md` states the rule as *"every one of them ends `1·0`"*. **Eleven
 * do.** The twelfth is `4·3·2·1·5·0`, which ends `5·0` — and it is that same
 * document's published Tank default, described three paragraphs later as "the
 * only safe ordering that trades the ultimate for uptime". The `1·0` pattern is a
 * strong empirical regularity, not a rule, and ending in tier 0 is necessary but
 * **not sufficient**: 120 of 720 orderings end in tier 0 and only 12 are safe.
 *
 * ### The standing instruction
 *
 * **Re-run the sweep before the hero-numbers pass locks.** A one-point
 * *reduction* in the tier-4/5 cooldown ladder takes this set from 12 to **zero**
 * (research.md Finding 2). Re-pick every default from whatever the sweep returns;
 * do not assume the four below survived.
 */
export const SAFE_ORDERINGS: readonly PowerRanking[] = Object.freeze([
  [3, 4, 2, 5, 1, 0],
  [3, 4, 5, 2, 1, 0],
  [3, 5, 4, 2, 1, 0],
  [4, 3, 2, 1, 5, 0],
  [4, 3, 2, 5, 1, 0],
  [4, 3, 5, 2, 1, 0],
  [4, 5, 2, 3, 1, 0],
  [4, 5, 3, 2, 1, 0],
  [5, 2, 3, 4, 1, 0],
  [5, 2, 4, 3, 1, 0],
  [5, 4, 2, 3, 1, 0],
  [5, 4, 3, 2, 1, 0],
] as const);

export function safeOrderings(): readonly PowerRanking[] {
  return SAFE_ORDERINGS;
}

/**
 * Role → ranking. **The safety is measured; the assignment is a proposal**
 * (Constitution XX).
 *
 * The sweep can prove a power *fires*. It cannot prove firing it was worth doing
 * — that needs the powers' **effects** read rather than their cooldowns
 * simulated, and it belongs with the hero-numbers pass. The Buffer assignment in
 * particular assumes its mid tiers carry the sustain, which is an assumption
 * about what those powers *do*.
 *
 * All four are drawn from {@link SAFE_ORDERINGS}, so **no default can silently
 * switch a power off** — which is the property that actually has to hold.
 *
 * One caveat worth carrying: `4·3·2·1·5·0` is safe at 60 turns and loses tier 5
 * at nine on the fast `0·1·2·3·4·6` ladder. That ladder belongs to the three
 * Buffers and Silka Pinquick, **none of whom receive the Tank ordering**, so the
 * assignment holds — but it holds *because of who gets it*, not universally, and
 * a future reassignment must re-check rather than inherit.
 */
export const ROLE_DEFAULTS: Readonly<Record<Role, SquadMemberConfig>> = Object.freeze({
  /**
   * `Finish It` pays bonus damage below half pool, so finish what is nearly
   * finished. Greedy ranking — and it is genuinely safe, not merely obvious.
   */
  striker: Object.freeze({
    targeting: ['lowest-current-hp', 'nearest'] as const,
    ranking: [5, 4, 3, 2, 1, 0] as const,
    allyRule: DEFAULT_ALLY_RULE,
  }),

  /**
   * `Hold the Line` is a row-scoped taunt, so a Tank should be picking a fight
   * with whoever hurts most. Trades the ultimate for uptime — tier 5 fifth, so
   * tiers 4–1 cycle underneath it.
   */
  tank: Object.freeze({
    targeting: ['highest-might', 'nearest'] as const,
    ranking: [4, 3, 2, 1, 5, 0] as const,
    allyRule: DEFAULT_ALLY_RULE,
  }),

  /**
   * `Measured Shot` pays bonus damage at **distance 2** — the one role built
   * around the far edge of its reach, and the reason the distance entries exist
   * on the menu at all.
   */
  ranged: Object.freeze({
    targeting: ['furthest', 'least-mitigation'] as const,
    ranking: [3, 5, 4, 2, 1, 0] as const,
    allyRule: DEFAULT_ALLY_RULE,
  }),

  /**
   * `Behind the Line` is a permanent fade — it survives to support, so it has no
   * targeting identity of its own and takes the Striker's. Mid tiers early, the
   * assumption being that they carry the sustain.
   */
  buffer: Object.freeze({
    targeting: ['lowest-current-hp', 'nearest'] as const,
    ranking: [4, 5, 2, 3, 1, 0] as const,
    allyRule: DEFAULT_ALLY_RULE,
  }),
});

/**
 * The configuration applied to a squad saved without touching a control
 * (FR-014, FR-015).
 *
 * Returns a frozen object, so a caller merging an explicit selection over it
 * (FR-016) has to build a new config rather than mutate the shared default into
 * something every future squad inherits.
 */
export function roleDefaults(role: Role): SquadMemberConfig {
  return ROLE_DEFAULTS[role];
}

/**
 * The default for a specific champion — the role default, **minus `allyRule`
 * when the champion owns no friendly power** (FR-004, T038).
 *
 * `roleDefaults` cannot do this: it is given a role and a role does not know
 * whether its champions heal. Carrying a meaningless `allyRule` would leave a
 * field on the config that looks like a decision somebody made and that nothing
 * will ever read.
 */
export function defaultConfigFor(hero: Hero): SquadMemberConfig {
  const base = ROLE_DEFAULTS[hero.role];
  if (needsAllyRule(hero)) return base;

  const { allyRule: _omitted, ...withoutAlly } = base;
  return Object.freeze(withoutAlly);
}
