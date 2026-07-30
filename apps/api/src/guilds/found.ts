/**
 * Founding a guild (013 T026, T027, T029, T032, T034, T060).
 *
 * ### The charge and the creation are one transaction
 *
 * Same reason as the rune rebuild: a partial failure leaves **a paid-for guild that
 * does not exist**, or **a guild nobody paid for**. Both are support tickets, and
 * only one of them is visible to us.
 *
 * ### Founding is a starter-league door, and it is the one most likely to be missed
 *
 * Because founding *feels* like a creation flow rather than a joining one. So
 * `POST /v1/guilds` goes through **`guildDoorConfirm()`** — feature 009's only
 * constructor for a confirm, which fetches the warning itself. There is no version
 * of that call that produces an unwarned confirm, which is stronger than a required
 * field: a required field can still be populated with the wrong thing by a caller
 * in a hurry.
 *
 * ### The emblem saves immediately, with no review and no pending state
 *
 * It is **three indices into a curated palette** — 36 icons × 12 inks × 12 grounds,
 * all 5,184 combinations vetted at authoring time. There is nothing a player can
 * put into it. **Composition is what removes the review, not a relaxed policy**: an
 * avatar is an *upload* and is still pre-moderated (012).
 *
 * The **name** and **pitch** are text and do go through feature 015.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { guilds, guildMembers } from '../db/schema/guilds.js';
import { shardLedger } from '../db/schema/ledger.js';
import { usernameKey } from '../auth/username.js';
import { balance } from '../progression/ledger.js';
import { guildDoorConfirm, guildJoined } from '../matchmaking/starterLeague.js';
import type { Clock } from './clock.js';
import {
  EMBLEM_GROUNDS,
  EMBLEM_ICONS,
  EMBLEM_INKS,
  FOUNDING_COST_SHARDS,
  MAX_GUILD_NAME_LENGTH,
  MAX_PITCH_LENGTH,
  MIN_GUILD_NAME_LENGTH,
} from './config.js';
import { membershipOf } from './membership.js';

export interface Emblem {
  readonly icon: number;
  readonly ink: number;
  readonly ground: number;
}

/** Index 0 is the blank icon — a solid block of colour is a permitted choice. */
export const DEFAULT_EMBLEM: Emblem = { icon: 0, ink: 0, ground: 0 };

/**
 * `icon ∈ 0..35`, `ink ∈ 0..11`, `ground ∈ 0..11`.
 *
 * **Contrast is not checked here, deliberately.** FR-004 and Constitution XVIII:
 * *harm is a gate, taste is a note.* A low-contrast emblem warns in the designer
 * and saves anyway. The server's job is to reject an index that is not in the
 * palette — which is a *validity* question, not a taste one.
 */
export function emblemValid(emblem: Emblem): boolean {
  const bounded = (value: number, limit: number): boolean =>
    Number.isInteger(value) && value >= 0 && value < limit;

  return (
    bounded(emblem.icon, EMBLEM_ICONS) &&
    bounded(emblem.ink, EMBLEM_INKS) &&
    bounded(emblem.ground, EMBLEM_GROUNDS)
  );
}

export type FoundResult =
  | { readonly ok: true; readonly guildId: string; readonly charged: number }
  | {
      readonly ok: false;
      readonly reason:
        | 'insufficient-shards'
        | 'already-in-a-guild'
        | 'name-taken'
        | 'name-invalid'
        | 'pitch-too-long'
        | 'emblem-invalid'
        | 'starter-warning-not-acknowledged';
      readonly required?: number;
      readonly available?: number;
    };

export interface FoundInput {
  readonly name: string;
  readonly pitch?: string;
  readonly emblem?: Emblem;
  /**
   * The two acknowledgements from 009, **both of them**, when the founder is still
   * in the starter league. Named as the wire strings rather than a boolean so a
   * client cannot satisfy it by sending `true`.
   */
  readonly acknowledged?: readonly string[];
}

/**
 * Found a guild.
 *
 * Returns a discriminated result rather than throwing, so the route maps reasons to
 * statuses in one place and every branch is visible in the type.
 */
export async function foundGuild(
  founderId: string,
  input: FoundInput,
  clock: Clock,
): Promise<FoundResult> {
  const name = input.name.normalize('NFC').trim();
  if (name.length < MIN_GUILD_NAME_LENGTH || name.length > MAX_GUILD_NAME_LENGTH) {
    return { ok: false, reason: 'name-invalid' };
  }

  const pitch = input.pitch ?? '';
  if (pitch.length > MAX_PITCH_LENGTH) return { ok: false, reason: 'pitch-too-long' };

  const emblem = input.emblem ?? DEFAULT_EMBLEM;
  if (!emblemValid(emblem)) return { ok: false, reason: 'emblem-invalid' };

  if (await membershipOf(founderId)) return { ok: false, reason: 'already-in-a-guild' };

  /**
   * **The starter-league door.** `guildDoorConfirm` is 009's only constructor and
   * fetches the warning itself, so this cannot be assembled unwarned. `null` means
   * the founder has nothing left to lose and no acknowledgement is required.
   */
  const confirm = await guildDoorConfirm(founderId, 'founding', null);
  if (confirm.starterWarning !== null) {
    const acknowledged = new Set(input.acknowledged ?? []);
    const complete =
      acknowledged.has('bot-opponents-end') && acknowledged.has('income-multiplier-ends');

    /** **Both**, because they are two different losses. One is not a warning. */
    if (!complete) return { ok: false, reason: 'starter-warning-not-acknowledged' };
  }

  const available = await balance(founderId);
  if (available < FOUNDING_COST_SHARDS) {
    return {
      ok: false,
      reason: 'insufficient-shards',
      required: FOUNDING_COST_SHARDS,
      available,
    };
  }

  /**
   * The uniqueness key uses **the same folding as usernames** — NFKD, case-fold,
   * confusable rectification. A lookalike of a guild's name is the same
   * impersonation vector as a lookalike of a player's, and *"The Long Reach"* vs
   * *"the long reach"* is not a difference anybody can see in a list.
   */
  const nameKey = usernameKey(name);
  const [taken] = await db()
    .select({ id: guilds.id })
    .from(guilds)
    .where(eq(guilds.nameKey, nameKey))
    .limit(1);

  if (taken) return { ok: false, reason: 'name-taken' };

  const now = clock.now();
  let guildId = '';

  try {
    await db().transaction(async (tx) => {
      const [guild] = await tx
        .insert(guilds)
        .values({
          name,
          nameKey,
          pitch,
          emblemIcon: emblem.icon,
          emblemInk: emblem.ink,
          emblemGround: emblem.ground,
          foundedAt: now,
        })
        .returning({ id: guilds.id });

      guildId = guild!.id;

      await tx
        .insert(guildMembers)
        .values({ accountId: founderId, guildId, role: 'master', joinedAt: now });

      /**
       * **Inside the transaction**, unlike the starter exit. The charge and the
       * guild are the two halves of the same purchase; the starter exit is 009's
       * write, is idempotent, and self-corrects if it is missed.
       */
      await tx.insert(shardLedger).values({
        accountId: founderId,
        delta: -FOUNDING_COST_SHARDS,
        reason: 'guild-founding',
      });
    });
  } catch (error) {
    /** A concurrent founder took the name between the check and the insert. */
    if (String(error).includes('23505')) return { ok: false, reason: 'name-taken' };
    throw error;
  }

  await guildJoined(founderId);

  return { ok: true, guildId, charged: FOUNDING_COST_SHARDS };
}

export type RenameResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'name-taken' | 'name-invalid' };

/**
 * **The only write that changes a guild's name**, and it is feature 015's.
 *
 * FR-002: a name is permanent, changeable only by a moderation-forced rename, which
 * is **free** — so no ledger row is written at all. There is deliberately no
 * player-facing rename route; *a permanent name is not a trap*, because founding a
 * new guild is always available for 650 and you simply start over with no history.
 *
 * > **No caller yet.** Feature 015 owns moderation and does not exist. Recorded
 * > here rather than discovered later — the same shape as 009's `guildJoined`,
 * > which sat uncalled for four features.
 */
export async function forcedRename(guildId: string, newName: string): Promise<RenameResult> {
  const name = newName.normalize('NFC').trim();
  if (name.length < MIN_GUILD_NAME_LENGTH || name.length > MAX_GUILD_NAME_LENGTH) {
    return { ok: false, reason: 'name-invalid' };
  }

  const nameKey = usernameKey(name);
  const [taken] = await db()
    .select({ id: guilds.id })
    .from(guilds)
    .where(eq(guilds.nameKey, nameKey))
    .limit(1);

  if (taken && taken.id !== guildId) return { ok: false, reason: 'name-taken' };

  await db().update(guilds).set({ name, nameKey }).where(eq(guilds.id, guildId));
  return { ok: true };
}

export type EmblemResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'emblem-invalid' };

/** Saves immediately. No review queue, no pending state, no private storage. */
export async function setEmblem(guildId: string, emblem: Emblem): Promise<EmblemResult> {
  if (!emblemValid(emblem)) return { ok: false, reason: 'emblem-invalid' };

  await db()
    .update(guilds)
    .set({
      emblemIcon: emblem.icon,
      emblemInk: emblem.ink,
      emblemGround: emblem.ground,
    })
    .where(eq(guilds.id, guildId));

  return { ok: true };
}

export type PitchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'pitch-too-long' };

/** FR-007. A **stored guild property**, validated for length — not text per posting. */
export async function setPitch(guildId: string, pitch: string): Promise<PitchResult> {
  if (pitch.length > MAX_PITCH_LENGTH) return { ok: false, reason: 'pitch-too-long' };

  await db().update(guilds).set({ pitch }).where(eq(guilds.id, guildId));
  return { ok: true };
}
