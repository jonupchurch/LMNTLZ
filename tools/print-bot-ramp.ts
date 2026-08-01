/**
 * Print the authored bot ramp — all 44 rungs, both zones — and check that it is
 * actually progressive rather than merely claimed to be.
 *
 * ```
 * pnpm --filter @lmntlz/api exec tsx ../../tools/print-bot-ramp.ts
 * ```
 *
 * **It earns its place: on its first run it found four things a green suite had
 * no opinion about.**
 *
 * 1. The Diamond band asked for a coverage ceiling of **2**, which
 *    `DOMINANT_SEATS = 3` makes unreachable — three of the six always carry the
 *    lead theme, so `counter(lead)` beats three by construction. `select` does not
 *    fail on an impossible ceiling; it quietly returns the best it can. Six
 *    "hardest in the game" squads came out identical in shape to Gold's.
 * 2. `The Shut Gate`'s Hidden six was an exact duplicate of `The Slow Tide`'s
 *    Visible six — the final ambush of Diamond was the fourth fight a new player
 *    ever takes.
 * 3. The coverage curve wobbles rather than descending, in both ramps.
 * 4. The starter ramp carries a duplicate pair of its own — see below.
 *
 * ### ⚠️ A reported duplicate is not always a defect to fix
 *
 * `The Nine Stones`' Hidden six and `The Windward Gate`'s Visible six are the same
 * squad, and both bots are **already seeded in production**. `battle_records`
 * stores squad composition and Constitution XVI makes it permanent, so recomposing
 * either would leave recorded battles describing a squad that no longer exists,
 * with no way to correct them. `seedBots.ts` makes the same argument for why
 * re-seeding skips rather than updates. It is reported and deliberately left.
 */
import { getAllHeroes, type Hero } from '@lmntlz/content';
import { bestAnswerCoverage, STARTER_BOTS, type BotSeat } from '../apps/api/src/matchmaking/starterBots.js';
import { LEAGUE_BOTS } from '../apps/api/src/matchmaking/leagueBots.js';
import { leagueOf, COMPLETE_RUNE_SCORE } from '../apps/api/src/matchmaking/league.js';

const byId = new Map(getAllHeroes().map((h) => [h.id, h]));
const heroes = (seats: readonly BotSeat[]): Hero[] => seats.map((s) => byId.get(s.heroId)!);

const rows = [
  ...STARTER_BOTS.map((b) => ({ ...b, band: 'starter/bronze' })),
  ...LEAGUE_BOTS,
];

console.log('pos  band        name                    gear   league     runes  visCov  hidCov  uniq');
let prevGear = -1;
let prevCov = 99;
/** Which authoring run the previous row belonged to — see the reset below. */
let prevRun = '';
/** The best answer available anywhere in each league — the real difficulty read. */
const coverageByBand = new Map<string, number>();
const problems: string[] = [];
const squadKeys = new Map<string, string>();

for (const b of rows) {
  const vis = heroes(b.visible);
  const hid = heroes(b.hidden);
  const visCov = bestAnswerCoverage(vis);
  const hidCov = bestAnswerCoverage(hid);
  const league = leagueOf(b.gearScore);

  /* Nursery, hand-authored, generated — each ascends on its own, per band. */
  const run =
    b.position <= STARTER_BOTS.length
      ? 'starter'
      : `${b.band}/${b.position <= 44 ? 'authored' : 'generated'}`;

  /* Every squad must be a distinct set of six, or the ramp repeats itself. */
  for (const [zone, squad] of [['V', vis], ['H', hid]] as const) {
    const key = squad.map((h) => h.id).sort().join(',');
    const seen = squadKeys.get(key);
    if (seen) problems.push(`DUPLICATE SQUAD: ${b.name}/${zone} == ${seen}`);
    else squadKeys.set(key, `${b.name}/${zone}`);
  }

  /**
   * ⚠️ **Both comparisons are per RUN, and the reset is the fix.**
   *
   * These were written when the ramp was one ascending line: starter 1–20, then a
   * single authored league run 21–44. There are now three runs — the nursery, the
   * authored twenty-four and the generated hundred — and each one restarts at its
   * band's floor. Compared linearly, every restart looked like a regression and the
   * tool reported 29 "problems" of which 18 were the ramp working as designed.
   *
   * **An instrument that cries wolf is an instrument nobody reads**, which matters
   * here more than usual: this tool is what caught the unreachable coverage ceiling
   * and two duplicate squads that a green test suite had passed.
   */
  if (run !== prevRun) {
    prevGear = -1;
    prevCov = 99;
    prevRun = run;
  }

  if (b.gearScore < prevGear) problems.push(`GEAR WENT DOWN at ${b.position} ${b.name}`);

  /**
   * **Coverage is checked row-by-row only on the starter ramp**, which really is one
   * monotonic teaching sequence — stages 1 to 3 tighten deliberately, and a rung that
   * got easier than the one before it is an authoring mistake there.
   *
   * Above it, coverage is *not* meant to fall on every rung. It varies between 3 and
   * the band's ceiling depending on how the themes compose, and that variation is the
   * point: consecutive opponents should not all want the same shape of answer. What
   * must hold is that a **band's hardest coverage never gets easier than the band
   * below it**, which is a fact about bands, so it is measured as one below.
   */
  if (run === 'starter') {
    if (visCov > prevCov) {
      problems.push(`COVERAGE ROSE (easier) at ${b.position} ${b.name}: ${prevCov} -> ${visCov}`);
    }
    prevCov = Math.min(prevCov, visCov);
  }

  coverageByBand.set(league, Math.min(coverageByBand.get(league) ?? 9, visCov));
  prevGear = b.gearScore;

  console.log(
    `${String(b.position).padStart(3)}  ${b.band.padEnd(11)} ${b.name.padEnd(23)} ` +
      `${String(b.gearScore).padStart(5)}  ${league.padEnd(9)}  ${String(b.gearScore / COMPLETE_RUNE_SCORE).padStart(4)}   ` +
      `${visCov}/6     ${hidCov}/6     ${new Set([...vis, ...hid].map((h) => h.id)).size}/12`,
  );
}

console.log('\n--- population per league ---');
const pop = new Map<string, number>();
for (const b of rows) pop.set(leagueOf(b.gearScore), (pop.get(leagueOf(b.gearScore)) ?? 0) + 1);
for (const l of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
  const n = pop.get(l) ?? 0;
  console.log(`  ${l.padEnd(9)} ${String(n).padStart(2)} ${n < 5 ? '  ⚠ BELOW MIN_POOL (5)' : ''}`);
}

console.log('\n--- hardest squad per league (lowest best-answer coverage) ---');
let looser = 9;
for (const l of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
  const cov = coverageByBand.get(l);
  if (cov === undefined) continue;
  console.log(`  ${l.padEnd(9)} ${cov}/6`);
  /* Climbing must never make the hardest available fight easier. */
  if (cov > looser) problems.push(`BAND GOT EASIER: ${l} bottoms out at ${cov}/6 vs ${looser}/6 below`);
  looser = Math.min(looser, cov);
}

console.log(`\n--- problems: ${problems.length} ---`);
for (const p of problems) console.log('  ' + p);
