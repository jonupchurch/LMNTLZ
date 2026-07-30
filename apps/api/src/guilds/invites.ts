/**
 * Invitations (013 T018 · FR-012, FR-013).
 *
 * ### Accepting joins immediately, with no second confirmation
 *
 * **The player is the one being asked, so their yes is the decision.** An "are you
 * sure?" on an invitation is a dialog asking somebody to confirm the answer they
 * just gave — and the *actual* thing worth confirming, leaving the starter league,
 * is a different question with a different answer, which is why it travels as an
 * acknowledgement on the request rather than as a modal after it.
 *
 * ### Accepting one withdraws the rest, and it is stated plainly
 *
 * Same rule as applications and the same transaction shape, for the same reason:
 * the contended row is the player's membership, and the withdrawal must commit with
 * it or there is a window in which a second acceptance is a second guild.
 *
 * An invitation and an application can also race each other — a player who applied
 * to A and was invited by B can have both land at once. Nothing special is needed:
 * both paths insert the same membership row, so the same constraint decides it.
 */

import { and, desc, eq, lt, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { guildApplications, guildInvites, guildMembers, guilds } from '../db/schema/guilds.js';
import { guildJoined } from '../matchmaking/starterLeague.js';
import { addDays, type Clock } from './clock.js';
import { GUILD_CAPACITY, INVITE_EXPIRY_DAYS } from './config.js';
import { membershipOf } from './membership.js';

const UNIQUE_VIOLATION = '23505';

/** Same cause-walk as `applications.ts`; see the note there about drizzle wrapping. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current !== null && current !== undefined && depth < 5; depth++) {
    if (typeof current !== 'object') return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export type InviteResult =
  | { readonly ok: true; readonly inviteId: string; readonly expiresAt: Date }
  | {
      readonly ok: false;
      readonly reason:
        | 'already-in-a-guild'
        | 'already-invited'
        | 'guild-full'
        | 'no-such-guild'
        | 'no-such-player';
    };

export async function invite(
  guildId: string,
  targetId: string,
  invitedBy: string,
  clock: Clock,
): Promise<InviteResult> {
  const [guild] = await db()
    .select({ id: guilds.id, disbandedAt: guilds.disbandedAt })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  if (!guild || guild.disbandedAt !== null) return { ok: false, reason: 'no-such-guild' };

  if (await membershipOf(targetId)) return { ok: false, reason: 'already-in-a-guild' };

  const roster = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  if (roster.length >= GUILD_CAPACITY) return { ok: false, reason: 'guild-full' };

  const now = clock.now();
  const expiresAt = addDays(now, INVITE_EXPIRY_DAYS);

  try {
    const [row] = await db()
      .insert(guildInvites)
      .values({ accountId: targetId, guildId, invitedBy, createdAt: now, expiresAt })
      .returning({ id: guildInvites.id });

    return { ok: true, inviteId: row!.id, expiresAt };
  } catch (error) {
    /**
     * The partial unique index on `state = 'open'`. A second invitation from the
     * same guild is the same offer, so this is not an error the officer needs to
     * think about — it is *"already sent"*.
     */
    if (isUniqueViolation(error)) return { ok: false, reason: 'already-invited' };
    throw error;
  }
}

export type AcceptInviteResult =
  | { readonly ok: true; readonly guildId: string }
  | { readonly ok: false; readonly reason: 'already-joined'; readonly guildId: string }
  | { readonly ok: false; readonly reason: 'expired' | 'not-open' | 'guild-full' | 'no-such-invite' };

/**
 * **Immediately.** No second confirmation — see the header.
 *
 * The starter-league acknowledgement is checked by the route before this is
 * reached, because it belongs to the request that carries it, not to the write.
 */
export async function acceptInvite(
  inviteId: string,
  accountId: string,
  clock: Clock,
): Promise<AcceptInviteResult> {
  const [row] = await db()
    .select({
      id: guildInvites.id,
      guildId: guildInvites.guildId,
      accountId: guildInvites.accountId,
      state: guildInvites.state,
      expiresAt: guildInvites.expiresAt,
    })
    .from(guildInvites)
    .where(eq(guildInvites.id, inviteId))
    .limit(1);

  /**
   * `no-such-invite` for somebody else's invitation, deliberately — telling a
   * player *"that invitation is not yours"* confirms it exists and who it is for.
   */
  if (!row || row.accountId !== accountId) return { ok: false, reason: 'no-such-invite' };
  if (row.state !== 'open') return { ok: false, reason: 'not-open' };

  const now = clock.now();
  if (row.expiresAt <= now) {
    await db()
      .update(guildInvites)
      .set({ state: 'expired', closedAt: now })
      .where(and(eq(guildInvites.id, inviteId), eq(guildInvites.state, 'open')));

    return { ok: false, reason: 'expired' };
  }

  const roster = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, row.guildId));

  if (roster.length >= GUILD_CAPACITY) return { ok: false, reason: 'guild-full' };

  try {
    await db().transaction(async (tx) => {
      await tx.insert(guildMembers).values({ accountId, guildId: row.guildId, role: 'member' });

      /** **Stated plainly** in the client: accepting one withdraws the others. */
      await tx
        .update(guildInvites)
        .set({ state: 'withdrawn', closedAt: now })
        .where(
          and(
            eq(guildInvites.accountId, accountId),
            eq(guildInvites.state, 'open'),
            ne(guildInvites.id, inviteId),
          ),
        );

      await tx
        .update(guildInvites)
        .set({ state: 'accepted', closedAt: now })
        .where(eq(guildInvites.id, inviteId));

      /** Their own applications close too — they are in a guild now. */
      await tx
        .update(guildApplications)
        .set({ state: 'withdrawn', closedAt: now })
        .where(
          and(
            eq(guildApplications.accountId, accountId),
            eq(guildApplications.state, 'open'),
          ),
        );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await membershipOf(accountId);
      return { ok: false, reason: 'already-joined', guildId: existing?.guildId ?? '' };
    }
    throw error;
  }

  await guildJoined(accountId);

  return { ok: true, guildId: row.guildId };
}

export type DeclineResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-open' | 'no-such-invite' };

/** Declining carries **no cooldown** — the player was not turned down, they said no. */
export async function declineInvite(
  inviteId: string,
  accountId: string,
  clock: Clock,
): Promise<DeclineResult> {
  const result = await db()
    .update(guildInvites)
    .set({ state: 'declined', closedAt: clock.now() })
    .where(
      and(
        eq(guildInvites.id, inviteId),
        eq(guildInvites.accountId, accountId),
        eq(guildInvites.state, 'open'),
      ),
    )
    .returning({ id: guildInvites.id });

  return result.length > 0 ? { ok: true } : { ok: false, reason: 'not-open' };
}

export interface InviteView {
  readonly id: string;
  readonly guildId: string;
  readonly guildName: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** A player's open invitations, newest first. */
export async function invitesFor(accountId: string): Promise<readonly InviteView[]> {
  return db()
    .select({
      id: guildInvites.id,
      guildId: guildInvites.guildId,
      guildName: guilds.name,
      createdAt: guildInvites.createdAt,
      expiresAt: guildInvites.expiresAt,
    })
    .from(guildInvites)
    .innerJoin(guilds, eq(guilds.id, guildInvites.guildId))
    .where(and(eq(guildInvites.accountId, accountId), eq(guildInvites.state, 'open')))
    .orderBy(desc(guildInvites.createdAt))
    .limit(50);
}

/** The invitation half of the 7-day sweep. Same shape, same guarantees. */
export async function expireOverdueInvites(clock: Clock, limit = 500): Promise<number> {
  const now = clock.now();

  const overdue = await db()
    .select({ id: guildInvites.id })
    .from(guildInvites)
    .where(and(eq(guildInvites.state, 'open'), lt(guildInvites.expiresAt, now)))
    .limit(limit);

  if (overdue.length === 0) return 0;

  for (const row of overdue) {
    await db()
      .update(guildInvites)
      .set({ state: 'expired', closedAt: now })
      .where(and(eq(guildInvites.id, row.id), eq(guildInvites.state, 'open')));
  }

  return overdue.length;
}
