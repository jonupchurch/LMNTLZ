/**
 * Squads, seats and defense behaviour (006 T005).
 *
 * ### The counting constraint that shapes the whole table
 *
 * 27 heroes, all unlocked for everybody. **12 go to defense** across two
 * engine-run zones and then cannot attack. Up to **3 attack squads** are drawn
 * from the remaining **15** — and 3 x 6 = 18 > 15, so **overlap between attack
 * squads is forced, not merely permitted**. Any uniqueness constraint that
 * forbids a hero appearing in two offense squads makes the game unplayable, so
 * the only per-hero uniqueness here is **within a single squad**.
 *
 * ### What is a constraint and what is application code
 *
 * The exclusivity rule — *a hero on either defense zone is unavailable to every
 * offense squad* — spans rows in a way a `CHECK` cannot express, so it lives in
 * `squads/allocation.ts` with tests. Everything expressible in the schema **is**
 * in the schema, because an invariant enforced only in application code is one
 * `INSERT` in a migration away from being violated.
 *
 * ### `holdStreak` and `editedAt` are a pair
 *
 * A defense squad's public hold streak resets when the squad is edited, and
 * "edited" means **its canonical form changed** — not that a form was submitted.
 * `canonical.ts` compares hashes; this table only records the outcome. A
 * client-set dirty flag would be wrong the first time a re-render touched a
 * field, and it would be wrong in the player's favour.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './accounts.js';

export const SQUAD_KINDS = ['defense', 'offense'] as const;
export type SquadKind = (typeof SQUAD_KINDS)[number];

/**
 * **Visible is scoutable and the only squad anyone can choose to attack.**
 * Hidden is never shown and never selectable — the sole way into a Hidden battle
 * is to be ambushed.
 */
export const SQUAD_ZONES = ['visible', 'hidden'] as const;
export type SquadZone = (typeof SQUAD_ZONES)[number];

/** The fixed formation. **A squad is always 2 front, 3 middle, 1 back.** */
export const SQUAD_ROWS = ['front', 'middle', 'back'] as const;
export type SquadRow = (typeof SQUAD_ROWS)[number];

/** How many seats each row holds. Sums to 6, and that is the only legal shape. */
export const ROW_CAPACITY: Readonly<Record<SquadRow, number>> = Object.freeze({
  front: 2,
  middle: 3,
  back: 1,
});

export const SQUAD_SIZE = 6;
export const DEFENSE_HEROES = 12;
export const MAX_ATTACK_SQUADS = 3;

export const squads = pgTable(
  'squads',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    kind: text('kind', { enum: SQUAD_KINDS }).notNull(),

    /** Defense only. `null` on every offense squad. */
    zone: text('zone', { enum: SQUAD_ZONES }),

    /** Offense only, `0..2`. `null` on every defense squad. */
    slotIndex: smallint('slot_index'),

    /** Player-chosen label. Defense squads are named too — they are scouted. */
    name: text('name'),

    /**
     * Offense only. **Set to `false` by eviction**, when a hero this squad
     * contains is moved to defense. It is not a derived view: the player needs
     * to see *which* of their squads a defensive change broke, after the fact.
     */
    valid: boolean('valid'),

    /**
     * Defense only. The public hold streak, reset when the canonical form
     * changes. **Never negative**, which the check below enforces rather than
     * trusting every future call site to clamp.
     */
    holdStreak: integer('hold_streak').notNull().default(0),

    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **Exactly one Visible and one Hidden squad per account**, and at most three
     * offense squads, one per slot. Partial indexes rather than one composite,
     * because `zone` and `slotIndex` are each null on the other kind and a plain
     * unique index treats every null as distinct — which would silently permit a
     * second Visible squad.
     */
    uniqueIndex('squads_defense_zone_unique')
      .on(table.accountId, table.zone)
      .where(sql`${table.kind} = 'defense'`),
    uniqueIndex('squads_offense_slot_unique')
      .on(table.accountId, table.slotIndex)
      .where(sql`${table.kind} = 'offense'`),

    index('squads_account_idx').on(table.accountId),

    /**
     * The two shapes, stated once. A defense squad has a zone and no slot; an
     * offense squad has a slot and no zone. Without this both columns are
     * nullable on both kinds and nothing stops a row that is neither.
     */
    check(
      'squads_kind_shape',
      sql`(${table.kind} = 'defense' AND ${table.zone} IS NOT NULL AND ${table.slotIndex} IS NULL)
       OR (${table.kind} = 'offense' AND ${table.zone} IS NULL AND ${table.slotIndex} BETWEEN 0 AND 2)`,
    ),

    check('squads_hold_streak_non_negative', sql`${table.holdStreak} >= 0`),
  ],
);

/**
 * One row per seat. **Six per squad, and the row/index pair is the position** on
 * the shared 1–6 axis that reach is measured over.
 *
 * Modelled as rows rather than six columns on `squads` because reach, targeting
 * and eviction all ask *"which squads contain this hero"*, which is an index
 * lookup here and a six-way `OR` against columns.
 */
export const squadSeats = pgTable(
  'squad_seats',
  {
    squadId: uuid('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),

    row: text('row', { enum: SQUAD_ROWS }).notNull(),

    /** Position within the row: `0..1` front, `0..2` middle, `0` back. */
    index: smallint('index').notNull(),

    /** A `@lmntlz/content` hero id. **Deliberately not a foreign key** — the
     * roster is generated content in a package, not a table, and duplicating it
     * into Postgres would create a second source of truth that can drift
     * (Constitution XV). Validated against `getHero` on write. */
    heroId: text('hero_id').notNull(),
  },
  (table) => [
    uniqueIndex('squad_seats_position_unique').on(table.squadId, table.row, table.index),

    /**
     * **A hero may not occupy two seats in the same squad** — but may appear in
     * as many *different* offense squads as the player likes, which is forced by
     * 3 x 6 > 15. This is per squad, deliberately.
     */
    uniqueIndex('squad_seats_hero_unique').on(table.squadId, table.heroId),

    /** Eviction asks "every squad containing this hero" and must never truncate. */
    index('squad_seats_hero_idx').on(table.heroId),

    check(
      'squad_seats_index_in_row',
      sql`(${table.row} = 'front'  AND ${table.index} BETWEEN 0 AND 1)
       OR (${table.row} = 'middle' AND ${table.index} BETWEEN 0 AND 2)
       OR (${table.row} = 'back'   AND ${table.index} = 0)`,
    ),
  ],
);

/**
 * Defense behaviour, from feature 004. **Defense squads only** — the player
 * commands offense directly, so an offense squad has nothing to configure.
 *
 * `powerRanking` is a permutation of the six power slots stored as text (e.g.
 * `"4·3·2·1·5·0"`), and `allyRule` is present only when the hero owns a friendly
 * power. Both are validated against `@lmntlz/sim/ai` on write rather than by a
 * `CHECK`, because the legal set is a computed property of the hero.
 */
export const squadMemberConfig = pgTable(
  'squad_member_config',
  {
    squadId: uuid('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),

    heroId: text('hero_id').notNull(),

    /** The pair, in order. **The fallback is the rule that usually fires.** */
    targetPrimary: text('target_primary').notNull(),
    targetFallback: text('target_fallback').notNull(),

    /** `null` unless the hero owns a friendly power. */
    allyRule: text('ally_rule'),

    powerRanking: text('power_ranking').notNull(),
  },
  (table) => [uniqueIndex('squad_member_config_unique').on(table.squadId, table.heroId)],
);

export const squadsRelations = relations(squads, ({ many }) => ({
  seats: many(squadSeats),
  memberConfig: many(squadMemberConfig),
}));

export const squadSeatsRelations = relations(squadSeats, ({ one }) => ({
  squad: one(squads, { fields: [squadSeats.squadId], references: [squads.id] }),
}));

export const squadMemberConfigRelations = relations(squadMemberConfig, ({ one }) => ({
  squad: one(squads, { fields: [squadMemberConfig.squadId], references: [squads.id] }),
}));

export type Squad = typeof squads.$inferSelect;
export type NewSquad = typeof squads.$inferInsert;
export type SquadSeat = typeof squadSeats.$inferSelect;
export type NewSquadSeat = typeof squadSeats.$inferInsert;
export type SquadMemberConfigRow = typeof squadMemberConfig.$inferSelect;
