/**
 * The battle schema's shape, asserted against the code rather than the database
 * (007 T003–T007).
 *
 * The migration was verified against Neon's catalog when it was applied. What
 * this guards is the *definition* drifting afterwards — three properties where
 * getting it wrong is silent, and one of them cannot be undone.
 */

import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { battles, battleActions } from '../../src/db/schema/battles.js';
import { accounts } from '../../src/db/schema/accounts.js';

describe('the action log cannot record the same action twice', () => {
  it('keys battle_actions on (battle_id, sequence)', () => {
    /**
     * **This is the whole idempotency mechanism.** The client says which
     * sequence it believes it is writing, so a retry raises 23505 instead of
     * appending — a duplicate becomes a constraint violation rather than a race
     * to detect. Losing this key does not fail loudly: the log grows an extra
     * entry, every subsequent replay reads it, and the battle stays plausible
     * while being wrong.
     */
    const pk = getTableConfig(battleActions).primaryKeys[0];
    expect(pk?.columns.map((c) => c.name)).toEqual(['battle_id', 'sequence']);
  });

  it('records the draw window, not just the outcome', () => {
    // A replay must consume exactly the draws the original did. Storing only
    // results makes the log un-re-derivable the first time a formula changes.
    const names = getTableConfig(battleActions).columns.map((c) => c.name);
    expect(names).toContain('draw_index_before');
    expect(names).toContain('draws_consumed');
  });
});

describe('deleting an account never deletes its battles', () => {
  it('sets both participant foreign keys to null rather than cascading', () => {
    /**
     * **Three commitments forbid a cascade here**, and a cascade is the Drizzle
     * default nobody would question in review:
     *
     * - Constitution XVI — these records are permanent and unreconstructable.
     * - Feature 008 SC-001 — every design commitment answerable from records
     *   alone; a departing player would silently reshape every aggregate.
     * - The published privacy policy, which promises deletion "removes your
     *   identity from these records rather than deleting the records
     *   themselves".
     */
    for (const fk of getTableConfig(battles).foreignKeys) {
      expect(fk.onDelete, fk.getName()).toBe('set null');
    }
  });
});

describe('what a battle records for feature 008', () => {
  /**
   * **XVI is the only principle that cannot be retrofitted.** 008 reports on
   * these; 007 is what records them, and anything absent at the moment a battle
   * is fought is absent forever — a migration can add a column but cannot
   * invent the value it should have held. 007's own task list named none of
   * the first three.
   */
  const names = getTableConfig(battles).columns.map((c) => c.name);

  it.each([
    ['turn_count', '008 FR-003'],
    ['attacker_squad', '008 FR-004 — both sides'],
    ['defender_snapshot', '008 FR-004 — both sides'],
    ['defender_is_bot', '008 FR-005, SC-002 — aggregates must exclude bots'],
    ['engine_version', '007 FR-010'],
    ['content_version', '007 FR-010'],
  ])('records %s (%s)', (column) => {
    expect(names).toContain(column);
  });

  it('leaves room for league and rating, which feature 009 has not defined yet', () => {
    // Nullable is correct rather than a gap: there is no league system to
    // record from. XVI protects values that were real at the time; it does not
    // require inventing ones that were not.
    const league = getTableConfig(battles).columns.find((c) => c.name === 'league_at_battle');
    const rating = getTableConfig(battles).columns.find((c) => c.name === 'rating_at_battle');
    expect(league?.notNull).toBe(false);
    expect(rating?.notNull).toBe(false);
  });
});

describe('an abandoned battle is not a battle', () => {
  it('counts abandonment on the account, never as a row in battles', () => {
    // Recording *that* somebody walked away is a fact about the player.
    // Recording it as a battle would put a fight nobody finished into the table
    // every feature-008 aggregate reads — and XVI keeps it there forever.
    const names = getTableConfig(accounts).columns.map((c) => c.name);
    expect(names).toContain('abandoned_battles');
    expect(getTableConfig(battles).columns.map((c) => c.name)).not.toContain('abandoned');
  });
});
