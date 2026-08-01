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
  readonly band: Exclude<BotBand, 'starter'>;
  readonly runes: number;
  /** The most of six that any single type may beat. Lower is harder. */
  readonly ceiling: number;
  readonly themes: readonly [DamageType, DamageType, DamageType];
  /**
   * The generated rungs' index into the 252 theme combinations.
   *
   * Present only on generated rungs, and it exists so a composition collision can be
   * *resolved* rather than reported: the builder advances to the next support pair and
   * recomposes. Absent on the authored twenty-four, whose themes are chosen by hand and
   * must never be moved by an algorithm.
   */
  readonly walk?: number;
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
const AUTHORED_RAMP: readonly LeagueRung[] = Object.freeze([
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

/* ===========================================================================
 * The hundred (Jon, 2026-08-01)
 * ======================================================================== */

/**
 * **A hundred more opponents, twenty per band — and Bronze finally gets some.**
 *
 * > *"If we need to create more bots for now, let's make 100 new bots across all the
 * > leagues."*
 *
 * The immediate reason is the offered list going random: five drawn at random from a
 * pool of six is not a rotation, it is the same six shuffled. Variety is a property of
 * the **pool**, and the pool was 6 per band.
 *
 * ### Bronze had nothing at all, and that was a live defect
 *
 * The twenty starter bots are `band: 'starter'`, which the nursery clause excludes from
 * every ordinary pool — *"a player who returns after leaving would be farming a pool
 * built for beginners"* — and `AUTHORED_RAMP` starts at Silver. So **the league every
 * player lands in the moment they graduate had no authored defenders**, fell under
 * `MIN_POOL`, and widened, which serves up to 2.67× gear against a published 1.67×
 * guarantee. `BOT_DISTRIBUTION` allocates Bronze 20% and nothing had ever filled it.
 *
 * ### Generated, and stated as such
 *
 * The twenty-four above are hand-authored: named for what the squad *does*, themed for
 * spread against their neighbours. These hundred are composed from a word table and a
 * theme walk. **That is a real drop in character and it is the trade being made** — a
 * hundred hand-authored rungs is the single largest authoring job in the project
 * (`009` budgets ~130 of them), and an empty Bronze is shipping today. The authored
 * ramp is deliberately left first in the list so it keeps its identity.
 */

/** The nine, in a fixed order — the theme walk below indexes into this. */
const TYPES: readonly DamageType[] = Object.freeze([
  'earth',
  'air',
  'fire',
  'water',
  'light',
  'dark',
  'slash',
  'pierce',
  'crush',
]);

/**
 * Ten by ten, so the hundred names are exactly the product and none repeat.
 *
 * **Short on purpose.** `accountName` turns `The Quiet Crown` into `Quiet_Crown`, and
 * `validateUsername` caps at 16 characters — the cap that stopped the seeder mid-run at
 * bot 41 last time, after twenty rows had already been written. The longest pair here
 * is 12, and `leagueBots.test.ts` checks all of them before anything is written.
 */
const ADJECTIVES = Object.freeze([
  'Iron',
  'Cold',
  'Pale',
  'Deep',
  'Grey',
  'Still',
  'Sworn',
  'Bound',
  'Quiet',
  'Waking',
]);

const NOUNS = Object.freeze([
  'Tide',
  'Gate',
  'Crown',
  'Vigil',
  'Reach',
  'Wall',
  'Oath',
  'Mark',
  'Span',
  'Bell',
]);

/**
 * Where each band's gear may sit, in complete runes.
 *
 * Derived from `LEAGUE_BANDS ÷ COMPLETE_RUNE_SCORE` rather than chosen, so a band edit
 * moves these with it. Bronze is the narrow one — eight rune values for twenty bots —
 * because **the starter ramp already occupies almost all of Bronze**, climbing to 19
 * runes against Silver's floor of 20. Bots therefore share gear scores inside Bronze,
 * which is fine: `botRating` still spreads them, and two bots at the same gear with
 * different squads are two different fights.
 */
const BAND_RUNES: Readonly<Record<Exclude<BotBand, 'starter'>, readonly [number, number]>> =
  Object.freeze({
    bronze: [12, 19],
    silver: [20, 31],
    gold: [32, 49],
    platinum: [50, 69],
    diamond: [70, 81],
  });

/** Coverage tightens above Silver, and 3 is the composable floor — see the note above. */
const BAND_CEILING: Readonly<Record<Exclude<BotBand, 'starter'>, number>> = Object.freeze({
  bronze: 4,
  silver: 4,
  gold: 3,
  platinum: 3,
  diamond: 3,
});

/**
 * ⚠️ **There are only 252 squads in the game, and the arithmetic says so.**
 *
 * `DOMINANT_SEATS = 3` and **every type has exactly three champions**, so a squad's
 * lead theme does not merely *bias* it — it fixes three of the six seats to precisely
 * the three champions of that type. The remaining three come from the six champions of
 * the two support themes, and `select` is deterministic, so a squad is a pure function
 * of `(lead, {second, third})`:
 *
 *     9 leads × C(8,2) support pairs = 9 × 28 = 252
 *
 * A hundred new bots need 200 more squads on top of the 48 already composed. **248
 * against a ceiling of 252 is not comfortable, it is the whole space**, and a walk that
 * reuses any support pair collides immediately — a first attempt using coprime strides
 * produced **52 duplicate squads**, including pairs inside the same band, where two bots
 * really are the same fight.
 *
 * So the pairs are *enumerated* rather than walked. `k` indexes the 252 combinations
 * directly: the lead cycles every rung so neighbours never want the same answer, and
 * the support pair advances only after all nine leads have used it. Distinct by
 * construction for every `k < 252`, which is checked rather than trusted.
 */
const SUPPORT_PAIRS = 28;

function themeWalk(k: number): readonly [DamageType, DamageType, DamageType] {
  const lead = k % 9;

  /* The 28 unordered pairs of the eight non-lead types, in a fixed order. */
  const others = TYPES.filter((_, i) => i !== lead);
  const pairs: Array<readonly [DamageType, DamageType]> = [];
  for (let a = 0; a < others.length; a += 1) {
    for (let b = a + 1; b < others.length; b += 1) pairs.push([others[a]!, others[b]!]);
  }

  const [second, third] = pairs[Math.floor(k / 9) % SUPPORT_PAIRS]!;
  return [TYPES[lead]!, second, third];
}

const BANDS: readonly Exclude<BotBand, 'starter'>[] = Object.freeze([
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
]);

/** Twenty per band across the five — the hundred. */
const PER_BAND = 20;

function generatedRamp(): readonly LeagueRung[] {
  const rungs: LeagueRung[] = [];

  BANDS.forEach((band, bandIndex) => {
    const [lo, hi] = BAND_RUNES[band];

    for (let i = 0; i < PER_BAND; i += 1) {
      const k = bandIndex * PER_BAND + i;

      rungs.push({
        /* The product of the two tables, walked so a band is not all one adjective. */
        name: `The ${ADJECTIVES[k % ADJECTIVES.length]!} ${NOUNS[Math.floor(k / ADJECTIVES.length) % NOUNS.length]!}`,
        band,
        /* Spread across the band rather than bunched, so a player at the floor still
           meets somebody they can beat and one at the ceiling still meets somebody above. */
        runes: lo + Math.round(((hi - lo) * i) / (PER_BAND - 1)),
        ceiling: BAND_CEILING[band],
        themes: themeWalk(k),
        walk: k,
      });
    }
  });

  return Object.freeze(rungs);
}

/**
 * The authored twenty-four first, then the generated hundred.
 *
 * **Order is identity here, not just sequence**: `position` and `botRating` both read
 * the index, so putting the generated rungs after the authored ones leaves the original
 * twenty-four where they were.
 */
const LEAGUE_RAMP: readonly LeagueRung[] = Object.freeze([...AUTHORED_RAMP, ...generatedRamp()]);

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
  readonly band: Exclude<BotBand, 'starter'>;
}

/**
 * Composed, in order, resolving same-band collisions as it goes.
 *
 * **A loop rather than a `map`, because composing rung *n* now depends on what rungs
 * `0…n-1` came out as.** Only 252 distinct squads exist (see `themeWalk`), so with 144
 * bots the generator lands on an already-used composition from time to time. Inside a
 * band that is the same fight offered twice, so the rung advances to the next support
 * pair and recomposes.
 *
 * Authored rungs are **never** re-walked — their themes are a hand-made choice, and two
 * of them are already seeded into a database where `battle_records` has recorded the
 * squads. A collision involving one is left alone and pinned by the test instead.
 */
function composeRamp(): readonly LeagueBot[] {
  const bots: LeagueBot[] = [];
  /** `band:heroIds` of every Visible six already placed — the collision index. */
  const placed = new Set<string>();

  LEAGUE_RAMP.forEach((original, i) => {
    let rung = original;

    /* Up to 27 re-walks — three full turns of the nine leads. Beyond that the space is
       genuinely exhausted and the collision is reported by the test rather than hidden. */
    for (let attempt = 1; attempt <= 27 && rung.walk !== undefined; attempt += 1) {
      const trial = composeOne(rung, i);
      const key = `${rung.band}:${keyOf(trial.visible)}`;
      if (!placed.has(key)) break;
      rung = { ...rung, themes: themeWalk(rung.walk + 9 * attempt) };
    }

    const bot = composeOne(rung, i);
    placed.add(`${bot.band}:${keyOf(bot.visible)}`);
    bots.push(bot);
  });

  return Object.freeze(bots);
}

const keyOf = (seats: readonly BotSeat[]): string =>
  seats
    .map((s) => s.heroId)
    .sort()
    .join(',');

export const LEAGUE_BOTS: readonly LeagueBot[] = composeRamp();

/** One rung, composed. `i` is its index in `LEAGUE_RAMP`, which sets position and chain. */
function composeOne(rung: LeagueRung, i: number): LeagueBot {
  {
    /**
     * ⚠️ **The two ramps are separate chains, and the boundary is load-bearing.**
     *
     * `The Shut Gate` is the last authored rung, and being last is what gives it the
     * *trap* Hidden squad — champions not punished by the type its Visible six invites.
     * Appending the generated hundred gave it a "next" for the first time, which would
     * have silently recomposed it into an ordinary themed squad.
     *
     * It is already seeded, and `battle_records` stores squad composition: Constitution
     * XVI makes recorded battles permanent, so recomposing a live bot would leave those
     * records describing a squad that no longer exists. The chain therefore breaks at
     * the seam, and both ramps end in a trap exactly as each was written to.
     */
    const last = i + 1 === AUTHORED_RAMP.length || i + 1 === LEAGUE_RAMP.length;
    const themes = hiddenThemesFor(rung, last ? undefined : LEAGUE_RAMP[i + 1]);

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
  }
}
