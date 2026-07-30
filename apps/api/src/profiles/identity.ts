/**
 * Name and avatar — the only self-expression in the game (012 T027–T030).
 *
 * ### TL;DR
 *
 * Every player owns the same 27 heroes, so identity is the one thing that is
 * theirs. A rename costs 325 shards unless it is the first one or a moderator
 * forced it. A curated avatar is free and needs no review; a custom one costs
 * money or shards and needs a human.
 *
 * ### The rename charge existed and was never taken
 *
 * Feature 005 wrote `renameAccount`, which computes the 325-shard cost, checks
 * affordability against an `options.shardsAvailable` the caller passes, and
 * **returns `shardsCharged` in its result**. Everything except the debit. And the
 * route called it with no options at all, so the affordability check could never
 * fire either — `shardsAvailable` was `undefined` on every call ever made.
 *
 * Nothing failed. The response said `shardsCharged: 325` and the ledger said
 * nothing, which is the exact signature of this project's most repeated defect:
 * built, tested, committed, never called. This module is the caller.
 */

import { RENAME_COST_SHARDS } from '../auth/username.js';
import { renameAccount, type RenameResult } from '../auth/rename.js';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { shardLedger } from '../db/schema/ledger.js';
import { balance } from '../progression/ledger.js';
import { eq } from 'drizzle-orm';

export { RENAME_COST_SHARDS };

/**
 * The curated avatars. **Free, and they need no review** — the whole set ships
 * with the client, so nothing a player can type reaches a screen.
 *
 * Keys rather than URLs: the client owns the artwork, so a repaint is a client
 * deploy rather than a database migration. Named after the Nine Forces plus the
 * two families, which is the vocabulary the game already teaches.
 */
export const CURATED_AVATARS = [
  'earth',
  'air',
  'fire',
  'water',
  'light',
  'dark',
  'slash',
  'pierce',
  'crush',
  'arcane',
  'martial',
] as const;
export type CuratedAvatar = (typeof CURATED_AVATARS)[number];

export const isCuratedAvatar = (key: string): key is CuratedAvatar =>
  (CURATED_AVATARS as readonly string[]).includes(key);

/**
 * A custom avatar's two prices (FR-012).
 *
 * **Charged per change, not once to unlock.** An unlock would make the second
 * upload free, and the fee is the only thing keeping the review queue small
 * enough for a human — roughly a 20-second glance against a $5 charge.
 */
export const AVATAR_COST_SHARDS = 1_350;
export const AVATAR_COST_CENTS = 500;

/**
 * The shards a dollar buys, implied by the dual price.
 *
 * ### ⚠️ This number is why SC-008 cannot currently be satisfied
 *
 * FR-015 requires a dual-priced item to be **worse** shards-per-dollar than the
 * best boost pass. `payments/catalog.ts` reports `bestShardsPerDollar()` as
 * **0** — deliberately, because no product converts money into shards at all.
 *
 * A dual price of $5 *or* 1,350 shards implies 270 shards per dollar: paying the
 * money *saves* the shards, and the saved shards are fungible into runes. So any
 * dual price at all is better than 0, and **FR-012 and FR-015 cannot both hold
 * while the catalog sells no shards.** One of them has to move; that is a design
 * decision, not an implementation one, so it is surfaced rather than resolved
 * here. The arithmetic is in `specs/012-profiles/tasks.md` under T026.
 */
export const impliedShardsPerDollar = (): number =>
  AVATAR_COST_SHARDS / (AVATAR_COST_CENTS / 100);

export class InsufficientShardsError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super(`Needs ${required} shards, has ${available}.`);
  }
}

/**
 * Rename, **and take the shards**.
 *
 * The balance is read first and passed in so `renameAccount`'s own affordability
 * check is finally armed, then the debit is written after the rename commits.
 *
 * ### Why the debit is not inside the rename transaction
 *
 * It would be better if it were, and `renameAccount` does not accept a
 * transaction handle — that is feature 005's module and widening its signature
 * from here would be a change to a feature that is closed. The window is between
 * a committed rename and its charge, and the failure mode is a **free rename**,
 * not a lost one: the player keeps the name and the shards. That is the right way
 * round for a failure nobody can trigger on purpose (the rename is rate-limited
 * to three per thirty days).
 *
 * **Recorded rather than hidden**: if renames ever become cheap or frequent, this
 * moves into the transaction and `renameAccount` grows a `tx` parameter.
 */
export async function renameWithCharge(
  accountId: string,
  requested: string,
  options: { readonly forced?: boolean } = {},
): Promise<RenameResult> {
  const available = await balance(accountId);

  const result = await renameAccount(accountId, requested, {
    ...(options.forced === undefined ? {} : { forced: options.forced }),
    shardsAvailable: available,
  });

  /**
   * **A free rename writes no ledger row at all.** A zero-delta row would appear
   * in a player's own export as a charge they can see and cannot explain — and a
   * forced rename is a moderation action, not a purchase.
   */
  if (result.shardsCharged > 0) {
    await db().insert(shardLedger).values({
      accountId,
      delta: -result.shardsCharged,
      reason: 'rename',
    });
  }

  return result;
}

/**
 * Choose a curated avatar. Free, immediate, no review.
 *
 * **Clears any approved custom avatar.** Picking from the set is how a player
 * takes a custom image down, and leaving the custom URL in place would make the
 * choice silently do nothing — the profile prefers custom.
 */
export async function setCuratedAvatar(accountId: string, key: string): Promise<void> {
  if (!isCuratedAvatar(key)) {
    throw new UnknownAvatarError(key);
  }

  await db()
    .update(accounts)
    .set({ avatarKey: key, customAvatarUrl: null })
    .where(eq(accounts.id, accountId));
}

export class UnknownAvatarError extends Error {}

export interface AvatarChoice {
  readonly kind: 'curated' | 'custom' | 'default';
  readonly value: string | null;
}

/**
 * The precedence, in **one** place: an approved custom image wins, then a
 * curated key, then the default.
 *
 * Two places computing this is two places to disagree about whether a pending
 * upload counts — and it never does, because neither this function nor any of
 * its callers reads `avatar_submissions` at all. That is the pre-moderation
 * guarantee (FR-013) expressed as a data-flow fact rather than as a check.
 */
export function avatarFrom(row: {
  readonly avatarKey: string | null;
  readonly customAvatarUrl: string | null;
}): AvatarChoice {
  if (row.customAvatarUrl) return { kind: 'custom', value: row.customAvatarUrl };
  if (row.avatarKey) return { kind: 'curated', value: row.avatarKey };

  return { kind: 'default', value: null };
}

/** What this player's avatar currently is. */
export async function currentAvatar(accountId: string): Promise<AvatarChoice> {
  const [row] = await db()
    .select({ avatarKey: accounts.avatarKey, customAvatarUrl: accounts.customAvatarUrl })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  return avatarFrom(row ?? { avatarKey: null, customAvatarUrl: null });
}
