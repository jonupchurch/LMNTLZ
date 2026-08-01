/**
 * The twenty starter bots — the authored ramp a new player's whole first week is
 * fought against (009 T045 · T046 · FR-019).
 *
 * ### Two deviations from the task, both deliberate, both stated
 *
 * **1. Server-side, not `packages/content`.** T045 names `content/bots/starter/*.json`.
 * `apps/client` depends on `@lmntlz/content`, so anything placed there is compiled
 * into the browser bundle — which would ship **every bot's Hidden squad to every
 * player**, and the Hidden squad is the one thing in this game that is *never shown*
 * (`CLAUDE.md`: "never shown and never selectable"). Constitution XVII says storing is
 * not exposing; putting these in the shared package would make storing *be* exposing,
 * permanently and irreversibly, since a shipped bundle cannot be recalled. So they
 * live behind the API.
 *
 * **2. The seats are DERIVED from an authored ramp spec, not hand-picked.** Twenty
 * bots × two squads × six seats is 240 seat assignments. Hand-authored, nobody —
 * including me — can verify that stage 1 really is exploitable or that stage 3 really
 * has no free answer; the only way to check is to re-derive it by hand. So what is
 * authored is the **rule** (`STARTER_RAMP` below: a stage, a gear fill, and the type
 * themes each squad is built around) and the seats fall out of `composeSquad`. That is
 * the same principle Constitution XV applies to bane and fault — *the doors are not
 * chosen* — and it means `bots.test.ts` can assert the ramp's teaching properties
 * against the composed squads rather than against my intentions.
 *
 * ### What the ramp teaches, stage by stage
 *
 * The one lesson LMNTLZ has to land in week one is **counter-building**: read the
 * enemy's weaknesses, do not stack your own. So the ramp is a sequence of squads that
 * reward exactly that, and it gets harder by removing the free answer rather than by
 * adding numbers.
 *
 * | Stage | Bots | Visible squad | What it teaches |
 * |---|---|---|---|
 * | 1 | 1–5 | every member shares one type | *one type beats all six* — bring it and win |
 * | 2 | 6–12 | two types | *no single answer* — split your damage |
 * | 3 | 13–20 | a dominant type plus two others | *there is a best answer and it is punished* |
 *
 * ### The Hidden squad is one stage up, and stage 3's is a trap
 *
 * T046: each bot's Hidden squad is built to the standard of the stage above its own,
 * so an ambush is always a step harder than the fight that earned it. For stage 3
 * there is no stage above, so the rule changes shape: **the Hidden squad is composed
 * of heroes who resist the very type the Visible squad invited you to bring.**
 *
 * A player who solved bot 17's Visible squad by stacking Water walks into six
 * champions who all carry Water — where Water reads ×0.50 or ×0.80 instead of ×1.50.
 * That is the ambush tax doing its designed job rather than being a flat penalty, and
 * it is the last thing the starter league teaches before it lets go: **the answer that
 * worked is the answer they were ready for.**
 */

import {
  counter,
  DAMAGE_TYPES,
  effectiveness,
  getAllHeroes,
  type DamageType,
  type Hero,
} from '@lmntlz/content';
import { SQUAD_ROWS, type SquadRow } from '../db/schema/squads.js';
import { COMPLETE_RUNE_SCORE } from './league.js';

/** Seats per row, in the fixed 2 · 3 · 1 formation. */
const ROW_CAPACITY: Readonly<Record<SquadRow, number>> = { front: 2, middle: 3, back: 1 };

export interface BotSeat {
  readonly row: SquadRow;
  readonly index: number;
  readonly heroId: string;
}

export interface StarterBot {
  /** 1-based, and it is the ramp position — bot 1 is the weakest. */
  readonly position: number;
  /** The squad's display name, e.g. `The Nine Stones`. Stored on `squads.name`. */
  readonly name: string;
  /**
   * The **account** username, e.g. `Nine_Stones`.
   *
   * **A separate field because a squad name is not a username**, and finding that out
   * was worth the trip: `auth/username.ts` allows only `\p{L}\p{N}_` and caps the
   * length at 16, so *"The Nine Stones"* is not a name any account can hold — spaces
   * are rejected outright.
   *
   * **Bots take player-legal names on purpose.** They share the unique
   * `accounts.username_key` index with everybody, and that index is only impersonation
   * protection if the names on both sides of it are drawn from the same alphabet: a bot
   * squatting an unreachable name protects nothing, while `Nine_Stones` is a name a
   * player genuinely cannot take. `bots.seed.test.ts` asserts every one of the twenty
   * passes `validateUsername`, which is the check that keeps this honest.
   *
   * The flavour is not lost — it moves to `squads.name`, which is the field that was
   * always meant to carry it.
   */
  readonly username: string;
  readonly stage: 1 | 2 | 3;
  readonly gearScore: number;
  readonly visible: readonly BotSeat[];
  readonly hidden: readonly BotSeat[];
  /** The Visible squad's lead theme, carried through so a test need not infer it. */
  readonly dominant: DamageType;
  /** The type that beats the Visible squad hardest. Recorded so a test can check it. */
  readonly invites: DamageType;
}

/**
 * One authored rung. **`themes` are the types a squad is built around** — a hero
 * qualifies if the type is its primary *or* its secondary, because both sides of a
 * hero's profile derive from those two fields and both show up in what beats it.
 */
interface Rung {
  readonly name: string;
  readonly stage: 1 | 2 | 3;
  /**
   * Complete runes' worth of gear. `12 × 125 = 1500` is the starter grant *and* the
   * Bronze floor, so a rung below 12 is weaker than the player it faces and a rung
   * above it is already Bronze-legal. **The ramp crosses that line inside stage 2**,
   * which is what makes stage 3 the graduation standard rather than a difficulty wall.
   */
  readonly runes: number;
  /** The Visible squad's themes. One for stage 1, two for stage 2, three for stage 3. */
  readonly themes: readonly [DamageType, ...DamageType[]];
}

/**
 * The authored ramp. **This table is the whole of what is hand-written here.**
 *
 * Names are drawn from `resources/LORE-and-flavor.md`'s register — a defense squad in
 * this world is a *gate*, a *watch* or a *hold*, never a player handle, because a bot
 * should not read as somebody you could have met.
 *
 * The five stage-1 themes are the five most populous type involvements, each giving a
 * different single answer, so a player who bulldozes bot 1 with Air cannot reuse Air
 * on bot 2. Bots 6–12 pair a magic type with a melee one, which is the first squad a
 * player meets that cannot be answered by one column of the matchup chart. Bots 13–20
 * lead with a dominant type and cover it with two others.
 */
const STARTER_RAMP: readonly Rung[] = Object.freeze([
  /**
   * --- Stage 1 · one type, one answer, no gear ---------------------------------
   *
   * **`fire` is deliberately not a stage-1 theme, and this is arithmetic.** A stage-1
   * squad is *all six* champions carrying its theme, and fire has **exactly six**
   * carriers in the whole roster — so a fire rung has no choice about who it fields.
   * `The Drowned Choir` (rung 15) invites fire, so its Hidden squad is forced to those
   * same six, and the two squads came out **identical**: the ramp shipped rung 2's
   * Visible squad again as rung 15's ambush. The five themes below all have seven or
   * more carriers, so each has real choice. Fire still appears as an *answer* — it is
   * `counter(water)`, which rung 4 invites.
   */
  { name: 'The Nine Stones', stage: 1, runes: 6, themes: ['earth'] },
  { name: 'The Windward Gate', stage: 1, runes: 7, themes: ['air'] },
  { name: 'The Unhidden Gate', stage: 1, runes: 8, themes: ['light'] },
  { name: 'The Slow Tide', stage: 1, runes: 9, themes: ['water'] },
  { name: 'The Quiet Hold', stage: 1, runes: 10, themes: ['dark'] },

  // --- Stage 2 · two types, partial fill, and the Bronze floor is crossed -------
  { name: 'Stone and Cinder', stage: 2, runes: 11, themes: ['earth', 'crush'] },
  { name: 'The Thin Blade Watch', stage: 2, runes: 11, themes: ['air', 'pierce'] },
  { name: 'Salt and Iron', stage: 2, runes: 12, themes: ['water', 'slash'] },
  { name: 'The Lantern Wall', stage: 2, runes: 12, themes: ['light', 'crush'] },
  { name: 'Ash and Silence', stage: 2, runes: 13, themes: ['fire', 'dark'] },
  { name: 'The Long Reach', stage: 2, runes: 13, themes: ['air', 'water'] },
  { name: 'The Verdict Hold', stage: 2, runes: 14, themes: ['light', 'pierce'] },

  // --- Stage 3 · a dominant type covered by two others · the standard -----------
  { name: 'The Deep Assembly', stage: 3, runes: 15, themes: ['earth', 'light', 'slash'] },
  { name: 'The Burning Court', stage: 3, runes: 15, themes: ['fire', 'water', 'pierce'] },
  { name: 'The Drowned Choir', stage: 3, runes: 16, themes: ['water', 'dark', 'crush'] },
  { name: 'The High Reach', stage: 3, runes: 16, themes: ['air', 'light', 'crush'] },
  { name: 'The Unspoken Verdict', stage: 3, runes: 17, themes: ['dark', 'fire', 'slash'] },
  { name: 'The Last Wall', stage: 3, runes: 17, themes: ['light', 'earth', 'pierce'] },
  { name: 'The Gathering Storm', stage: 3, runes: 18, themes: ['air', 'dark', 'slash'] },
  { name: 'The Closed Gate', stage: 3, runes: 19, themes: ['light', 'crush', 'water'] },
]);

/**
 * **A stage-3 rung's *first* theme must be a magic type, and this is a roster fact
 * rather than a style rule.**
 *
 * Stage 3's Hidden squad is six champions who all resist `counter(themes[0])`, and the
 * champions who resist a type are exactly those carrying it. **The melee types have
 * three carriers each** — `slash` is h19/h20/h21, and `pierce` and `crush` are the same
 * size — because the 3-cycle is too small for a melee secondary to be legal
 * (`CLAUDE.md`: melee heroes always take a magic secondary). Six seats cannot be filled
 * from three champions.
 *
 * `The Closed Gate` was authored as `['crush', …]`, which invites `slash`, and the ramp
 * refused to build: *"3 champions available, 1 of reach 2."* Melee types are fine as
 * second or third themes — they simply cannot be the one the trap is aimed at.
 *
 * **No separate validation guards this**, deliberately: `composeSquad` already throws at
 * module load, before a single request is served, and a second check would be a second
 * thing to keep in step.
 */

/**
 * A squad's display name to an account username: drop a leading article, spaces to
 * underscores.
 *
 * **Derived rather than authored twice**, so the two can never drift into naming
 * different things. The leading `The ` goes because it costs four of the sixteen
 * characters available and carries no information — every rung has one.
 */
const accountName = (display: string): string =>
  display.replace(/^The /, '').replaceAll(' ', '_');

/** Every hero whose primary or secondary is one of `themes`, in roster order. */
function pool(themes: readonly DamageType[], exclude: ReadonlySet<string>): Hero[] {
  return getAllHeroes().filter(
    (h) => !exclude.has(h.id) && themes.some((t) => h.primary === t || h.secondary === t),
  );
}

/** Every hero that `t` is *not* super-effective or effective against — the trap's pool. */
function notWeakTo(t: DamageType, exclude: ReadonlySet<string>): Hero[] {
  return getAllHeroes().filter((h) => !exclude.has(h.id) && effectiveness(t, h) <= 1.0);
}

/**
 * Top a short themed pool up to six from the rest of the roster.
 *
 * **Only two of the four squads per rung may use this, and the split is the whole
 * point.** Some of the ramp's promises are *type guarantees* — a stage-1 Visible squad
 * where one type beats all six, a stage-3 Hidden squad where all six resist the invited
 * answer — and those cannot be topped up without becoming false. Others are only
 * *difficulty* claims: a stage-1 or stage-2 Hidden squad is "built to the standard of
 * the next rung", which survives a champion drawn from outside the theme.
 *
 * So the guarantees fail loudly and the difficulty claims bend. Passing no top-up is
 * how a caller says "this promise is exact".
 *
 * **Why any of this is needed:** `fire` has exactly six involved champions in the whole
 * roster (h01, h07, h08, h09, h13, h17) and `slash`, `pierce` and `crush` have three
 * each. A rung themed on earth seats h01 and h09 — both fire-carriers — so the fire
 * rung that follows it has four left for six seats. Discovered by the ramp refusing to
 * build, which is the right way to discover it.
 */
function toSix(preferred: readonly Hero[], exclude: ReadonlySet<string>): Hero[] {
  if (preferred.length >= 6) return [...preferred];

  const have = new Set(preferred.map((h) => h.id));
  const rest = getAllHeroes().filter((h) => !exclude.has(h.id) && !have.has(h.id));

  // Reach 2 first, so the back seat stays fillable however thin the theme was.
  const ordered = [...rest].sort((a, b) => b.reach - a.reach || a.id.localeCompare(b.id));
  return [...preferred, ...ordered.slice(0, 6 - preferred.length)];
}

/**
 * How many of a multi-theme squad's six seats the **dominant** theme must hold.
 *
 * Three, so it is a plurality of six and `counter(dominant)` is a real answer to half
 * the squad rather than a nominal one. **Not four or more**, because at four the single
 * best type covers two thirds of the squad and stage 3 stops being "no free answer".
 */
const DOMINANT_SEATS = 3;

/**
 * The most seats any one of the nine types may solve, per stage.
 *
 * **This is the ramp, expressed as the one number that defines it.** Difficulty in
 * LMNTLZ is not bigger stats — it is how much of a squad a single column of the matchup
 * chart can answer. Six means "bring this type and win"; four means over a third of the
 * squad shrugs it off and the attacker has to split their damage.
 *
 * **Added after reading the composed ramp, which did not obey it.** The first version
 * asserted only that the *stage average* fell, and that was satisfied by a ramp whose
 * rung 12 — the last fight before graduation — was solvable 6/6 by Dark, while rungs 10
 * and 11 sat at 3/6. A ramp that goes 3, 3, 6 is not a ramp, and an average hid it.
 */
const MAX_COVERAGE: Readonly<Record<1 | 2 | 3, number>> = { 1: 6, 2: 5, 3: 4 };

/** How many of a squad's six champions type `t` is super-effective or effective against. */
const weakTo = (heroes: readonly Hero[], t: DamageType): number =>
  heroes.filter((h) => effectiveness(t, h) >= 1.25).length;

/**
 * The most members any single one of the nine types beats.
 *
 * Exported because it is a **design quantity rather than a test helper** — it is what
 * `MAX_COVERAGE` bounds, and a reader asking "how hard is rung 14" wants this number.
 */
export const bestAnswerCoverage = (heroes: readonly Hero[]): number =>
  Math.max(...DAMAGE_TYPES.map((t) => weakTo(heroes, t)));

/**
 * Choose exactly six champions for a themed squad.
 *
 * **Selection is separate from seating, and it did not start that way.** The first
 * version handed the whole themed pool to the seater and let role priority pick six —
 * which meant a three-theme squad's *dominant* type was whatever role sorting happened
 * to favour. `The Drowned Choir` came out with `water` on **two of six** while claiming
 * water as its lead, so `counter(water)` was not the answer the ramp advertised. The
 * dominant theme now takes its seats first, which makes the claim true by construction
 * instead of by luck.
 */
export function select(
  themes: readonly [DamageType, ...DamageType[]],
  exclude: ReadonlySet<string>,
  exact: boolean,
  ceiling: number,
  label: string,
  /** Set for a stage-3 trap: no champion may be super-effectively hit by this type. */
  avoid?: DamageType,
): Hero[] {
  /**
   * **Every squad orders its own pool, and rotation was not enough to achieve that.**
   *
   * Two rungs sharing a lead theme were composing the *same six champions*: rung 12
   * shipped rung 3's Visible squad with more gear on it, and each rung's Hidden squad
   * came out identical to the next rung's Visible squad, because they draw from the same
   * themed pool in the same order. Rotating the pick by rung index fixed one pair and
   * moved the collision to the next — with a seven-champion pool and six seats there are
   * only seven possible squads, so two different offsets frequently exclude the same
   * champion.
   *
   * Mixing the squad's own label into the sort gives each of the forty squads its own
   * ordering. **It is a hash, not a random number**: `Math.random()` would make the ramp
   * different on every boot, and a bot whose squad changed between seedings would break
   * comparisons across recorded battles that Constitution XVI cannot correct afterwards.
   *
   * **The ordering is variety only — it cannot weaken a guarantee.** Which champions are
   * *eligible* comes from `themes`, the coverage ceiling is enforced below, and `exact`
   * still refuses a short pool. Reordering an eligible pool cannot make an ineligible
   * champion eligible.
   */
  /**
   * **Ordered by the hash alone — role plays no part in *selection*.** An earlier version
   * sorted by `frontPriority` first and the hash only as a tiebreak, which meant the hash
   * could not change anything that mattered: `light` has exactly three tanks, so the
   * three dominant seats took those three tanks in every squad that led on light, hash or
   * no hash. Rung 13's Hidden squad and rung 1's came out identical the same way — `air`
   * has exactly three strikers.
   *
   * Roles belong to **seating**, which is `composeSquad`'s job and happens after this.
   * Sorting by role here was the separation of selection from seating being claimed but
   * not actually made.
   */
  const byHash = (a: Hero, b: Hero) =>
    hash(`${label}:${a.id}`) - hash(`${label}:${b.id}`) || a.id.localeCompare(b.id);

  const dominant = pool([themes[0]], exclude).sort(byHash);
  const chosen = dominant.slice(0, DOMINANT_SEATS);

  /**
   * **The remaining seats are chosen to hold the coverage down, not by role order.**
   * `ceiling` is the stage's `MAX_COVERAGE`, and picking greedily against it is what
   * makes a stage-3 squad measurably harder than a stage-2 one rather than
   * coincidentally so. Ties break on id, so this stays deterministic.
   */
  /**
   * **The fill pool is "not punished by the trap", not "carries the trap type", and that
   * widening is what made the ramp buildable at all.**
   *
   * A stage-3 Hidden squad of six drawn only from the champions *carrying* one type has
   * as few as **seven candidates** — `air`, `water` and `earth` all have exactly seven —
   * so there are only seven possible squads on that theme, and the ramp needs two each.
   * Reshuffling could not fix that; three separate orderings collided in turn, each fix
   * moving the duplicate to the next pair.
   *
   * So the trap's promise is stated as what the *player* experiences rather than as a
   * roster predicate: **the type you brought is not super-effective against anybody
   * here.** The dominant seats still carry it and genuinely resist at ×0.50 or ×0.80; the
   * rest merely read ×1.00. Removing the ×1.50 a player was counting on is the ambush
   * tax — a neutral defender is already the answer failing, and it takes the pool from
   * seven to twenty.
   */
  const taken = new Set([...exclude, ...chosen.map((h) => h.id)]);
  const rest = (avoid ? notWeakTo(avoid, taken) : pool(themes, taken)).sort(byHash);

  while (chosen.length < 6 && rest.length > 0) {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let k = 0; k < rest.length; k++) {
      const score = bestAnswerCoverage([...chosen, rest[k]!]);
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
      if (bestScore <= ceiling) break;
    }
    chosen.push(...rest.splice(best, 1));
  }

  const six = exact ? chosen : toSix(chosen, exclude);

  /**
   * **The back seat needs reach 2, so make sure one is present before seating.** A
   * themed pool can be all reach-1 — `crush` is h25/h26/h27 and two of those are
   * reach 1 — and discovering that in the seater means throwing on a squad that a
   * single swap would have fixed.
   */
  if (six.length === 6 && !six.some((h) => h.reach === 2)) {
    const swap = pool(themes, new Set([...exclude, ...six.map((h) => h.id)])).find(
      (h) => h.reach === 2,
    );
    if (swap) six[five(six)] = swap;
  }

  return six;
}

/** The index of the seat cheapest to give up: the last non-tank. */
function five(six: readonly Hero[]): number {
  const i = [...six].reverse().findIndex((h) => h.role !== 'tank');
  return i === -1 ? six.length - 1 : six.length - 1 - i;
}

/**
 * Seat six champions legally, given a pool.
 *
 * **Two placement rules, both of them consequences of the reach system rather than
 * preferences.** A reach-1 champion in the back row reaches nothing at full formation
 * — feature 006 warns a *player* about exactly this seat — so **the back seat is
 * always reach 2**. And tanks go front because that is the seat that is attacked
 * first, which is `04-defense-ai.md`'s own reading of the formation.
 *
 * Deterministic: same pool, same seats, every time. A bot whose squad shifted between
 * seedings would break `battle_records` comparisons across a re-seed, and Constitution
 * XVI cannot correct a recorded battle afterwards.
 */
export function composeSquad(candidates: readonly Hero[], label: string): readonly BotSeat[] {
  const reach2 = candidates.filter((h) => h.reach === 2);
  if (candidates.length < 6 || reach2.length < 1) {
    // Names the squad, because "4 champions available" alone does not say which rung of
    // the ramp is unbuildable — and the pools are small enough that one theme choice
    // can starve one squad and no other.
    throw new Error(
      `${label}: cannot seat a squad — ${candidates.length} champions available, ${reach2.length} of reach 2`,
    );
  }

  // Back first, because it is the only seat with a hard requirement. Prefer a buffer
  // or tank — the champions least wasted by being furthest from the enemy.
  const back =
    reach2.find((h) => h.role === 'buffer') ?? reach2.find((h) => h.role === 'tank') ?? reach2[0]!;

  const rest = candidates.filter((h) => h.id !== back.id);
  const byFrontPriority = [...rest].sort(
    (a, b) => frontPriority(a) - frontPriority(b) || a.id.localeCompare(b.id),
  );

  const front = byFrontPriority.slice(0, 2);
  const middle = byFrontPriority.slice(2, 5);

  if (front.length < 2 || middle.length < 3) {
    throw new Error(`${label}: only ${rest.length} champions after the back seat`);
  }

  return Object.freeze([
    ...front.map((h, index) => ({ row: 'front' as const, index, heroId: h.id })),
    ...middle.map((h, index) => ({ row: 'middle' as const, index, heroId: h.id })),
    { row: 'back' as const, index: 0, heroId: back.id },
  ]);
}

/**
 * FNV-1a over a string, as a small non-negative integer.
 *
 * Here rather than imported because the resolver's `SplitMix64` is **seeded RNG for
 * battles** and the seed never leaves the server — borrowing it for content composition
 * would put a gameplay-critical primitive in a path that has nothing to do with
 * gameplay. This needs only "stable and spread out", which twelve lines cover.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 8;
}

/** Tanks forward, then strikers, then everything else. Lower sorts further front. */
function frontPriority(hero: Hero): number {
  if (hero.role === 'tank') return 0;
  if (hero.role === 'striker') return 1;
  if (hero.role === 'ranged') return 2;
  return 3;
}

/**
 * The type that beats a themed squad hardest.
 *
 * A hero's Bane is `counter(primary)`, so the answer to a squad built around type `T`
 * is `counter(T)` — and for a multi-theme squad the **first** theme is the dominant
 * one by construction of the table above. This is what stage 3's Hidden squad is built
 * to resist.
 */
export const invitedAnswer = (themes: readonly [DamageType, ...DamageType[]]): DamageType =>
  counter(themes[0]);

/**
 * The Hidden squad's themes: one stage up, or the trap.
 *
 * Stages 1 and 2 borrow the *next* rung's themes, so an ambush is a step into the
 * fight the player has not earned yet. Stage 3 has no next rung, so it inverts: the
 * Hidden squad is built from champions who **carry the type the Visible squad invited**,
 * which is exactly the set that resists it (×0.50 as a primary, ×0.80 as a secondary).
 */
function hiddenThemes(rung: Rung, next: Rung | undefined): readonly [DamageType, ...DamageType[]] {
  if (rung.stage === 3 || !next) return [invitedAnswer(rung.themes)];
  return next.themes;
}

/**
 * The twenty bots, composed.
 *
 * Built once at module load and frozen. **`gearScore` is stored on the bot rather than
 * derived from its squad**, because gear is runes and `010` owns runes — the same seam
 * `gearScore()` already names. When 010 lands, a bot's score becomes a function of its
 * placed runes and this field goes away.
 */
export const STARTER_BOTS: readonly StarterBot[] = Object.freeze(
  STARTER_RAMP.map((rung, i) => {
    const themes = hiddenThemes(rung, STARTER_RAMP[i + 1]);

    /**
     * **The two zones cannot share a champion, so the scarcer pool picks first.**
     * `PUT /v1/squads/defense/:zone` answers `409` for a hero already on the other
     * zone, and bots are saved through that same player path — so an overlap is a
     * seeding failure rather than an illegal squad.
     *
     * Which zone is scarcer depends on the stage, and this is not a tuning
     * preference — it is arithmetic that stopped the ramp from building at all.
     * A stage-3 Hidden squad draws from **one** type's involvement, and
     * `fire` has exactly six involved champions across the whole roster
     * (h01, h07, h08, h09, h13, h17). Composing Visible first let a three-theme
     * squad take one of them, leaving five for a six-seat squad — *"cannot seat a
     * squad: 4 champions available"*, which is how this was found.
     *
     * So stage 3 seats Hidden first and lets the three-theme Visible pool absorb the
     * exclusion, which it can: fourteen or more champions remain. Stages 1 and 2 have
     * the opposite shape — their Hidden squad borrows the *next* rung's themes and is
     * the wider pool — so they keep Visible-first and the dominant theme keeps first
     * claim on its own scarce type.
     */
    /**
     * `exact: true` means the squad's type promise is a guarantee and a short pool must
     * fail rather than be padded. See `toSix`.
     */
    const seat = (
      of: readonly [DamageType, ...DamageType[]],
      zone: string,
      taken: readonly BotSeat[],
      exact: boolean,
    ) => {
      const exclude = new Set(taken.map((s) => s.heroId));
      // A Hidden squad is built to the *next* stage's standard, so it takes that
      // stage's ceiling — which is what "one band up its own ramp" means numerically.
      const stage = zone === 'hidden' ? (Math.min(3, rung.stage + 1) as 1 | 2 | 3) : rung.stage;
      // Only the stage-3 trap constrains by what it must survive rather than by theme.
      const avoid = zone === 'hidden' && rung.stage === 3 ? invitedAnswer(rung.themes) : undefined;
      return composeSquad(
        select(of, exclude, exact, MAX_COVERAGE[stage], `${rung.name}/${zone}`, avoid),
        `${rung.name} (${zone})`,
      );
    };

    let visible: readonly BotSeat[];
    let hidden: readonly BotSeat[];

    if (rung.stage === 3) {
      // Hidden first, and exactly: every champion must resist the invited answer.
      hidden = seat(themes, 'hidden', [], true);
      visible = seat(rung.themes, 'visible', hidden, false);
    } else {
      // Visible first, and stage 1 exactly: one type must beat all six.
      visible = seat(rung.themes, 'visible', [], rung.stage === 1);
      hidden = seat(themes, 'hidden', visible, false);
    }

    return Object.freeze({
      position: i + 1,
      name: rung.name,
      username: accountName(rung.name),
      stage: rung.stage,
      gearScore: rung.runes * COMPLETE_RUNE_SCORE,
      visible,
      hidden,
      dominant: rung.themes[0],
      invites: invitedAnswer(rung.themes),
    });
  }),
);

/** The rows a squad must fill, exported so a test can check the shape independently. */
export { ROW_CAPACITY, SQUAD_ROWS };
