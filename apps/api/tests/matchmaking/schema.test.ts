/**
 * `player_ratings` exists on Neon, with the shape 009 decided (T002, T010).
 *
 * **Asserted against `information_schema`, not against the migrator's exit code.**
 * `db:migrate` printing *"up to date"* means the journal says so; it does not mean
 * the table is there or that its columns are what the code believes. Feature 008
 * established this pattern in `replays/record.test.ts` for the same reason and it
 * is the same class of risk here.
 *
 * The two assertions worth having beyond existence are both **decisions this
 * feature took against its own task list**, and both would revert silently:
 *
 * - **`gear_score` is nullable.** Null means *never computed*, which today is every
 *   row, because 010 owns rune placement. A `NOT NULL DEFAULT 1500` would write the
 *   placeholder into the database where nobody could later tell a real Bronze
 *   player from an unmigrated one.
 * - **`attack_streak` is absent.** T002 asked for it; it already lives on
 *   `player_streaks`, whose own header warns at length against conflating the three
 *   streaks. Two columns for the one streak that feeds ambush is two sources of
 *   truth for whether a player reaches a Hidden battle at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';

const EXPECTED = {
  required: ['account_id', 'rating', 'rated_battles', 'last_activity_at', 'updated_at'],
  nullable: ['gear_score'],
} as const;

interface ColumnRow {
  readonly column_name: string;
  readonly is_nullable: 'YES' | 'NO';
  readonly column_default: string | null;
}

let columns: ColumnRow[];

beforeAll(async () => {
  const result = await db().execute(sql`
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'player_ratings'
    order by column_name
  `);
  columns = result.rows as unknown as ColumnRow[];
}, 60_000);

afterAll(async () => {
  await closeDb();
});

describe('player_ratings is on the database', () => {
  it('has exactly the expected columns — no more, no fewer', () => {
    /**
     * Set equality rather than containment, following 008: a `toContain` per field
     * passes for a table carrying an extra column nobody considered, and an
     * unconsidered column on the standing row is how the two axes get quietly
     * collapsed into a third number.
     */
    expect(columns.length, 'the migration has not been applied').toBeGreaterThan(0);

    expect(columns.map((c) => c.column_name).sort()).toEqual(
      [...EXPECTED.required, ...EXPECTED.nullable].sort(),
    );
  });

  it('keeps gear_score nullable, so null can mean never-computed', () => {
    const gearScore = columns.find((c) => c.column_name === 'gear_score');
    expect(gearScore?.is_nullable).toBe('YES');
    expect(gearScore?.column_default, 'a default would store the placeholder').toBeNull();
  });

  it('starts every account at 1000 rating and 0 rated battles', () => {
    // The same number for everyone — gear placement is handled by the Bronze
    // floor, so rating has nothing to pre-sort.
    expect(columns.find((c) => c.column_name === 'rating')?.column_default).toContain('1000');
    expect(columns.find((c) => c.column_name === 'rated_battles')?.column_default).toContain('0');
  });

  it('does not carry a second attack_streak', () => {
    expect(columns.some((c) => c.column_name === 'attack_streak')).toBe(false);
  });

  it('cascades from accounts, so a deleted account leaves no standing behind', async () => {
    /**
     * A player who deletes their account must stop being offered as an opponent.
     * An orphaned standing row would be a candidate with no defender behind it —
     * and matchmaking reads this table to build the pool.
     */
    const result = await db().execute(sql`
      select rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.table_constraints tc
        on tc.constraint_name = rc.constraint_name
       and tc.table_schema = rc.constraint_schema
      where tc.table_schema = 'public' and tc.table_name = 'player_ratings'
    `);

    const rules = (result.rows as unknown as { delete_rule: string }[]).map((r) => r.delete_rule);
    expect(rules).toEqual(['CASCADE']);
  });
});
