/**
 * Succession — **requested, never claimed** (013 T044–T049, T065–T067).
 *
 * ```
 * master inactive 14 days   →  an officer MAY ask
 *                +  7 days  →  it completes, if unchallenged
 * ```
 *
 * ### The two clocks measure different things, and the asymmetry is the design
 *
 * *Availability* is measured in **gameplay** — `player_ratings.last_activity_at`,
 * written when somebody edits a defense squad or finishes a battle. *Lapsing* is
 * measured in **presence**: signing in is enough.
 *
 * So it is **hard to start and easy to stop**, which is the correct bias. The
 * failure mode on one side is a dead guild nobody can fix; on the other it is
 * somebody losing their guild while on holiday, and the second is worse. A master
 * who opens the game once in three weeks keeps their guild without doing anything
 * at all.
 *
 * ### Presence is the reply, so the email carries no link
 *
 * FR-022, and it is a security property rather than a convenience: there is no URL
 * in that message that grants anything, so **there is nothing to phish**. A
 * "confirm you are still here" button would be the single most impersonatable email
 * this game could send.
 *
 * ### It is economically neutral (SC-006)
 *
 * 650 moves from the inheriting officer to the displaced master. Nothing is created
 * and nothing is destroyed — the fee **prices a manual support ticket** and makes
 * the displaced master whole. *Losing a guild you abandoned is not the same as
 * being robbed.* Note that disbanding refunds nothing, and the difference is
 * deliberate: the rule is *a guild costs 650 to hold*.
 *
 * ### The 650 is checked twice
 *
 * At the request and **again at completion**. An officer who could afford it on day
 * 14 and spent it by day 21 does not inherit — otherwise the transfer could mint
 * shards from an account that no longer has them.
 */

import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { guildMembers, guildSuccessions, guilds } from '../db/schema/guilds.js';
import { shardLedger } from '../db/schema/ledger.js';
import { playerRatings } from '../db/schema/ratings.js';
import { accounts } from '../db/schema/accounts.js';
import { balance } from '../progression/ledger.js';
import { contactAddress } from '../payments/receipt.js';
import { sendIfPossible } from './notify.js';
import { addDays, daysBetween, type Clock } from './clock.js';
import {
  FOUNDING_COST_SHARDS,
  SUCCESSION_GRACE_DAYS,
  SUCCESSION_INACTIVE_DAYS,
} from './config.js';
import { authorise, masterOf, membershipOf } from './membership.js';

/**
 * When the master was last *seen playing*.
 *
 * `last_activity_at` is null for an account that has never played, so the fallback
 * is `created_at` — the same rule `candidates.ts` uses for pool eligibility. A
 * brand-new master is not "infinitely inactive"; they are as old as their account.
 */
async function lastActiveAt(accountId: string): Promise<Date | null> {
  const [row] = await db()
    .select({
      lastActivityAt: playerRatings.lastActivityAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!row) return null;
  return row.lastActivityAt ?? row.createdAt;
}

export interface SuccessionView {
  readonly id: string;
  readonly guildId: string;
  readonly requestedBy: string;
  readonly formerMasterId: string;
  readonly requestedAt: Date;
  readonly completesAt: Date;
  readonly state: string;
}

export type RequestResult =
  | { readonly ok: true; readonly succession: SuccessionView }
  | {
      readonly ok: false;
      readonly reason:
        | 'forbidden'
        | 'master-is-active'
        | 'insufficient-shards'
        | 'already-pending'
        | 'no-master';
      readonly masterLastSeen?: Date;
      readonly required?: number;
      readonly available?: number;
    };

export async function requestSuccession(
  guildId: string,
  actorId: string,
  clock: Clock,
): Promise<RequestResult> {
  const { allowed, role } = await authorise(guildId, actorId, 'succession');

  /**
   * The master is excluded by the permission table itself — `master` has no
   * `succession` mark, because succession is a petition *against* the master and
   * the one person who cannot file it is the person it is about.
   */
  if (!allowed || role !== 'officer') return { ok: false, reason: 'forbidden' };

  const master = await masterOf(guildId);
  if (!master) return { ok: false, reason: 'no-master' };

  const [pending] = await db()
    .select({ id: guildSuccessions.id })
    .from(guildSuccessions)
    .where(and(eq(guildSuccessions.guildId, guildId), eq(guildSuccessions.state, 'pending')))
    .limit(1);

  if (pending) return { ok: false, reason: 'already-pending' };

  const seen = await lastActiveAt(master);
  const now = clock.now();
  if (seen === null || daysBetween(seen, now) < SUCCESSION_INACTIVE_DAYS) {
    return { ok: false, reason: 'master-is-active', ...(seen ? { masterLastSeen: seen } : {}) };
  }

  const available = await balance(actorId);
  if (available < FOUNDING_COST_SHARDS) {
    return {
      ok: false,
      reason: 'insufficient-shards',
      required: FOUNDING_COST_SHARDS,
      available,
    };
  }

  const completesAt = addDays(now, SUCCESSION_GRACE_DAYS);

  const [row] = await db()
    .insert(guildSuccessions)
    .values({
      guildId,
      requestedBy: actorId,
      formerMasterId: master,
      requestedAt: now,
      completesAt,
    })
    .returning({ id: guildSuccessions.id });

  await notifyMaster(master, guildId, completesAt);

  return {
    ok: true,
    succession: {
      id: row!.id,
      guildId,
      requestedBy: actorId,
      formerMasterId: master,
      requestedAt: now,
      completesAt,
      state: 'pending',
    },
  };
}

/**
 * The email (FR-021 · Constitution XIX).
 *
 * Through the **already-installed** `Mailer` — 011 put a sender behind the vendor
 * interface and `installMailer()` wires it at startup. A second sender here would
 * be a second vendor dependency for the same job, and `grantPath.test.ts` scans for
 * exactly that.
 *
 * **No link, and the body says why.** A player who receives this and does nothing
 * except open the game keeps their guild.
 */
async function notifyMaster(masterId: string, guildId: string, completesAt: Date): Promise<void> {
  const to = await contactAddress(masterId);
  if (!to) return;

  const [guild] = await db()
    .select({ name: guilds.name })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  await sendIfPossible({
    to,
    subject: `Someone has asked to take over ${guild?.name ?? 'your guild'}`,
    text: [
      `An officer of ${guild?.name ?? 'your guild'} has asked to become its master,`,
      `because the guild has had no activity from you for ${SUCCESSION_INACTIVE_DAYS} days.`,
      ``,
      `You have until ${completesAt.toUTCString()} to stop this.`,
      ``,
      `To stop it: sign in to LMNTLZ. That is the whole thing — there is no button`,
      `to press and no link in this email, deliberately. We will never send you a`,
      `link that changes who owns your guild, so anything that looks like one is`,
      `not from us.`,
      ``,
      `If you would rather hand the guild over, you can do that from the roster.`,
      `If nothing happens, the officer becomes master, pays ${FOUNDING_COST_SHARDS} shards,`,
      `and you are refunded ${FOUNDING_COST_SHARDS} — you keep your place as a member.`,
    ].join('\n'),
  });
}

/**
 * **Presence is the reply** (FR-022 · T065).
 *
 * Called from the sign-in path, not from a guilds route — an absent master hits no
 * guilds route *by definition*, so a lapse written only inside this module is a
 * lapse that never fires and a master who loses their guild by logging in.
 *
 * Cheap enough to run on every sign-in: one indexed update over a table that will
 * hold a handful of rows.
 */
export async function noteSignedIn(accountId: string, clock: Clock): Promise<number> {
  const lapsed = await db()
    .update(guildSuccessions)
    .set({ state: 'lapsed', lapsedAt: clock.now() })
    .where(
      and(eq(guildSuccessions.formerMasterId, accountId), eq(guildSuccessions.state, 'pending')),
    )
    .returning({ id: guildSuccessions.id });

  return lapsed.length;
}

export type CompleteResult =
  | { readonly ok: true; readonly newMasterId: string; readonly formerMasterId: string }
  | {
      readonly ok: false;
      readonly reason: 'not-pending' | 'not-due' | 'requester-cannot-pay' | 'requester-left';
    };

/**
 * Complete one succession. **Idempotent, and safe to call from anywhere.**
 *
 * The `state = 'pending'` guard inside the update is what makes a double call
 * harmless — two concurrent resolvers cannot both transfer, because only one of
 * them changes a row.
 */
export async function completeSuccession(
  successionId: string,
  clock: Clock,
): Promise<CompleteResult> {
  const [row] = await db()
    .select()
    .from(guildSuccessions)
    .where(eq(guildSuccessions.id, successionId))
    .limit(1);

  if (!row || row.state !== 'pending') return { ok: false, reason: 'not-pending' };

  const now = clock.now();
  if (row.completesAt > now) return { ok: false, reason: 'not-due' };

  /** An officer who left the guild cannot inherit it. */
  const requester = await membershipOf(row.requestedBy);
  if (!requester || requester.guildId !== row.guildId) {
    await db()
      .update(guildSuccessions)
      .set({ state: 'refused', completedAt: now })
      .where(and(eq(guildSuccessions.id, successionId), eq(guildSuccessions.state, 'pending')));

    return { ok: false, reason: 'requester-left' };
  }

  /**
   * **Checked again, here.** An officer who could afford 650 on day 14 and spent
   * it by day 21 does not inherit; without this the transfer would credit the
   * former master from an account that cannot cover it, minting shards.
   */
  const available = await balance(row.requestedBy);
  if (available < FOUNDING_COST_SHARDS) {
    await db()
      .update(guildSuccessions)
      .set({ state: 'refused', completedAt: now })
      .where(and(eq(guildSuccessions.id, successionId), eq(guildSuccessions.state, 'pending')));

    return { ok: false, reason: 'requester-cannot-pay' };
  }

  const claimed = await db()
    .update(guildSuccessions)
    .set({ state: 'completed', completedAt: now })
    .where(and(eq(guildSuccessions.id, successionId), eq(guildSuccessions.state, 'pending')))
    .returning({ id: guildSuccessions.id });

  /** Somebody else completed it between the read and here. Not an error. */
  if (claimed.length === 0) return { ok: false, reason: 'not-pending' };

  await db().transaction(async (tx) => {
    await tx
      .update(guildMembers)
      .set({ role: 'master' })
      .where(eq(guildMembers.accountId, row.requestedBy));

    /**
     * FR-025 — **a displaced master stays a Member**, not removed. They built the
     * guild; losing the office is not the same as being thrown out of it.
     */
    await tx
      .update(guildMembers)
      .set({ role: 'member' })
      .where(
        and(
          eq(guildMembers.accountId, row.formerMasterId),
          eq(guildMembers.guildId, row.guildId),
        ),
      );

    /** Two rows, one instant, one reason. SC-006 asserts they sum to zero. */
    await tx.insert(shardLedger).values([
      { accountId: row.requestedBy, delta: -FOUNDING_COST_SHARDS, reason: 'guild-succession' },
      { accountId: row.formerMasterId, delta: FOUNDING_COST_SHARDS, reason: 'guild-succession' },
    ]);
  });

  return { ok: true, newMasterId: row.requestedBy, formerMasterId: row.formerMasterId };
}

/**
 * Everything due, resolved (T067).
 *
 * ⛔ **There is no registered schedule**, the same gap 008's replay cleanup has —
 * 016 owns cron. So this is also called **on the read path**, from `GET
 * /v1/me/guild`: succession is the one timer where *"the job never ran"* means a
 * guild is frozen forever, which is the exact failure the story exists to prevent.
 * A guild being read is a guild somebody is looking at, which is when it matters.
 */
export async function resolveDue(clock: Clock, limit = 100): Promise<number> {
  const due = await db()
    .select({ id: guildSuccessions.id })
    .from(guildSuccessions)
    .where(
      and(
        eq(guildSuccessions.state, 'pending'),
        lte(guildSuccessions.completesAt, clock.now()),
        isNull(guildSuccessions.completedAt),
      ),
    )
    .limit(limit);

  let completed = 0;
  for (const row of due) {
    const result = await completeSuccession(row.id, clock);
    if (result.ok) completed++;
  }

  return completed;
}

/** The pending succession for a guild, if any — for the roster to display. */
export async function pendingSuccession(guildId: string): Promise<SuccessionView | null> {
  const [row] = await db()
    .select()
    .from(guildSuccessions)
    .where(and(eq(guildSuccessions.guildId, guildId), eq(guildSuccessions.state, 'pending')))
    .limit(1);

  return row
    ? {
        id: row.id,
        guildId: row.guildId,
        requestedBy: row.requestedBy,
        formerMasterId: row.formerMasterId,
        requestedAt: row.requestedAt,
        completesAt: row.completesAt,
        state: row.state,
      }
    : null;
}
