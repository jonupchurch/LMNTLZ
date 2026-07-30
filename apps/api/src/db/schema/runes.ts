/**
 * Runes — **the only thing a player accumulates** (010 T006).
 *
 * All 27 heroes are unlocked on day one and identical for everybody, so
 * progression cannot be roster power. What a player builds instead is rune
 * investment: permanent, **destroyed on replacement**, and the sole reason
 * `06-progression.md` makes balancing upward a rule rather than a preference.
 *
 * ### Three slots, and two of them are typed to the hero
 *
 * One slot takes the hero's `primary` damage type, one its `secondary`, one is
 * common and takes anything. The typing is what stops a rune from being a
 * fungible stat stick — a rune belongs to *this* hero, which is what makes
 * replacing it feel like a decision instead of an inventory swap (FR-005).
 *
 * ### Four stages, and the fourth is a different kind of thing
 *
 * Stages 1–3 are stat boosts of **+20 · +10 · +5** and cost 150 each; stage 4
 * costs 200, grants no points, and unlocks a **utility effect**. That ordering is
 * deliberate and it justifies itself economically: the utility slot is a bad buy
 * early — 200 shards that raise no number while the roster still has obvious
 * fills — and a good buy late, once the 75 cap has absorbed everything the boosts
 * can give (FR-006, FR-011).
 *
 * > **The boosts stack on one stat, and the 75 cap is the only constraint.**
 * > `+20 +10 +5` on a single stat is 35 points, and the roster has **57 exact
 * > fills** where that lands a stat precisely on 75. Hitting one is the most
 * > satisfying thing a rune does, so nothing here may restrict allocation beyond
 * > the cap itself (FR-007, SC-008).
 *
 * ### `allocations` is JSON because the shape is a decision, not a schema
 *
 * A row of ten nullable integer columns would encode "which stats can a rune
 * touch" into the table, and the answer is *all of them, in any split the player
 * likes*. It is validated on write against `STAT_KEYS` and the cap; it is never
 * queried by key. **Gear score sums it** — see `matchmaking/gearScore.ts`, which
 * has been waiting for a real `RuneSource` since 009.
 *
 * ### There is no `shards_spent` column here, deliberately
 *
 * 009's `RuneSource` interface refuses to expose lifetime spend for a reason:
 * *"a source that could report spend is a source somebody scores by accident."*
 * Gear score reads **runes currently placed**, so ten rebuilds of one slot is
 * 6,500 shards for 125 of score, not 1,250. Storing spend per rune would put the
 * wrong number one join away from the query that must not use it.
 */

import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { StatKey } from '@lmntlz/content';
import { accounts } from './accounts.js';

/** Which of a hero's three slots a rune occupies. */
export const RUNE_SLOTS = ['primary', 'secondary', 'common'] as const;
export type RuneSlot = (typeof RUNE_SLOTS)[number];

/** Stat points granted by each stage. Stage 4 grants none — it buys utility. */
export const STAGE_BOOSTS = [20, 10, 5, 0] as const;

/** Shard cost of each stage. `150 · 150 · 150 · 200`, so a full rune is 650. */
export const STAGE_COSTS = [150, 150, 150, 200] as const;

/** A full rune, all four stages. The unit the cap and the starter exit are quoted in. */
export const FULL_RUNE_COST = STAGE_COSTS.reduce((sum, cost) => sum + cost, 0);

export const MAX_STAGE = 4;

/** `{ might: 20, speed: 15 }` — validated on write, never queried by key. */
export type RuneAllocations = Partial<Record<StatKey, number>>;

export const runes = pgTable(
  'runes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),

    /** `h01`–`h27`, from `@lmntlz/content`. Not a foreign key — the roster is code. */
    heroId: text('hero_id').notNull(),

    slot: text('slot').$type<RuneSlot>().notNull(),

    /**
     * `1`–`4`, and **a rune is created at stage 1 and advanced in place**. A
     * partial rune is the ordinary state, not an error: planning is free and
     * committing is per stage.
     */
    stage: integer('stage').notNull().default(1),

    allocations: jsonb('allocations').$type<RuneAllocations>().notNull().default({}),

    /**
     * Stage 4 only, `null` below it. The utility effects are authored with the
     * hero numbers (`06-progression.md` — 33 magnitudes whose shape is settled
     * and whose values are not), so this stores the chosen effect's id.
     */
    utilityEffect: text('utility_effect'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **One rune per hero per slot, enforced by the database.**
     *
     * Replacement destroys and recreates inside one transaction (FR-008); if that
     * transaction were ever wrong, the visible symptom without this constraint is
     * a hero quietly carrying two runes in one slot and scoring for both. A
     * duplicate must fail loudly at the write instead.
     */
    unique('runes_account_hero_slot_key').on(table.accountId, table.heroId, table.slot),

    /** Gear score sums every placed rune for one account. */
    index('runes_account_idx').on(table.accountId),
  ],
);

export type RuneRow = typeof runes.$inferSelect;
