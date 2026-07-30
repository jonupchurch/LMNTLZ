/**
 * The chat credential (014 T006–T008).
 *
 * ### A token names channels; it can never name a permission
 *
 * `mintChatToken` computes the exact list of channels an account may **read** and
 * asks the broker for a subscribe-only grant over them. There is no parameter,
 * no flag and no overload that produces anything else — see `transport.ts` for
 * why that is a correctness property rather than hardening (some postings cost
 * shards; a client that could publish would bypass the charge).
 *
 * ### Revocation is inside the transaction, and the reason is an early return
 *
 * Four things change what an account may read: **guild membership, starter-league
 * status, language preference and ban scope** (T007). Each of them is changed by
 * a transaction somewhere else in this codebase, and the revocation must happen
 * *inside* that transaction rather than after it commits.
 *
 * A revocation issued after the commit is a revocation an early return can skip —
 * and every one of those four call sites has error paths, guards and at least one
 * `return` between the write and the end of the function. Inside the transaction
 * it either happens or the write is rolled back, and there is no third outcome.
 *
 * ### The 60-minute TTL is a backstop, not the mechanism
 *
 * **Do not reason about staleness in terms of the TTL.** Reads never touch our
 * API — a subscriber is talking to the broker — so there is no request on which
 * to re-check anything. A player kicked from a guild whose token still lists that
 * guild's channel keeps reading it until something actively revokes. The TTL only
 * bounds how long a *missed* revocation can hurt.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { membershipOf } from '../guilds/membership.js';
import { starterStatus } from '../matchmaking/starterLeague.js';
import { adsScope, adminScope, beginnerScope, globalScope, guildScope } from './scopes.js';
import { broker, type SubscribeGrant } from './transport.js';

/** T006. Long enough not to churn, short enough to bound a missed revocation. */
export const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * The per-account control channel (T008).
 *
 * Carries `token-stale` **and nothing else** — no message content, no counts, no
 * reason. So it has no moderation surface, and its cost is not worth counting.
 */
export const controlChannel = (accountId: string): string => `control:${accountId}`;

export const TOKEN_STALE = 'token-stale';

/**
 * Every channel this account may read, right now.
 *
 * **A chat ban removes the rooms and keeps the control channel**, so a banned
 * player still receives `token-stale` and still re-mints — which is what lets the
 * ban lift itself when it expires without anyone poking the client.
 */
export async function channelsFor(accountId: string): Promise<readonly string[]> {
  const [account] = await db()
    .select({
      isEnvoy: accounts.isEnvoy,
      banScope: accounts.banScope,
      bannedUntil: accounts.bannedUntil,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) return [];

  const channels: string[] = [controlChannel(accountId)];

  const banned =
    account.bannedUntil !== null &&
    account.bannedUntil.getTime() > Date.now() &&
    (account.banScope === 'chat' || account.banScope === 'full');

  if (banned) return channels;

  channels.push(globalScope(), adsScope());

  const membership = await membershipOf(accountId);
  if (membership) channels.push(guildScope(membership.guildId));

  /**
   * **Beginner admits starter-league players and Envoys, and nobody else**
   * (FR-003, T026). An Envoy is a graduated player who stayed to help; without
   * them the room is exclusively brand-new players, which is precisely the
   * composition scams are aimed at.
   */
  const starter = await starterStatus(accountId);
  if (starter.active || account.isEnvoy) channels.push(beginnerScope());

  return channels;
}

export async function mintChatToken(accountId: string): Promise<SubscribeGrant> {
  const channels = await channelsFor(accountId);
  return broker().subscribeToken(accountId, channels, TOKEN_TTL_MS);
}

/**
 * Tell an account its token is wrong (T007).
 *
 * **Call this inside the transaction that changed the input**, never after it.
 * It is intentionally cheap and intentionally idempotent: a duplicate notice
 * costs one re-mint, and a missed one costs up to `TOKEN_TTL_MS` of a player
 * reading a room they have been removed from.
 */
export async function revokeChatToken(accountId: string): Promise<void> {
  await broker().notifyStale(accountId);
}

/** The admin scope is team-only and is never in a player's channel list. */
export const adminChannel = adminScope;
