/**
 * The guilds tables exist on Neon, with the shape 013 decided (T003, T004).
 *
 * **Asserted against `information_schema` and `pg_indexes`, not against the
 * migrator's exit code.** `db:migrate` printing *"up to date"* means the journal
 * says so; it does not mean the table is there or that its constraints are what the
 * code believes. Features 008 and 009 established this and it matters more here,
 * because **two of these constraints are the feature** rather than hygiene:
 *
 * - **`UNIQUE (account_id)` on `guild_members`** is the lock the whole
 *   first-acceptance-wins design rests on. Dropped, every concurrency test still
 *   passes on a quiet database and a player joins two guilds under load.
 * - **`guild_invites_one_open` is PARTIAL**, `WHERE state = 'open'`. A plain
 *   three-column unique would also permit exactly one `declined` row forever, so a
 *   player who declined once could never be invited again. The constraint is about
 *   the open offer; the history is unconstrained.
 *
 * Neither would fail a query. Both would fail a player.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';

const EXPECTED_TABLES = [
  'guild_applications',
  'guild_invites',
  'guild_members',
  'guild_successions',
  'guilds',
] as const;

interface NameRow {
  readonly name: string;
}
interface DefRow {
  readonly name: string;
  readonly def: string;
}

let tables: string[];
let memberUniques: DefRow[];
let inviteIndexes: DefRow[];
let guildColumns: string[];

beforeAll(async () => {
  const t = await db().execute(sql`
    select table_name as name from information_schema.tables
     where table_schema = 'public' and table_name like 'guild%'
     order by table_name`);
  tables = (t.rows as unknown as NameRow[]).map((r) => r.name);

  const u = await db().execute(sql`
    select conname as name, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'guild_members'::regclass and contype = 'u'`);
  memberUniques = u.rows as unknown as DefRow[];

  const i = await db().execute(sql`
    select indexname as name, indexdef as def from pg_indexes
     where tablename = 'guild_invites'`);
  inviteIndexes = i.rows as unknown as DefRow[];

  const c = await db().execute(sql`
    select column_name as name from information_schema.columns
     where table_schema = 'public' and table_name = 'guilds'
     order by column_name`);
  guildColumns = (c.rows as unknown as NameRow[]).map((r) => r.name);
}, 60_000);

afterAll(async () => {
  await closeDb();
});

describe('the guilds migration landed', () => {
  it('created all five tables', () => {
    expect(tables).toEqual([...EXPECTED_TABLES]);
  });

  it('guild_members is UNIQUE on account_id ALONE — not a composite', () => {
    /**
     * The composite is the plausible wrong answer and it is worth naming: a
     * `UNIQUE (guild_id, account_id)` reads like the same rule and permits one
     * account in twenty-four guilds. **The invariant is "an account belongs to at
     * most one guild", so the constraint is on the account.**
     */
    const defs = memberUniques.map((r) => r.def.replace(/\s+/g, ' '));
    expect(defs).toHaveLength(1);
    expect(defs[0]).toBe('UNIQUE (account_id)');
  });

  it('the one-open-invite index is PARTIAL on state = open', () => {
    const found = inviteIndexes.find((r) => r.name === 'guild_invites_one_open');
    expect(found, 'guild_invites_one_open is missing').toBeDefined();
    expect(found?.def).toMatch(/UNIQUE INDEX/i);
    /** Without the WHERE it silently becomes "one decline, ever". */
    expect(found?.def).toMatch(/WHERE .*state.* = 'open'/i);
  });

  it('a guild has no wing, event, fund or tag column', () => {
    /**
     * Wings, events and funds are **deferred with their design** — a Wing exists
     * only for an event, so deferring events defers Wings. A column added now is a
     * structure with no rules attached, and it will acquire wrong ones.
     *
     * `guild_tag` is a separate refusal (FR-006): three characters cannot be read
     * in context, and compression is exactly what defeats a blocklist.
     */
    for (const column of guildColumns) {
      expect(column, `guilds.${column} is a deferred concept`).not.toMatch(
        /wing|event|fund|treasury|tag/i,
      );
    }
  });

  it('the emblem is three integers, never a blob key or a URL', () => {
    /**
     * The shape *is* the argument for having no review queue. An upload column
     * here would silently reintroduce the moderation surface that composition
     * removes — and 012's avatar queue exists precisely because uploads need one.
     */
    expect(guildColumns).toEqual(
      expect.arrayContaining(['emblem_icon', 'emblem_ink', 'emblem_ground']),
    );
    for (const column of guildColumns) {
      expect(column, `guilds.${column} looks like an upload`).not.toMatch(/blob|url|upload/i);
    }
  });
});
