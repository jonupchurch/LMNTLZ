/**
 * **"I'm noticing healing doesn't always work"** — reported from live play,
 * 2026-08-01.
 *
 * It always worked. The event line printed `outcome.damage` for anything that
 * landed, and a heal lands with `hit: true, damage: 0, healing: N` — so every
 * heal in the game, however large, was reported as `0`. The health bar moved,
 * because the server had been right the whole time; the only written account of
 * what happened said nothing had.
 *
 * ### There were two copies of the formatter and they were identical
 *
 * `describe()` and an inline expression inside `EventLog` — same logic, twice.
 * Fixing one and shipping would have left the *other* half of the screen still
 * printing zeroes, which is this project's recurring wound: a fix applied to one
 * caller of two is half deployed. There is one function now, and these tests
 * exercise it directly rather than through either call site.
 */

import { describe, expect, it } from 'vitest';
import { describeEvent } from '../../src/features/battle/BattleScreen.js';
import type { TurnEvent } from '../../src/features/battle/types.js';

const event = (outcome: Partial<TurnEvent['outcome']>, over: Partial<TurnEvent> = {}): TurnEvent => ({
  actorInstanceId: 'a-middle-1',
  powerId: 'mend',
  targetInstanceId: 'a-front-0',
  source: 'player',
  outcome: {
    hit: true,
    crit: false,
    damage: 0,
    healing: 0,
    overheal: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
    ...outcome,
  },
  ...over,
});

describe('a heal is reported as a heal', () => {
  /** The reported bug, stated as an assertion. */
  it('never prints a heal as damage', () => {
    const line = describeEvent(event({ healing: 240 }));

    expect(line, 'a 240-point heal read as "0"').not.toMatch(/: 0$/);
    expect(line).toMatch(/240/);
  });

  it('names the amount restored', () => {
    expect(describeEvent(event({ healing: 240 }))).toBe('a-middle-1 → a-front-0: +240 healed');
  });

  /**
   * The other half of *"doesn't ALWAYS work"*. A heal on a full-health ally
   * genuinely restores nothing — correct behaviour, a wasted turn, and
   * indistinguishable from a broken heal until `overheal` existed.
   */
  it('distinguishes a wasted heal from a broken one', () => {
    const wasted = describeEvent(event({ healing: 0, overheal: 180 }));

    expect(wasted).toBe('a-middle-1 → a-front-0: already at full health');
    expect(wasted, 'a wasted heal still read as damage').not.toMatch(/: 0$/);
  });

  it('prefers the amount restored when a party heal did both', () => {
    /* One ally topped up, another already full: the restored total wins the
       line, because that is the part the player acted for. */
    expect(describeEvent(event({ healing: 90, overheal: 150 }))).toMatch(/\+90 healed/);
  });
});

describe('everything else still reads the way it did', () => {
  it('prints damage', () => {
    expect(describeEvent(event({ damage: 214 }, { targetInstanceId: 'd-front-1' }))).toBe(
      'a-middle-1 → d-front-1: 214',
    );
  });

  it('marks a crit', () => {
    expect(describeEvent(event({ damage: 428, crit: true }))).toMatch(/428 crit$/);
  });

  it('prints a miss', () => {
    expect(describeEvent(event({ hit: false }))).toMatch(/miss$/);
  });

  it('prints a pass', () => {
    expect(describeEvent(event({}, { powerId: null, targetInstanceId: null }))).toBe(
      'a-middle-1 passed',
    );
  });

  /**
   * ⚠️ **A replay recorded before 2026-08-01 has no `overheal` and never can.**
   * Constitution XVI: a replay is played back verbatim, never re-simulated, so
   * the field cannot be backfilled. An old recording of a wasted heal therefore
   * still prints `0` — the honest answer, because the information was never
   * captured. What must NOT happen is a crash or an `undefined` on screen.
   */
  it('survives an old replay that predates the field', () => {
    const old = event({ healing: 0 });
    const { overheal: _dropped, ...withoutField } = old.outcome;
    const line = describeEvent({ ...old, outcome: withoutField } as TurnEvent);

    expect(line).toBe('a-middle-1 → a-front-0: 0');
    expect(line).not.toMatch(/undefined|NaN/);
  });
});
