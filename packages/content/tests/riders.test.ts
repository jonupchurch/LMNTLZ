/**
 * Every power is accounted for (020 T017 · FR-018).
 *
 * ### The distinction this file protects
 *
 * `riders: []` means **"this power deliberately carries no rider"**. Being absent
 * from `tools/power-riders.json` means **"nobody has read this prompt yet"**. Those
 * are different facts, and if they are allowed to look the same then the authoring
 * job can never be checked — a half-finished pass and a complete one produce
 * identical data.
 *
 * The build already fails in both directions. These tests assert the *result*, so
 * a future change to the build cannot quietly relax it.
 *
 * ### Why a count is asserted at all
 *
 * A test that only says "every power has a `riders` array" passes against a build
 * that emits `[]` for all 87 — which is precisely the pre-020 state. So the counts
 * below are deliberately specific: they fail if a rider is dropped, and they fail
 * if somebody "fixes" a build error by defaulting to empty.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, type Power } from '../src/index.js';
import { STAT_KEYS } from '../src/schema.js';

/** Every distinct active power on the roster, by id. */
const POWERS: readonly Power[] = [
  ...new Map(getAllHeroes().flatMap((h) => h.powers.map((p) => [p.id, p] as const))).values(),
];

const carrying = POWERS.filter((p) => p.riders.length > 0);

describe('the rider census', () => {
  it('covers all 87 distinct active powers', () => {
    expect(POWERS).toHaveLength(87);
    for (const power of POWERS) {
      expect(Array.isArray(power.riders), `${power.id} has no riders array`).toBe(true);
    }
  });

  /**
   * **The assertion that makes the rest non-vacuous.** Before 020 every power
   * carried nothing; a suite that could not tell that apart from a finished
   * authoring pass would be measuring the shape and not the work.
   */
  it('a substantial share of the roster actually carries one', () => {
    expect(carrying.length).toBeGreaterThanOrEqual(40);
    expect(carrying.length).toBeLessThan(POWERS.length);
  });

  /**
   * The eight tier-0 autos say so in their own prompt text — *"no status effect"*,
   * *"no rider"*. A rider appearing on one is a mis-keyed entry, and it would be
   * a real balance change: the auto-attack is the one power with no cooldown.
   */
  it('no tier-0 auto-attack carries a rider', () => {
    for (const power of POWERS.filter((p) => p.tier === 0)) {
      expect(power.riders, `${power.id} is an auto and must carry nothing`).toEqual([]);
    }
  });
});

describe('every rider is well-formed', () => {
  const all = POWERS.flatMap((p) => p.riders.map((r) => [p, r] as const));

  it('names a stat when it applies a buff, debuff or shred', () => {
    for (const [power, rider] of all) {
      if (rider.op !== 'apply') continue;
      if (!['buff', 'debuff', 'shred'].includes(rider.kind)) continue;
      expect(rider.stat, `${power.id}: an applied ${rider.kind} needs a stat`).not.toBeNull();
      expect(STAT_KEYS as readonly string[]).toContain(rider.stat);
    }
  });

  /**
   * A strip takes buffs away without caring which stat they raised. Requiring one
   * would force an author to name a stat arbitrarily and the engine to ignore it —
   * which is how a field starts lying.
   */
  it('names no stat when it removes an effect', () => {
    for (const [power, rider] of all) {
      if (rider.op === 'remove') {
        expect(rider.stat, `${power.id}: a removal must not name a stat`).toBeNull();
      }
    }
  });

  it('carries a band for shred and only for shred', () => {
    for (const [power, rider] of all) {
      if (rider.kind === 'shred' && rider.op === 'apply') {
        expect(rider.band, `${power.id}: shred needs a band`).not.toBeNull();
      } else {
        expect(rider.band, `${power.id}: only shred carries a band`).toBeNull();
      }
    }
  });

  /**
   * **Constitution XV, enforced rather than trusted.** Magnitude and duration
   * derive from the applying power's tier, so the authored file must not be able
   * to carry one. `powerSchema` is strict, so an extra key is rejected at build
   * time — this asserts the shipped data has exactly the four fields and nothing
   * that looks like a number somebody typed.
   */
  it('carries no magnitude or duration of its own', () => {
    for (const [power, rider] of all) {
      expect(
        Object.keys(rider).sort(),
        `${power.id}: a rider carries only kind, stat, at, op, band`,
      ).toEqual(['at', 'band', 'kind', 'op', 'stat']);
    }
  });
});

describe('what the roster actually applies', () => {
  /**
   * Spot checks against the authored prompt text, so a mis-keyed entry is caught
   * by *meaning* and not only by shape. Chosen because each is the head of a
   * family the engine treats differently.
   */
  const riderOf = (id: string) => POWERS.find((p) => p.id === id)!.riders;

  it('reads Root and Hold as a slow', () => {
    expect(riderOf('Root and Hold')).toEqual([
      { kind: 'debuff', stat: 'speed', at: 'target', op: 'apply', band: null },
    ]);
  });

  it('reads Wear the Stone as a 20% Armor shred', () => {
    expect(riderOf('Wear the Stone')).toEqual([
      { kind: 'shred', stat: 'armor', at: 'target', op: 'apply', band: 'small' },
    ]);
  });

  /**
   * **`at: 'self'` on a power that targets an enemy.** Most buffs in this roster
   * ride an attack; the power still aims at the enemy and only the buff comes
   * home. Marking such a power `friendly` would aim a damaging strike at an ally.
   */
  it('lands the tier-3 House buffs on the caster, not the struck hero', () => {
    for (const id of [
      'The Bloom Lends Heat',
      'The Silence Lends Cover',
      'The Word Lends Sight',
      'The Tide Lends Patience',
      'The Sky Lends Swiftness',
      'The Deep Lends Weight',
    ]) {
      const power = POWERS.find((p) => p.id === id)!;
      expect(power.friendly, `${id} aims at an enemy`).toBe(false);
      expect(power.riders).toHaveLength(1);
      expect(power.riders[0]!.at, `${id} buffs the caster`).toBe('self');
      expect(power.riders[0]!.kind).toBe('buff');
    }
  });

  it("reads Light's identity as removing fade", () => {
    expect(riderOf('Nothing Hidden')).toEqual([
      { kind: 'fade', stat: null, at: 'target', op: 'remove', band: null },
    ]);
  });

  it('reads the two taunting ultimates as taunting their own caster', () => {
    for (const id of ['The Bulwark Holds', 'Last Light on the Wall']) {
      const taunt = riderOf(id).find((r) => r.kind === 'taunt');
      expect(taunt, `${id} applies taunt`).toBeDefined();
      expect(taunt!.at).toBe('self');
    }
  });

  /**
   * The one control rider in the roster. `05-status.md` prices control separately
   * and warns it should never scale, so a second silence or a stun appearing here
   * is a balance change that should be argued rather than absorbed.
   */
  it('holds exactly one control rider across all 87 powers', () => {
    const control = POWERS.flatMap((p) =>
      p.riders.filter((r) => r.kind === 'stun' || r.kind === 'silence').map(() => p.id),
    );
    expect(control).toEqual(['The Still Pool Closes']);
  });
});
