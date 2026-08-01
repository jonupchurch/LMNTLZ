/**
 * The authored opponents **above** the starter league — Silver through Diamond.
 *
 * ### Why this file exists: four of the five leagues had nobody in them
 *
 * `starterBots.ts` composes twenty bots on a ramp from 6 to 19 complete runes. At
 * `COMPLETE_RUNE_SCORE = 125` that is a gear score of 750 to 2,375, and **every
 * one of them is Bronze** — `LEAGUE_BANDS` puts Silver's floor at 2,500. So:
 *
 * | league | band | authored bots, before this file |
 * |---|---|---|
 * | bronze | `[1500, 2500)` | 20 |
 * | silver | `[2500, 4000)` | **0** |
 * | gold | `[4000, 6200)` | **0** |
 * | platinum | `[6200, 8700)` | **0** |
 * | diamond | `[8700, 10125]` | **0** |
 *
 * A player who graduates Bronze meets whichever handful of real accounts happen to
 * share their band. `MIN_POOL` is 5, so below that `candidates()` **widens** — and
 * `config.ts` is explicit that widening breaks a promise the design published, the
 * gear bound going from 1.5× to 2.67×. Reported from play as *"I've been fighting
 * the same 2 over and over"*, which is what an under-populated band looks like from
 * the inside. It is also why two matchmaking tests assert `widened === false` and
 * get `true`: they are reading a real hole, not a flaky database.
 *
 * ### Progressively harder, on two levers, and both are additive
 *
 * Constitution XIV makes a nerf a last resort and names **curated bot defenders**
 * as the additive lever that moves the meta without touching a number. So
 * difficulty here is composed, never buffed — no bot has a stat the player cannot
 * have.
 *
 * 1. **Gear.** Runes climb 20 → 81 across the four bands — a **4× spread**, and
 *    the dominant lever by a wide margin. It is also what places each bot in its
 *    league, so difficulty and band cannot disagree.
 * 2. **Coverage.** `bestAnswerCoverage` is how many of a squad's six the single
 *    best type beats. Silver holds the starter ramp's stage-3 standard (≤ 4 of 6,
 *    *"there is a best answer and it is punished"*); Gold and above tighten to 3.
 *
 * ### ⚠️ Coverage cannot go below 3, and that is arithmetic rather than tuning
 *
 * `DOMINANT_SEATS = 3`: three of the six always carry the lead theme, so
 * `counter(lead)` is super-effective against three of them **by construction**. A
 * ceiling of 2 is therefore unreachable, and asking for it does not fail — `select`
 * simply returns the best it can, which is 3. This file asked for 2 across all of
 * Diamond in its first draft and got squads indistinguishable from Gold's.
 *
 * The consequence is worth stating plainly: **above Gold, composition has nothing
 * left to give.** Gear carries the rest of the ramp, and the next real lever is the
 * one `seedBots.ts` already names — per-bot targeting and power ranking, which
 * makes a squad better *played* rather than better *equipped*. All 44 bots
 * currently run role defaults.
 *
 * **The curve is measured, not asserted** — `tools/print-bot-ramp.ts` prints gear,
 * coverage and squad uniqueness for every rung, and it is what caught the ceiling
 * being unreachable, plus two squads that had come out identical to other squads.
 * A difficulty claim nobody computed is how a "ramp" ends up flat in the middle.
 *
 * ### The Hidden squad is still one step harder than the fight that earned it
 *
 * Same rule as the starter ramp (T046): Hidden borrows the *next* rung's themes,
 * so an ambush is always the fight above. The top rung of Diamond has no next, so
 * it inverts to the starter league's trap shape — champions who resist exactly what
 * the Visible squad invited.
 */

import { type DamageType } from '@lmntlz/content';
import type { BotBand } from '../db/schema/accounts.js';
import { COMPLETE_RUNE_SCORE } from './league.js';
import {
  composeSquad,
  invitedAnswer,
  select,
  type BotSeat,
  type StarterBot,
} from './starterBots.js';

/**
 * One authored opponent above the starter league.
 *
 * `runes` is complete runes' worth of gear and **decides the band by arithmetic** —
 * `runes × COMPLETE_RUNE_SCORE` is the gear score `leagueOf` reads. The `band` field
 * is therefore a claim that gets checked rather than a second source of truth; the
 * test asserts they agree.
 */
interface LeagueRung {
  readonly name: string;
  readonly band: Exclude<BotBand, 'starter' | 'bronze'>;
  readonly runes: number;
  /** The most of six that any single type may beat. Lower is harder. */
  readonly ceiling: number;
  readonly themes: readonly [DamageType, DamageType, DamageType];
}

/**
 * Six per band, which is one clear of `MIN_POOL = 5`.
 *
 * **Six rather than five**, deliberately: a band sitting exactly at the floor
 * widens the moment one bot is removed or one is the player themselves, and the
 * whole point of this file is that a band should never be at the floor.
 *
 * Rune counts are spread across each band rather than bunched, so a player near a
 * band's ceiling still meets somebody above them and a player at the floor still
 * meets somebody they can beat.
 *
 * ### The themes are chosen for spread, not flavour
 *
 * Every rung leads with a different type from the one before it where the roster
 * allows, so consecutive opponents do not want the same answer. `fire` never leads
 * a squad that must be exactly-composed for the same reason the starter ramp keeps
 * it off stage 1 — it has only six carriers in the whole roster, and an exact
 * six-seat squad on fire has exactly one solution.
 */
const LEAGUE_RAMP: readonly LeagueRung[] = Object.freeze([
  /* --- Silver · the starter lesson, with gear behind it -- coverage 4 -------- */
  { name: 'The Weighed Coast', band: 'silver', runes: 20, ceiling: 4, themes: ['water', 'earth', 'pierce'] },
  { name: 'The Hollow Crown', band: 'silver', runes: 22, ceiling: 4, themes: ['dark', 'air', 'crush'] },
  { name: 'The Kept Flame', band: 'silver', runes: 24, ceiling: 4, themes: ['fire', 'light', 'slash'] },
  { name: 'The Riven Path', band: 'silver', runes: 26, ceiling: 4, themes: ['earth', 'dark', 'pierce'] },
  { name: 'The Open Hand', band: 'silver', runes: 28, ceiling: 4, themes: ['light', 'water', 'crush'] },
  { name: 'The Turning Year', band: 'silver', runes: 30, ceiling: 4, themes: ['air', 'fire', 'slash'] },

  /* --- Gold · no answer beats more than half -- coverage 3 ------------------- */
  { name: 'The Sealed Accord', band: 'gold', runes: 32, ceiling: 3, themes: ['water', 'light', 'crush'] },
  { name: 'The Iron Liturgy', band: 'gold', runes: 35, ceiling: 3, themes: ['earth', 'air', 'slash'] },
  { name: 'The Cold Assembly', band: 'gold', runes: 38, ceiling: 3, themes: ['dark', 'water', 'pierce'] },
  { name: 'The Bright Refusal', band: 'gold', runes: 41, ceiling: 3, themes: ['light', 'fire', 'crush'] },
  { name: 'The Undertow', band: 'gold', runes: 44, ceiling: 3, themes: ['air', 'earth', 'pierce'] },
  { name: 'The Last Argument', band: 'gold', runes: 47, ceiling: 3, themes: ['fire', 'dark', 'slash'] },

  /* --- Platinum · the same wall, fully geared -- coverage 3 ------------------ */
  { name: 'The Standing Vigil', band: 'platinum', runes: 50, ceiling: 3, themes: ['light', 'earth', 'pierce'] },
  { name: 'The Drawn Line', band: 'platinum', runes: 54, ceiling: 3, themes: ['water', 'air', 'slash'] },
  { name: 'The Silent Verdict', band: 'platinum', runes: 58, ceiling: 3, themes: ['dark', 'light', 'crush'] },
  { name: 'The Unbroken Ring', band: 'platinum', runes: 62, ceiling: 3, themes: ['earth', 'water', 'slash'] },
  { name: 'The Far Watch', band: 'platinum', runes: 65, ceiling: 3, themes: ['air', 'dark', 'crush'] },
  { name: 'The Closing Argument', band: 'platinum', runes: 68, ceiling: 3, themes: ['fire', 'water', 'pierce'] },

  /* --- Diamond · there is no best answer -- coverage 2 where composable ------ */
  { name: 'The Ninefold Court', band: 'diamond', runes: 70, ceiling: 3, themes: ['light', 'dark', 'slash'] },
  { name: 'The Whole Spectrum', band: 'diamond', runes: 73, ceiling: 3, themes: ['earth', 'air', 'crush'] },
  /**
   * ⚠️ Was `The Answered Question`, which yields `Answered_Question` — **17
   * characters against `validateUsername`'s cap of 16.** Caught by the seeder's own
   * guard mid-run, after twenty bots had already been written. A squad name is not
   * a username, and the derivation between them is exactly where that gets
   * forgotten; `leagueBots.test.ts` now checks all 24 up front.
   */
  { name: 'The Only Answer', band: 'diamond', runes: 75, ceiling: 3, themes: ['water', 'fire', 'pierce'] },
  { name: 'The Long Silence', band: 'diamond', runes: 77, ceiling: 3, themes: ['dark', 'earth', 'slash'] },
  { name: 'The Final Reading', band: 'diamond', runes: 79, ceiling: 3, themes: ['light', 'air', 'pierce'] },
  /**
   * ⚠️ **The themes here are constrained by the rung being LAST.** With no next
   * rung, its Hidden squad is the trap — composed from champions not punished by
   * the type this squad invites — and a trap draws from a much narrower pool than
   * an ordinary themed squad. On `['fire','water','crush']` that pool produced a
   * squad **identical to starter bot 4's Visible six**, so the hardest ambush in
   * the game was a re-run of the fourth fight a new player ever takes.
   *
   * Caught by printing every squad and comparing the sets, not by a test.
   */
  { name: 'The Shut Gate', band: 'diamond', runes: 81, ceiling: 3, themes: ['dark', 'water', 'crush'] },
]);

/** `The Weighed Coast` → `Weighed_Coast`, matching the starter ramp's convention. */
const accountName = (name: string): string => name.replace(/^The /, '').replace(/\s+/g, '_');

/**
 * The Hidden squad's themes: the next rung's, or — at the very top — the trap.
 *
 * Identical in shape to the starter ramp's rule, and it has to be: an ambush that
 * was *easier* than the fight that earned it would invert the whole point of the
 * ambush tax, which pays more precisely because it is harder.
 */
function hiddenThemesFor(
  rung: LeagueRung,
  next: LeagueRung | undefined,
): readonly [DamageType, ...DamageType[]] {
  if (!next) return [invitedAnswer(rung.themes)];
  return next.themes;
}

/**
 * The twenty-four, composed.
 *
 * Shares `StarterBot`'s shape so `seedBots.ts` can write either without a second
 * writer — the only field that differs in meaning is `position`, which continues
 * the starter ramp's numbering rather than restarting, because the two ramps are
 * one continuous difficulty curve and a reader asking "how hard is bot 31" should
 * not have to know which file it came from.
 */
export interface LeagueBot extends StarterBot {
  readonly band: Exclude<BotBand, 'starter' | 'bronze'>;
}

export const LEAGUE_BOTS: readonly LeagueBot[] = Object.freeze(
  LEAGUE_RAMP.map((rung, i) => {
    const themes = hiddenThemesFor(rung, LEAGUE_RAMP[i + 1]);

    /**
     * **Visible first, then Hidden from what is left.** The two zones cannot share
     * a champion — `PUT /v1/squads/defense/:zone` answers `409` — so one of them
     * must yield, and it is Hidden: its themes are the *next* rung's, drawn from a
     * pool this rung has not constrained, so it absorbs the exclusion more easily.
     *
     * Neither is `exact`. An exact squad must fail rather than pad, which is right
     * for the starter ramp's stage-1 promise (*one type beats all six*) — these
     * make no such promise, and a tight coverage ceiling on a 21-champion residual
     * pool is exactly where an exact composition starves.
     */
    const seat = (of: readonly [DamageType, ...DamageType[]], zone: string, taken: readonly BotSeat[]) =>
      composeSquad(
        select(of, new Set(taken.map((s) => s.heroId)), false, rung.ceiling, `${rung.name}/${zone}`),
        `${rung.name} (${zone})`,
      );

    const visible = seat(rung.themes, 'visible', []);
    const hidden = seat(themes, 'hidden', visible);

    return Object.freeze({
      /* Continues the starter ramp: bot 21 is the first Silver opponent. */
      position: 20 + i + 1,
      name: rung.name,
      username: accountName(rung.name),
      /* The starter ramp's teaching stages stop at 3; everything here is past them. */
      stage: 3 as const,
      band: rung.band,
      gearScore: rung.runes * COMPLETE_RUNE_SCORE,
      visible,
      hidden,
      dominant: rung.themes[0],
      invites: invitedAnswer(rung.themes),
    });
  }),
);
