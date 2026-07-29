/**
 * **An unconfigured defense must be competent, not incoherent.**
 *
 * Most players will never open these controls. A squad that flails is a squad
 * whose owner loses holds they would have kept and never learns why — and since
 * all 27 heroes are unlocked from the start, a bad default is the one thing in
 * the game that can make two identical rosters unequal.
 *
 * Two parts, at two horizons, and both are needed:
 *
 * - **Part one** is the 60-turn claim `07-defense-ai.md` actually makes: 12
 *   orderings × 27 heroes = 324 cases, every power firing at least once. It is
 *   the fast CI stand-in for the 19,440-pair sweep, which stays offline.
 * - **Part two** is the assertion that describes a real game: each role default
 *   against **only its own role's heroes** at **9 turns**, where tiers 1–5 must
 *   all fire and tier 0 may be silent, being the fallback.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, type Role } from '@lmntlz/content';
import {
  BATTLE_TURNS,
  LIVE_SHARE_THRESHOLD,
  SWEEP_TURNS,
  firingProfile,
  isSafeOrdering,
} from '../../rules/firingProfile.js';
import {
  ROLE_DEFAULTS,
  SAFE_ORDERINGS,
  defaultConfigFor,
  resolveConfig,
  roleDefaults,
  safeOrderings,
} from '../../ai/defaults.js';

const ROSTER = getAllHeroes();

// ---------------------------------------------------------------------------
// Part one — the recorded 60-turn property (T025)
// ---------------------------------------------------------------------------

describe('the 12 universally safe orderings, at 60 turns', () => {
  it('is exactly 12, each a permutation of the six tiers', () => {
    expect(SAFE_ORDERINGS).toHaveLength(12);
    expect(safeOrderings()).toBe(SAFE_ORDERINGS);

    for (const ordering of SAFE_ORDERINGS) {
      expect([...ordering].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
    expect(new Set(SAFE_ORDERINGS.map((o) => o.join(','))).size).toBe(12);
  });

  it('keeps every power firing on all 27 heroes — 324 cases', () => {
    let checked = 0;

    for (const ordering of SAFE_ORDERINGS) {
      for (const hero of ROSTER) {
        const profile = firingProfile(hero, ordering, SWEEP_TURNS);

        for (const entry of profile) {
          expect(
            entry.share,
            `${hero.name} under ${ordering.join('·')}: tier ${entry.tier} is dead`,
          ).toBeGreaterThanOrEqual(LIVE_SHARE_THRESHOLD);
        }
        checked++;
      }
    }

    expect(checked).toBe(324);
  });

  it('ends every one of them in tier 0 — the corrected structural rule', () => {
    // `07-defense-ai.md` states the rule as "every one of them ends 1·0".
    // ELEVEN do. The twelfth is `4·3·2·1·5·0`, that same document's published
    // Tank default. Tier 0 last is the real rule, and unlike the `1·0` pattern
    // it is provable: a power fires only when everything above it is on
    // cooldown, and tier 0 — cooldown 0, no gate — never is.
    for (const ordering of SAFE_ORDERINGS) {
      expect(ordering.at(-1), `${ordering.join('·')} does not end in tier 0`).toBe(0);
    }

    const endInOneZero = SAFE_ORDERINGS.filter((o) => o.slice(-2).join('') === '10');
    expect(endInOneZero).toHaveLength(11);
    expect(SAFE_ORDERINGS.find((o) => o.slice(-2).join('') !== '10')).toEqual([4, 3, 2, 1, 5, 0]);
  });

  it('is necessary but not sufficient — ending in tier 0 does not make an ordering safe', () => {
    // A guard against someone deriving the safe set from the rule rather than
    // from the sweep. 120 of 720 orderings end in tier 0; only 12 are safe.
    const dead = firingProfile(ROSTER[0]!, [1, 2, 3, 4, 5, 0], SWEEP_TURNS);
    expect(dead.some((e) => e.share < LIVE_SHARE_THRESHOLD)).toBe(true);
  });

  it('switches powers off under the worst legal ranking, on every hero', () => {
    // `1·2·3·4·5·0` — the quickstart's manual check. Both ultimates dead.
    for (const hero of ROSTER) {
      const profile = firingProfile(hero, [1, 2, 3, 4, 5, 0], BATTLE_TURNS);
      expect(profile.find((e) => e.tier === 5)!.fires).toBe(0);
      expect(profile.find((e) => e.tier === 4)!.fires).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Part two — the assertion that describes a real game (T026)
// ---------------------------------------------------------------------------

describe('the four role defaults, at battle length', () => {
  const ROLES: readonly Role[] = ['striker', 'tank', 'ranged', 'buffer'];

  it('draws every default ranking from the safe set (FR-014, FR-015)', () => {
    for (const role of ROLES) {
      const { ranking } = roleDefaults(role);
      expect(
        SAFE_ORDERINGS.some((o) => o.join(',') === ranking.join(',')),
        `the ${role} default ${ranking.join('·')} is not in the safe set`,
      ).toBe(true);
    }
  });

  it.each(ROLES)(
    'keeps every tier 1–5 firing for every %s, at 9 turns',
    (role) => {
      const heroes = ROSTER.filter((h) => h.role === role);
      expect(heroes.length).toBeGreaterThan(0);

      for (const hero of heroes) {
        const profile = firingProfile(hero, roleDefaults(role).ranking, BATTLE_TURNS);

        for (const tier of [1, 2, 3, 4, 5]) {
          expect(
            profile.find((e) => e.tier === tier)!.fires,
            `${hero.name} (${role}) never fires tier ${tier} in a real battle`,
          ).toBeGreaterThan(0);
        }
      }
    },
  );

  it('fires every hero its ultimate at least once, under its own default', () => {
    // The claim Phase 0 verified, and the one that matters most: if it stops
    // being true, a default is deleting a power IN THE GAME rather than in the
    // asymptote, and no 60-turn measurement would notice.
    for (const hero of ROSTER) {
      const profile = firingProfile(hero, roleDefaults(hero.role).ranking, BATTLE_TURNS);
      expect(
        profile.find((e) => e.tier === 5)!.fires,
        `${hero.name} (${hero.role}) never fires its ultimate`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('allows tier 0 to be silent — it is the fallback, not a power that must fire', () => {
    // At 9 turns NO ordering keeps all six live, because tier 0 is structurally
    // last and a real battle is too short for the top five to be simultaneously
    // on cooldown. Counting that as a fault would make every ranking unsafe.
    const silent = ROSTER.filter(
      (h) => firingProfile(h, roleDefaults(h.role).ranking, BATTLE_TURNS).find((e) => e.tier === 0)!.fires === 0,
    );

    expect(silent.length).toBeGreaterThan(0);
    expect(silent.length).toBeLessThan(ROSTER.length);
  });

  it('is what `isSafeOrdering` reports, so the builder and the defaults agree', () => {
    for (const hero of ROSTER) {
      expect(isSafeOrdering(hero, roleDefaults(hero.role).ranking, BATTLE_TURNS)).toBe(true);
    }
  });

  it('flags the self-defeating ranking the builder must warn about', () => {
    for (const hero of ROSTER) {
      expect(isSafeOrdering(hero, [1, 2, 3, 4, 5, 0], BATTLE_TURNS)).toBe(false);
      expect(isSafeOrdering(hero, [0, 5, 4, 3, 2, 1], BATTLE_TURNS)).toBe(false);
    }
  });

  it('records the Tank caveat rather than inheriting it', () => {
    // `4·3·2·1·5·0` is 60-turn safe and loses tier 5 at nine on the fast
    // 0·1·2·3·4·6 ladder. It holds as the Tank default only BECAUSE OF WHO GETS
    // IT — the four heroes carrying that ladder are Buffers and a Striker. A
    // future reassignment must re-check rather than assume.
    const fastLadder = ROSTER.filter((h) => h.powers.find((p) => p.tier === 5)!.cooldown === 6);

    expect(fastLadder.length).toBeGreaterThan(0);
    for (const hero of fastLadder) {
      expect(hero.role).not.toBe('tank');
      expect(firingProfile(hero, [4, 3, 2, 1, 5, 0], BATTLE_TURNS).find((e) => e.tier === 5)!.fires).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The rest of the default configuration (T028, T029, T030)
// ---------------------------------------------------------------------------

describe('the default configuration beyond the ranking', () => {
  it('gives every role a targeting pair and an ally rule', () => {
    for (const [role, cfg] of Object.entries(ROLE_DEFAULTS)) {
      expect(cfg.targeting, role).toHaveLength(2);
      expect(cfg.allyRule, role).toBe('lowest-hp-percentage');
    }
  });

  it('matches the published role table in 07-defense-ai.md', () => {
    // The defaults are not invented — three of the four role passives already
    // name the rule their role should want.
    expect(roleDefaults('striker').targeting).toEqual(['lowest-current-hp', 'nearest']);
    expect(roleDefaults('tank').targeting).toEqual(['highest-might', 'nearest']);
    expect(roleDefaults('ranged').targeting).toEqual(['furthest', 'least-mitigation']);
    expect(roleDefaults('buffer').targeting).toEqual(['lowest-current-hp', 'nearest']);
  });

  it('defaults the ally rule to lowest HP PERCENTAGE, not lowest current HP', () => {
    // Pools run 1,250–2,000, so a Tank at 1,300 of 2,000 — 65%, in real trouble
    // — holds more current HP than an untouched Buffer at 1,250 of 1,250. A
    // "lowest current HP" heal would pass over the wounded Tank.
    const tank = ROSTER.find((h) => h.stats.toughness === 40);
    const buffer = ROSTER.find((h) => h.stats.toughness === 25);

    if (tank && buffer) {
      expect(tank.stats.toughness * 50 * 0.65).toBeGreaterThan(buffer.stats.toughness * 50);
    }

    for (const cfg of Object.values(ROLE_DEFAULTS)) {
      expect(cfg.allyRule).not.toBe('lowest-current-hp');
    }
  });

  it('omits allyRule for a champion that owns no friendly power (FR-004)', () => {
    const noHeal = ROSTER.find((h) => !h.powers.some((p) => p.friendly))!;
    const healer = ROSTER.find((h) => h.powers.some((p) => p.friendly))!;

    expect('allyRule' in defaultConfigFor(noHeal)).toBe(false);
    expect(defaultConfigFor(healer).allyRule).toBe('lowest-hp-percentage');

    // Even when one was saved — a stale rule on a champion that cannot heal is
    // a stored decision nothing will ever read.
    expect('allyRule' in resolveConfig(noHeal, { allyRule: 'most-damaged' })).toBe(false);
  });

  it('lets any explicit selection override, field by field (FR-016)', () => {
    const hero = ROSTER.find((h) => h.role === 'striker')!;
    const base = defaultConfigFor(hero);

    // A player who set a ranking and never touched targeting keeps the role's
    // targeting pair — partial configuration is the common case.
    const rankingOnly = resolveConfig(hero, { ranking: [3, 5, 4, 2, 1, 0] });
    expect(rankingOnly.ranking).toEqual([3, 5, 4, 2, 1, 0]);
    expect(rankingOnly.targeting).toEqual(base.targeting);

    const targetingOnly = resolveConfig(hero, { targeting: ['tanks-first', 'furthest'] });
    expect(targetingOnly.targeting).toEqual(['tanks-first', 'furthest']);
    expect(targetingOnly.ranking).toEqual(base.ranking);

    // And nothing saved is exactly the default.
    expect(resolveConfig(hero)).toEqual(base);
  });

  it('is frozen, so an explicit selection has to build a new config (FR-016)', () => {
    const striker = roleDefaults('striker');
    expect(Object.isFrozen(striker)).toBe(true);
    expect(() => {
      (striker as { ranking: unknown }).ranking = [0, 1, 2, 3, 4, 5];
    }).toThrow();

    // Overriding is a spread, and it leaves the shared default untouched.
    const overridden = { ...striker, targeting: ['tanks-first', 'furthest'] as const };
    expect(overridden.ranking).toEqual(striker.ranking);
    expect(roleDefaults('striker').targeting).toEqual(['lowest-current-hp', 'nearest']);
  });
});
