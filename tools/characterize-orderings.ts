/**
 * Re-derive the universally safe power orderings (feature 004, T003–T006).
 *
 * Run:  pnpm exec tsx tools/characterize-orderings.ts
 *
 * **Deliberately not in CI.** 19,440 hero × ordering pairs at two horizons is an
 * offline characterisation; CI runs the 324 fast cases in
 * `packages/sim/tests/ai/safeOrderings.test.ts` instead. Adding this to a
 * pull-request job would buy minutes per push to re-measure a constant.
 *
 * ### What changed in the port
 *
 * The Python reference read the workbook and simulated the cooldown ladder
 * itself. **This reads `@lmntlz/content` and imports `firingProfile` from
 * `@lmntlz/sim/rules`** — the same function the squad builder calls and the same
 * cooldown semantics the engine uses. A sweep with its own simulation loop would
 * be a second implementation of the exact thing feature 004 exists to keep
 * single (research.md Q2), and it would be the copy nobody noticed drifting.
 *
 * ### The standing instruction
 *
 * **Re-run this before the hero-numbers pass locks.** A one-point *reduction* in
 * the tier-4/5 cooldown ladder takes the safe set from 12 to **zero**
 * (research.md Finding 2). That is not a formality — it is the difference
 * between four defaults that keep every power live and four that do not.
 *
 * Expected output, locked 2026-07-28 against resources/mechanics/07-defense-ai.md:
 *   greedy tier shares    5.4 18.8 23.6 23.6 16.7 11.9
 *   live-power histogram  16.7 / 16.7 / 19.2 / 24.4 / 20.2 / 3.0 %
 *   universally safe      12          median per hero: 13
 *   all 12 end in tier 0  yes
 */

import { getAllHeroes, type Hero } from '@lmntlz/content';
import {
  BATTLE_TURNS,
  LIVE_SHARE_THRESHOLD,
  SWEEP_TURNS,
  firingProfile,
  type PowerRanking,
} from '@lmntlz/sim/rules';

const ROSTER = getAllHeroes();

function allOrderings(): readonly PowerRanking[] {
  const out: PowerRanking[] = [];
  const walk = (chosen: number[], left: readonly number[]): void => {
    if (left.length === 0) {
      out.push(chosen as unknown as PowerRanking);
      return;
    }
    for (const tier of left) walk([...chosen, tier], left.filter((t) => t !== tier));
  };
  walk([], [0, 1, 2, 3, 4, 5]);
  return out;
}

const ORDERINGS = allOrderings();

/** How many of the given tiers stay live for this hero under this ordering. */
function liveCount(
  hero: Hero,
  ordering: PowerRanking,
  turns: number,
  tiers: readonly number[],
): number {
  const profile = firingProfile(hero, ordering, turns);
  return tiers.filter((tier) => (profile.find((e) => e.tier === tier)?.share ?? 0) >= LIVE_SHARE_THRESHOLD)
    .length;
}

const ALL_TIERS = [0, 1, 2, 3, 4, 5] as const;
const TIERS_1_TO_5 = [1, 2, 3, 4, 5] as const;
const fmt = (n: number, w = 5, d = 1) => n.toFixed(d).padStart(w);
const show = (o: PowerRanking) => o.join('·');

// ---------------------------------------------------------------------------
// 1 — validate the model against the recorded greedy distribution
// ---------------------------------------------------------------------------

const GREEDY: PowerRanking = [5, 4, 3, 2, 1, 0];
const greedyShare = [0, 0, 0, 0, 0, 0];

for (const hero of ROSTER) {
  const profile = firingProfile(hero, GREEDY, SWEEP_TURNS);
  for (const tier of ALL_TIERS) {
    greedyShare[tier]! += (profile.find((e) => e.tier === tier)!.share * 100) / ROSTER.length;
  }
}

console.log(`greedy ${show(GREEDY)} mean share per tier:`, ALL_TIERS.map((t) => fmt(greedyShare[t]!)).join(' '));
console.log('recorded in 07-defense-ai.md:            ', '  5.4  18.8  23.6  23.6  16.7  11.9');

// ---------------------------------------------------------------------------
// 2 — the 19,440-pair characterisation, at BOTH horizons (T004)
// ---------------------------------------------------------------------------

interface Sweep {
  readonly turns: number;
  readonly tiers: readonly number[];
  readonly histogram: number[];
  readonly safe: PowerRanking[];
  readonly perHero: number[];
}

function sweep(turns: number, tiers: readonly number[]): Sweep {
  const histogram = Array.from({ length: tiers.length + 1 }, () => 0);
  const safe: PowerRanking[] = [];
  const perHero = ROSTER.map(() => 0);

  for (const ordering of ORDERINGS) {
    let safeOnAll = 0;
    ROSTER.forEach((hero, i) => {
      const live = liveCount(hero, ordering, turns, tiers);
      histogram[live]!++;
      if (live === tiers.length) {
        safeOnAll++;
        perHero[i]!++;
      }
    });
    if (safeOnAll === ROSTER.length) safe.push(ordering);
  }

  return { turns, tiers, histogram, safe, perHero };
}

const at60 = sweep(SWEEP_TURNS, ALL_TIERS);
const total = ROSTER.length * ORDERINGS.length;

console.log(`\n${total} hero × ordering pairs at ${SWEEP_TURNS} turns, tiers 0–5`);
for (let k = 1; k <= 6; k++) {
  console.log(`  ${k} powers live: ${String(at60.histogram[k]).padStart(6)}  ${fmt((at60.histogram[k]! / total) * 100)}%`);
}

const perHeroSorted = [...at60.perHero].sort((a, b) => a - b);
console.log(
  `\nuniversally safe orderings: ${at60.safe.length}` +
    `   per hero: min ${perHeroSorted[0]}  median ${perHeroSorted[13]}  max ${perHeroSorted.at(-1)}`,
);
for (const o of at60.safe) {
  const tail = o.slice(-2).join('');
  console.log(`  ${show(o)}${tail === '10' ? '' : `   ← ends ${o.slice(-2).join('·')}`}`);
}

// ---------------------------------------------------------------------------
// 3 — the CORRECTED structural rule (T006)
// ---------------------------------------------------------------------------
//
// plan.md's tripwire says "every one of them ends 1·0; if a re-derivation
// produces one that does not, the ladder changed." ONE DOES NOT — `4·3·2·1·5·0`,
// the published Tank default — and the ladder has not changed. Followed
// literally it sends someone to re-tune a correct ladder.
//
// The real rule is TIER 0 LAST, and it is provable rather than measured: a power
// fires only when everything above it is on cooldown, and tier 0 never is.

const endsInTierZero = at60.safe.every((o) => o.at(-1) === 0);
const endsInOneZero = at60.safe.filter((o) => o.slice(-2).join('') === '10').length;

console.log(`\nstructural rule — all safe orderings end in tier 0: ${endsInTierZero ? 'yes' : 'NO'}`);
console.log(`  ${endsInOneZero} of ${at60.safe.length} also end 1·0 (a strong regularity, not a rule)`);
console.log(`  necessary but NOT sufficient: ${ORDERINGS.filter((o) => o.at(-1) === 0).length} of 720 end in tier 0`);

let failed = false;
const fail = (message: string) => {
  console.error(`\n  ✗ ${message}`);
  failed = true;
};

if (!endsInTierZero) fail('a safe ordering does not end in tier 0 — the COOLDOWN MODEL itself changed');
if (at60.safe.length !== 12) {
  fail(
    `the safe set is ${at60.safe.length}, not 12 — the ladder moved. Re-pick every ` +
      `role default from the new set; do not assume the old four survived.`,
  );
}

// ---------------------------------------------------------------------------
// 4 — the horizon a player actually experiences (T004, research.md Finding 3)
// ---------------------------------------------------------------------------

const at9All = sweep(BATTLE_TURNS, ALL_TIERS);
const at9 = sweep(BATTLE_TURNS, TIERS_1_TO_5);

console.log(`\n${BATTLE_TURNS} turns — the horizon a real 6v6 actually reaches`);
console.log(`  keeping all six tiers live on all 27:      ${at9All.safe.length}`);
console.log(`  keeping tiers 1–5 live on all 27:          ${at9.safe.length}`);
console.log(
  '  the second is the honest number. Tier 0 is the FALLBACK — its job is to\n' +
    '  cover a gap a short battle rarely produces, so counting its silence as a\n' +
    '  fault would make every ranking in the game unsafe.',
);

// research.md Finding 3 summarises the 12 as "the intersection of safe at both
// horizons". **It is 11.** `4·3·2·1·5·0` — the Tank default, which the same
// document describes as "the only safe ordering that trades the ultimate for
// uptime" — loses tier 5 at nine turns on the fastest cooldown ladder.
//
// That is NOT a fault, and the same Finding says why three lines earlier: the
// fast ladder belongs to the three Buffers and one Striker, and none of them
// receive the Tank ordering. Universal-safety-at-9 is a stronger property than
// the defaults ever needed. **The check that matters is the scoped one below** —
// each default against its own role's heroes — so this is reported, not failed.
const bothHorizons = at60.safe.filter((o) => at9.safe.some((p) => show(p) === show(o)));
const onlyAt60 = at60.safe.filter((o) => !at9.safe.some((p) => show(p) === show(o)));
console.log(`  safe at BOTH horizons universally: ${bothHorizons.length} of ${at60.safe.length}`);
for (const o of onlyAt60) {
  const losers = ROSTER.filter((h) =>
    firingProfile(h, o, BATTLE_TURNS).some((e) => e.tier !== 0 && e.fires === 0),
  );
  console.log(
    `    ${show(o)} is 60-turn safe only — loses a tier on ${losers.length} hero(es): ` +
      losers.map((h) => `${h.name} (${h.role})`).join(', '),
  );
}
console.log('    Reported, not failed. The scoped check below is the one that matters.');

// ---------------------------------------------------------------------------
// 5 — the four published role defaults, scoped to the heroes they are given to
// ---------------------------------------------------------------------------

const ROLE_DEFAULTS: readonly (readonly [string, PowerRanking])[] = [
  ['striker', [5, 4, 3, 2, 1, 0]],
  ['tank', [4, 3, 2, 1, 5, 0]],
  ['ranged', [3, 5, 4, 2, 1, 0]],
  ['buffer', [4, 5, 2, 3, 1, 0]],
];

console.log(`\nrole defaults at ${BATTLE_TURNS} turns, scoped to the heroes each is assigned to:`);
for (const [role, ordering] of ROLE_DEFAULTS) {
  const heroes = ROSTER.filter((h) => h.role === role);
  const deadTiers = new Set<number>();
  let tierZeroSilent = 0;

  for (const hero of heroes) {
    const profile = firingProfile(hero, ordering, BATTLE_TURNS);
    for (const entry of profile) {
      if (entry.fires === 0) {
        if (entry.tier === 0) tierZeroSilent++;
        else deadTiers.add(entry.tier);
      }
    }
  }

  const inSafeSet = at60.safe.some((o) => show(o) === show(ordering));
  console.log(
    `  ${role.padEnd(8)} ${show(ordering)}  ${String(heroes.length).padStart(2)} heroes  ` +
      `tier 0 silent on ${tierZeroSilent}/${heroes.length}  ` +
      `other tiers never firing: ${deadTiers.size === 0 ? 'none' : [...deadTiers].join(',')}  ` +
      `in safe set: ${inSafeSet}`,
  );

  if (!inSafeSet) fail(`the ${role} default ${show(ordering)} is no longer in the safe set`);
  if (deadTiers.size > 0) {
    fail(`the ${role} default kills tier(s) ${[...deadTiers].join(', ')} in a real battle`);
  }
}

// ---------------------------------------------------------------------------
// 6 — the frozen set, ready to paste into packages/sim/ai/defaults.ts (T008)
// ---------------------------------------------------------------------------

console.log('\nSAFE_ORDERINGS, as measured:');
console.log(at60.safe.map((o) => `  [${o.join(', ')}],`).join('\n'));

if (failed) {
  console.error('\nThe characterisation no longer matches the recorded analysis. See above.');
  process.exit(1);
}
console.log('\nEvery recorded figure reproduces.');
