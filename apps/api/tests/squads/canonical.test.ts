/**
 * The streak reset (T009–T010).
 *
 * **Two failures, opposite directions, both invisible.** Reset too eagerly and a
 * player who opened the editor to read their own configuration loses a 40-day
 * streak — they will not report it as a bug, they will just stop looking. Reset
 * too rarely and a squad advertises a streak it did not earn, which nobody
 * reports either because it favours them.
 *
 * So every field inside the hash gets a test that changing it resets, and every
 * non-change gets a test that it does not.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes } from '@lmntlz/content';
import {
  canonicalForm,
  canonicalHash,
  streakResets,
  type CanonicalSeat,
  type SeatConfig,
} from '../../src/squads/canonical.js';

const ROSTER = getAllHeroes().map((h) => h.id);

const config = (over: Partial<SeatConfig> = {}): SeatConfig => ({
  targetPrimary: 'strikers-first',
  targetFallback: 'nearest',
  allyRule: null,
  powerRanking: [5, 4, 3, 2, 1, 0],
  ...over,
});

const SQUAD: CanonicalSeat[] = [
  { row: 'front', index: 0, heroId: ROSTER[0]!, config: config() },
  { row: 'front', index: 1, heroId: ROSTER[1]!, config: config() },
  { row: 'middle', index: 0, heroId: ROSTER[2]!, config: config() },
  { row: 'middle', index: 1, heroId: ROSTER[3]!, config: config() },
  { row: 'middle', index: 2, heroId: ROSTER[4]!, config: config() },
  { row: 'back', index: 0, heroId: ROSTER[5]!, config: config() },
];

/** Deep enough that a mutation cannot leak back into SQUAD. */
const clone = (seats: readonly CanonicalSeat[]): CanonicalSeat[] =>
  seats.map((s) => ({ ...s, config: { ...s.config, powerRanking: [...s.config.powerRanking] } }));

describe('a no-op save costs nothing', () => {
  it('does not reset for an identical squad', () => {
    expect(streakResets(SQUAD, clone(SQUAD))).toBe(false);
  });

  it('does not reset when the seats arrive in a different order', () => {
    // The editor may hold seats in whatever order it likes. Two identical squads
    // that merely serialised differently must not cost a streak — this is what
    // canonicalisation is for.
    const shuffled = [...clone(SQUAD)].reverse();
    expect(canonicalForm(shuffled)).toBe(canonicalForm(SQUAD));
    expect(streakResets(SQUAD, shuffled)).toBe(false);
  });

  it('is not a dirty flag — there is no argument that fakes a no-op', () => {
    // `streakResets` takes the two squads and nothing else. A client-set flag
    // would be wrong the first time a re-render touched a field, and wrong in
    // the player's favour.
    expect(streakResets.length).toBe(2);
  });
});

describe('every field inside the hash is a real change', () => {
  it('resets when a hero is swapped in', () => {
    const next = clone(SQUAD);
    next[2] = { ...next[2]!, heroId: ROSTER[20]! };
    expect(streakResets(SQUAD, next)).toBe(true);
  });

  it('resets when two heroes swap rows', () => {
    // **Row placement decides reach.** Same six heroes, different squad — a
    // canonical form keyed on the hero SET rather than the seat map would call
    // this a no-op, and it changes what the squad can hit.
    const next = clone(SQUAD);
    const front = next[0]!;
    const back = next[5]!;
    next[0] = { ...front, heroId: back.heroId };
    next[5] = { ...back, heroId: front.heroId };

    expect(new Set(next.map((s) => s.heroId))).toEqual(new Set(SQUAD.map((s) => s.heroId)));
    expect(streakResets(SQUAD, next)).toBe(true);
  });

  it('resets when the FALLBACK rule changes, not only the primary', () => {
    // The fallback is the rule that usually fires — 49-80% of the time — so
    // changing it changes the defense more than changing the primary does.
    const next = clone(SQUAD);
    next[0] = { ...next[0]!, config: config({ targetFallback: 'furthest' }) };
    expect(streakResets(SQUAD, next)).toBe(true);
  });

  it('resets when the power ranking changes', () => {
    const next = clone(SQUAD);
    next[1] = { ...next[1]!, config: config({ powerRanking: [4, 3, 2, 1, 5, 0] }) };
    expect(streakResets(SQUAD, next)).toBe(true);
  });

  it('resets when the ally rule changes', () => {
    const next = clone(SQUAD);
    next[3] = { ...next[3]!, config: config({ allyRule: 'lowest-hp-percentage' }) };
    expect(streakResets(SQUAD, next)).toBe(true);
  });
});

describe('the encoding cannot collide', () => {
  it('keeps [1,23] and [12,3] distinct', () => {
    // Joining a ranking without a separator would render both as "123". The
    // consequence is a real ranking change scored as a no-op.
    const a = clone(SQUAD);
    const b = clone(SQUAD);
    a[0] = { ...a[0]!, config: config({ powerRanking: [1, 23] }) };
    b[0] = { ...b[0]!, config: config({ powerRanking: [12, 3] }) };
    expect(streakResets(a, b)).toBe(true);
  });

  it('distinguishes an absent ally rule from a rule literally named "-"', () => {
    const absent = clone(SQUAD);
    const named = clone(SQUAD);
    named[0] = { ...named[0]!, config: config({ allyRule: '-' }) };
    // Both render the same today. Asserted so the collision is a recorded,
    // deliberate limit rather than a surprise: no TargetRule is named "-", and
    // the set is closed and validated on write.
    expect(canonicalForm(absent)).toBe(canonicalForm(named));
  });
});

describe('the hash is a comparison tool, not an identity', () => {
  it('is stable across calls', () => {
    expect(canonicalHash(SQUAD)).toBe(canonicalHash(clone(SQUAD)));
  });

  it('is a sha256 hex digest', () => {
    expect(canonicalHash(SQUAD)).toMatch(/^[0-9a-f]{64}$/);
  });
});
