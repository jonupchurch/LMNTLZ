/**
 * The allocation invariants (T006–T008).
 *
 * **The case that matters most is the one that looks like an error and is not:**
 * a hero sitting in all three attack squads. 3 x 6 = 18 seats drawn from 15
 * heroes, so overlap is forced. Every test here that uses three squads is
 * guarding against a future "conflict" check that would break the game and pass
 * any suite written with one squad.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAllHeroes } from '@lmntlz/content';
import { ROW_CAPACITY, SQUAD_ROWS, SQUAD_SIZE } from '../../src/db/schema/squads.js';
import {
  HeroUnavailableError,
  InvalidSquadError,
  assertAvailableForOffense,
  availableForOffense,
  defendingHeroes,
  evictionImpact,
  validateSquadShape,
  type Seat,
  type SquadShape,
} from '../../src/squads/allocation.js';

const ROSTER = getAllHeroes().map((h) => h.id);

/** Every k-subset, in order. Small enough here that a generator is overkill and clear. */
function* combinations<T>(items: readonly T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= items.length - k; i++) {
    for (const rest of combinations(items.slice(i + 1), k - 1)) {
      yield [items[i]!, ...rest];
    }
  }
}

/** Six heroes into the fixed 2 front / 3 middle / 1 back formation. */
function seatsFrom(ids: readonly string[]): Seat[] {
  if (ids.length !== 6) throw new Error('a squad is six heroes');
  return [
    { row: 'front', index: 0, heroId: ids[0]! },
    { row: 'front', index: 1, heroId: ids[1]! },
    { row: 'middle', index: 0, heroId: ids[2]! },
    { row: 'middle', index: 1, heroId: ids[3]! },
    { row: 'middle', index: 2, heroId: ids[4]! },
    { row: 'back', index: 0, heroId: ids[5]! },
  ];
}

const squad = (id: string, kind: 'defense' | 'offense', ids: readonly string[], extra: Partial<SquadShape> = {}): SquadShape => ({
  id,
  kind,
  seats: seatsFrom(ids),
  ...extra,
});

describe('all 27 are unlocked, and there is nowhere to record otherwise (SC-001)', () => {
  it('has 27 heroes, every one of them usable', () => {
    expect(ROSTER).toHaveLength(27);
    expect(new Set(ROSTER).size).toBe(27);
  });

  it('has no unlock, ownership or collection column anywhere in the schema', () => {
    /**
     * **Structural, not behavioural, because behaviour cannot prove an absence.**
     *
     * Nothing to collect is the whole competitive premise: every player has the
     * same 27, so nobody can out-roster anybody. The way that premise dies is
     * not a decision — it is one `owned` column added for a reasonable-sounding
     * reason, and then a feature that reads it.
     *
     * `progression` and `runes` are deliberately NOT on this list. Progression
     * exists (feature 010); what must not exist is progression that gates *which
     * heroes you may field*.
     */
    const FORBIDDEN = [
      'unlocked',
      'unlock_at',
      'owned',
      'ownership',
      'acquired',
      'collected',
      'collection',
      'obtained',
      'recruited',
      'shards_to_unlock',
      'hero_copies',
      'duplicates',
    ];

    const dir = join(import.meta.dirname, '../../src/db/schema');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      // Comments stripped: this file's own prose explains what must not exist,
      // and a scan that reads prose flags the explanation.
      const source = readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const word of FORBIDDEN) {
        expect(source.toLowerCase(), `${file} has a "${word}" column — the roster is not a collection`).not.toContain(word);
      }
    }
  });

  it('leaves exactly fifteen once twelve are committed (SC-002)', () => {
    const visible = squad('sv', 'defense', ROSTER.slice(0, 6), { zone: 'visible' });
    const hidden = squad('sh', 'defense', ROSTER.slice(6, 12), { zone: 'hidden' });

    const free = availableForOffense(ROSTER, [visible, hidden]);
    expect(free).toHaveLength(15);
    expect(ROSTER.length - 12).toBe(15);

    // And 15 is genuinely short: three squads of six need eighteen seats.
    expect(free.length).toBeLessThan(3 * 6);
  });
});

describe('a squad is exactly 2 front, 3 middle, 1 back', () => {
  it('accepts the legal formation', () => {
    expect(() => validateSquadShape(seatsFrom(ROSTER.slice(0, 6)))).not.toThrow();
  });

  it('rejects the wrong number of heroes with the count in the message', () => {
    const five = seatsFrom(ROSTER.slice(0, 6)).slice(0, 5);
    expect(() => validateSquadShape(five)).toThrow(InvalidSquadError);
    try {
      validateSquadShape(five);
    } catch (err) {
      expect((err as InvalidSquadError).code).toBe('wrong-size');
      expect((err as InvalidSquadError).status).toBe(422);
      expect((err as InvalidSquadError).detail).toContain('5');
    }
  });

  it('rejects two heroes in one seat', () => {
    // Six heroes, but both of the last two sit in `back:0`. Asserting the CODE
    // rather than the message, because an earlier version of this test claimed
    // to be exercising the row-count check and was in fact being caught here.
    const wrong: Seat[] = [
      { row: 'front', index: 0, heroId: ROSTER[0]! },
      { row: 'front', index: 1, heroId: ROSTER[1]! },
      { row: 'middle', index: 0, heroId: ROSTER[2]! },
      { row: 'middle', index: 1, heroId: ROSTER[3]! },
      { row: 'back', index: 0, heroId: ROSTER[4]! },
      { row: 'back', index: 0, heroId: ROSTER[5]! },
    ];
    try {
      validateSquadShape(wrong);
      throw new Error('accepted two heroes in one seat');
    } catch (err) {
      expect((err as InvalidSquadError).code).toBe('duplicate-seat');
    }
  });

  it('makes wrong row counts structurally impossible, which is why none is tested', () => {
    // **The row-count branch in allocation.ts is unreachable and stays anyway.**
    // ROW_CAPACITY sums to SQUAD_SIZE, so there are exactly six legal positions
    // and six distinct in-bounds seats must occupy all of them. Enumerated here
    // rather than asserted in prose, so that the day somebody changes a capacity
    // this test fails and says what it was relying on.
    const positions = SQUAD_ROWS.flatMap((row) =>
      Array.from({ length: ROW_CAPACITY[row] }, (_, i) => ({ row, index: i })),
    );
    expect(positions).toHaveLength(SQUAD_SIZE);

    let wrongCounts = 0;
    for (const combo of combinations(positions, SQUAD_SIZE)) {
      const counts: Record<string, number> = { front: 0, middle: 0, back: 0 };
      for (const p of combo) counts[p.row] = (counts[p.row] ?? 0) + 1;
      if (SQUAD_ROWS.some((r) => counts[r] !== ROW_CAPACITY[r])) wrongCounts += 1;
    }
    expect(wrongCounts, 'the row-count check has become reachable — write a test for it').toBe(0);
  });

  it('rejects a seat index the row does not have', () => {
    const seats = seatsFrom(ROSTER.slice(0, 6));
    seats[5] = { row: 'back', index: 1, heroId: ROSTER[5]! }; // back holds one
    expect(() => validateSquadShape(seats)).toThrow(InvalidSquadError);
  });

  it('rejects the same hero twice in one squad', () => {
    const seats = seatsFrom(ROSTER.slice(0, 6));
    seats[3] = { row: 'middle', index: 1, heroId: ROSTER[0]! };
    try {
      validateSquadShape(seats);
      throw new Error('accepted a duplicate hero');
    } catch (err) {
      expect((err as InvalidSquadError).code).toBe('duplicate-hero');
    }
  });

  it('rejects a hero the roster does not have', () => {
    // `hero_id` is deliberately not a foreign key — the roster is generated
    // content, not a table — so this IS the referential check.
    const seats = seatsFrom(ROSTER.slice(0, 6));
    seats[0] = { row: 'front', index: 0, heroId: 'h99' };
    try {
      validateSquadShape(seats);
      throw new Error('accepted an unknown hero');
    } catch (err) {
      expect((err as InvalidSquadError).code).toBe('unknown-hero');
    }
  });
});

describe('defense takes a hero out of offense entirely', () => {
  const visible = squad('sv', 'defense', ROSTER.slice(0, 6), { zone: 'visible' });
  const hidden = squad('sh', 'defense', ROSTER.slice(6, 12), { zone: 'hidden' });

  it('counts BOTH zones, not just the visible one', () => {
    // A rule written against the Visible squad passes every one-zone test, and
    // Hidden is the squad nobody is looking at.
    const committed = defendingHeroes([visible, hidden]);
    expect(committed.size).toBe(12);
    expect(committed.has(ROSTER[8]!)).toBe(true);
  });

  it('leaves exactly 15 for offense', () => {
    expect(availableForOffense(ROSTER, [visible, hidden])).toHaveLength(15);
  });

  it('names the zone, because "cannot attack" is not actionable', () => {
    try {
      assertAvailableForOffense([ROSTER[8]!], [visible, hidden]);
      throw new Error('a hidden defender was allowed to attack');
    } catch (err) {
      expect(err).toBeInstanceOf(HeroUnavailableError);
      expect((err as HeroUnavailableError).zone).toBe('hidden');
      expect((err as HeroUnavailableError).status).toBe(409);
    }
  });

  it('permits the 15 that are free', () => {
    expect(() => assertAvailableForOffense(ROSTER.slice(12, 18), [visible, hidden])).not.toThrow();
  });
});

describe('attack squads MUST be able to overlap', () => {
  it('accepts one hero in all three squads', () => {
    // **The forced case, not an edge case.** 3 x 6 = 18 seats from 15 heroes.
    // A uniqueness rule across offense squads would reject this and make a full
    // roster unbuildable — while passing every test that uses one squad.
    const pool = ROSTER.slice(12);
    expect(pool).toHaveLength(15);

    const shared = pool[0]!;
    const a = squad('a', 'offense', [shared, ...pool.slice(1, 6)], { slotIndex: 0 });
    const b = squad('b', 'offense', [shared, ...pool.slice(6, 11)], { slotIndex: 1 });
    const c = squad('c', 'offense', [shared, ...pool.slice(11, 15), pool[1]!], { slotIndex: 2 });

    for (const s of [a, b, c]) expect(() => validateSquadShape(s.seats)).not.toThrow();

    const visible = squad('sv', 'defense', ROSTER.slice(0, 6), { zone: 'visible' });
    const hidden = squad('sh', 'defense', ROSTER.slice(6, 12), { zone: 'hidden' });
    expect(() => assertAvailableForOffense([shared], [visible, hidden, a, b, c])).not.toThrow();
  });
});

describe('eviction reports EVERY affected squad', () => {
  const pool = ROSTER.slice(12);
  const shared = pool[0]!;
  const a = squad('a', 'offense', [shared, ...pool.slice(1, 6)], { slotIndex: 0, name: 'Vanguard' });
  const b = squad('b', 'offense', [shared, ...pool.slice(6, 11)], { slotIndex: 1, name: 'Second Wind' });
  const c = squad('c', 'offense', [shared, ...pool.slice(11, 15), pool[1]!], { slotIndex: 2, name: 'Long Reach' });
  const visible = squad('sv', 'defense', ROSTER.slice(0, 6), { zone: 'visible' });

  it('names all three, never "and 2 others"', () => {
    // Truncation is what makes a player discover the third squad mid-battle.
    const impact = evictionImpact(shared, [visible, a, b, c], ROSTER.length);

    expect(impact.squads).toHaveLength(3);
    expect(impact.squads.map((s) => s.name)).toEqual(['Vanguard', 'Second Wind', 'Long Reach']);
    for (const s of impact.squads) {
      expect(s.remaining).toBe(5);
      expect(s.wasReady).toBe(true);
    }
  });

  it('states the remaining pool, which is why this keeps happening', () => {
    // 27 roster - 6 already defending - this one = 20. The sentence
    // "you have N left for 3 squads of 6" is the only thing that makes the
    // constraint legible; no per-squad message conveys it.
    const impact = evictionImpact(shared, [visible, a, b, c], ROSTER.length);
    expect(impact.poolAfter).toBe(27 - 6 - 1);
    expect(impact.squadsNeeded).toBe(3);
    expect(impact.squadSize).toBe(6);
  });

  it('is empty for a hero in no attack squad, rather than throwing', () => {
    const impact = evictionImpact(pool[14]!, [visible, a, b], ROSTER.length);
    expect(impact.squads).toEqual([]);
  });

  it('does not perform the move — the warning comes first', () => {
    // Eviction is destructive and non-obvious, so it is a confirmation shown
    // BEFORE anything commits. A function that computed and applied at once
    // would make that impossible to render.
    const before = a.seats.length;
    evictionImpact(shared, [visible, a, b, c], ROSTER.length);
    expect(a.seats).toHaveLength(before);
  });
});
