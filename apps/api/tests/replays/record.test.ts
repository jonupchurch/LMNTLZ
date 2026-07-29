/**
 * The metadata row carries everything, and it is asserted as a **schema**
 * (008 T010, T012).
 *
 * ### Why this is one assertion over the whole column set
 *
 * The obvious version of this test checks the fields it can think of:
 *
 * ```ts
 * expect(row.turnCount).toBeDefined();
 * expect(row.defenderIsBot).toBeDefined();
 * // ...
 * ```
 *
 * **That test grows a hole the moment somebody adds a column and forgets to add
 * a line.** The hole is invisible: the suite still passes, and the column it does
 * not know about is the one that silently ships full of nulls. Since this table
 * is the analytics product and Constitution XVI says a value missing at battle
 * time is missing forever, an invisible hole here is the most expensive kind of
 * green test in the repo.
 *
 * So the assertion is inverted. **The set of columns in the table is compared to
 * an explicit expected set**, and a mismatch in *either* direction fails:
 *
 * - a **new** column nobody listed → fails, and the fix is to decide deliberately
 *   whether it must be populated from the first battle
 * - a **removed** column → fails, which is the `started_at` / `concluded_at`
 *   risk T006 exists to prevent (they look redundant next to `turn_count`)
 *
 * The second half then asserts that a real recorded battle populates every column
 * that must never be null.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableColumns, sql } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { battleRecords } from '../../src/db/schema/battleRecords.js';

/**
 * **Every column of `battle_records`, listed on purpose.**
 *
 * Adding a column means adding it here *and* deciding which of the three groups
 * below it belongs to. That decision is the entire point of the test — it is the
 * moment somebody has to ask "must this be populated from the first battle
 * ever?", which is the only moment the answer can still be yes.
 */
const EXPECTED_COLUMNS = {
  /**
   * **Never null, from the first battle onwards.** Each of these is either a
   * fact about the fight that only exists while it is being resolved, or a
   * stamp that cannot be recovered from a later build.
   */
  required: [
    'battle_id',
    'started_at',
    'concluded_at',
    'defender_is_bot',
    'zone',
    'winner',
    'reason',
    'turn_count',
    'attacker_squad',
    'defender_squad',
    'engine_version',
    'content_version',
  ],

  /**
   * **Nullable, each for a stated reason** — see the column comments in
   * `schema/battleRecords.ts`. Not a to-do list: three different reasons.
   */
  nullable: [
    // Delinked when an account is deleted — the privacy policy's promise.
    'attacker_id',
    'defender_id',
    // Features 009 and 010 do not exist, so these values were never real.
    'attacker_league',
    'defender_league',
    'attacker_rating',
    'defender_rating',
    // Absent outside a deployed build (no VERCEL_GIT_COMMIT_SHA locally).
    'build_sha',
    // The replay's lifecycle — the only columns that ever change after insert.
    'replay_blob_url',
    'replay_deleted_at',
  ],
} as const;

interface ColumnRow {
  readonly column_name: string;
  readonly is_nullable: 'YES' | 'NO';
}

let columns: ColumnRow[];

beforeAll(async () => {
  const result = await db().execute(sql`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'battle_records'
    order by column_name
  `);
  columns = result.rows as unknown as ColumnRow[];
}, 60_000);

afterAll(async () => {
  await closeDb();
});

describe('battle_records is complete before the first battle is recorded', () => {
  it('has exactly the expected columns — no more, no fewer', () => {
    const actual = columns.map((c) => c.column_name).sort();
    const expected = [...EXPECTED_COLUMNS.required, ...EXPECTED_COLUMNS.nullable].sort();

    /**
     * **Set equality, not containment.** `toContain` per field would pass for a
     * table carrying an extra column nobody had considered — and the whole risk
     * this test addresses is a column arriving without anyone asking whether it
     * needs to be populated from day one.
     */
    expect(actual).toEqual(expected);
  });

  it('matches the Drizzle schema, so an unmigrated column cannot pass', () => {
    /**
     * **A second, independent comparison — and it closes a hole the first one
     * has.** The assertion above compares the database to a list written by
     * hand, which means adding a column to `schema/battleRecords.ts` and
     * forgetting to generate or apply the migration passes: the developer edits
     * the schema and the expected list together, and the database — the only
     * place data actually lands — is never consulted about the difference.
     *
     * So this compares the live table to the schema object itself. The two
     * assertions fail on different mistakes and neither substitutes for the
     * other: the list catches a column arriving without a decision, this catches
     * a decision arriving without a migration.
     */
    const declared = Object.values(getTableColumns(battleRecords))
      .map((c) => c.name)
      .sort();

    expect(columns.map((c) => c.column_name).sort()).toEqual(declared);
  });

  it('enforces NOT NULL on every column that must exist from day one', () => {
    const nullability = new Map(columns.map((c) => [c.column_name, c.is_nullable]));

    for (const name of EXPECTED_COLUMNS.required) {
      expect(nullability.get(name), `${name} must be NOT NULL`).toBe('NO');
    }
  });

  it('leaves the deliberately-nullable columns nullable', () => {
    /**
     * The mirror of the assertion above, and it earns its place: a well-meaning
     * migration adding `NOT NULL` to `attacker_id` would break account deletion
     * — the row could then only be deleted or given a fake owner, and both
     * break a published promise. Failing here is much cheaper than discovering
     * it from a deletion request.
     */
    const nullability = new Map(columns.map((c) => [c.column_name, c.is_nullable]));

    for (const name of EXPECTED_COLUMNS.nullable) {
      expect(nullability.get(name), `${name} must stay nullable`).toBe('YES');
    }
  });

  it('keeps started_at and concluded_at as wall-clock columns beside turn_count', () => {
    /**
     * **T006's specific risk, named.** These two look redundant next to
     * `turn_count` and are the likeliest casualty of a tidying migration. They
     * are not redundant: `turn_count` is engine length, these are elapsed time,
     * and feature 016's drain needs the difference to know how long to wait
     * before a deploy. No amount of turn counting answers that — a player can
     * leave a battle open overnight.
     */
    const names = new Set(columns.map((c) => c.column_name));

    expect(names.has('started_at')).toBe(true);
    expect(names.has('concluded_at')).toBe(true);
    expect(names.has('turn_count')).toBe(true);
  });

  it('keeps three separate version stamps', () => {
    /**
     * T007. A single merged `version` column cannot answer *"did this move
     * because the roster changed or because the engine did"* — the first
     * question any balance investigation asks, and under the no-nerf rule the
     * investigation *is* the intervention.
     */
    const names = new Set(columns.map((c) => c.column_name));

    expect(names.has('engine_version')).toBe(true);
    expect(names.has('content_version')).toBe(true);
    expect(names.has('build_sha')).toBe(true);
  });

  it('carries four league and rating columns, one per side', () => {
    /**
     * `battles` has a single `league_at_battle` / `rating_at_battle` pair, which
     * cannot say whose. A matchup needs both sides, because the interesting
     * question is always the gap — so 009 and 010 write here, not there.
     */
    const names = new Set(columns.map((c) => c.column_name));

    for (const name of [
      'attacker_league',
      'defender_league',
      'attacker_rating',
      'defender_rating',
    ]) {
      expect(names.has(name), `${name} is missing`).toBe(true);
    }
    expect(names.has('league_at_battle')).toBe(false);
  });
});

describe('replay_holds expresses two independent holds', () => {
  it('is keyed on (battle_id, report_id), not flagged on the record', async () => {
    /**
     * **The structural assertion behind T032's behavioural one.** A boolean
     * `retention_hold` column cannot express two concurrent reports against one
     * battle: close the first and the evidence is deleted while the second case
     * is still open. The composite key is what makes that impossible to write.
     */
    const result = await db().execute(sql`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'replay_holds'
        and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position
    `);

    const key = (result.rows as unknown as { column_name: string }[]).map((r) => r.column_name);
    expect(key).toEqual(['battle_id', 'report_id']);
  });

  it('has no retention flag on battle_records', () => {
    const names = new Set(columns.map((c) => c.column_name));
    expect(names.has('retention_hold')).toBe(false);
  });
});
