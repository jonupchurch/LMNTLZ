/**
 * Applications, and **first-acceptance-wins** (013 T012–T016, T019, T057).
 *
 * ### The whole feature is one transaction and one constraint
 *
 * Two guilds can accept the same applicant at the same instant, from two different
 * connections, and exactly one must win. The mechanism is not a lock we take — it
 * is `UNIQUE (account_id)` on `guild_members`, and the winner is whoever's `INSERT`
 * lands first. The loser gets `23505` and is told *"Reyna joined The Long Reach a
 * moment ago"*, which is true and useful, rather than a 500, which is neither.
 *
 * **Locking the guild row would be wrong** — it serialises two *different* guilds
 * accepting two *different* applicants, contention bought for nothing. **Locking
 * the application row would be worse** — two guilds accepting two *different*
 * applications from the same player touch different rows, conflict on nothing, and
 * produce two memberships. *Lock what the invariant is about*, and the invariant is
 * about the applicant.
 *
 * ### Withdrawal is in the same transaction as the membership, and that is the bug
 *
 * Written as two steps there is a window where the player is in a guild **and**
 * still has open applications, and a second acceptance inside that window is a
 * second membership. The window is small. It is not zero, and *small* is exactly
 * the size of bug that reaches production and then cannot be reproduced.
 *
 * ### The starter-league exit goes through 009's function, not through SQL
 *
 * `contracts/guilds-api.md` shows the raw `UPDATE accounts SET starter_exited_at`
 * for illustration. **We call `guildJoined()` instead**, which 009 wrote as *"one
 * rule, two doors"* — it carries the `isNull` guard that makes the exit one-way and
 * idempotent, so a double-accept cannot relabel an earlier exit. Two hand-rolled
 * updates reaching for the same write eventually disagree about what the write is.
 */

import { and, count, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { guildApplications, guildMembers, guilds } from '../db/schema/guilds.js';
import { guildJoined } from '../matchmaking/starterLeague.js';
import { addDays, type Clock } from './clock.js';
import {
  APPLICATION_EXPIRY_DAYS,
  GUILD_CAPACITY,
  MAX_APPLICATION_MESSAGE_LENGTH,
  MAX_CONCURRENT_APPLICATIONS,
  REAPPLY_COOLDOWN_HOURS,
} from './config.js';
import { membershipOf } from './membership.js';

/** Postgres' unique-violation SQLSTATE. The signal that this acceptance lost. */
const UNIQUE_VIOLATION = '23505';

/**
 * **Walks the `cause` chain, and it has to.**
 *
 * Drizzle wraps a driver error in its own `Error("Failed query: ...")` and hangs
 * the original off `cause`, so `error.code` on what you catch is `undefined`. A
 * check that only looked at the top level compiled, read correctly, and let every
 * losing acceptance escape as a **500** — which is the precise failure
 * `firstAcceptance.test.ts` was written to catch, and it caught it on the first
 * run. Depth-limited so a self-referential `cause` cannot spin.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current !== null && current !== undefined && depth < 5; depth++) {
    if (typeof current !== 'object') return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export type ApplyResult =
  | { readonly ok: true; readonly applicationId: string; readonly expiresAt: Date }
  | {
      readonly ok: false;
      readonly reason:
        | 'already-in-a-guild'
        | 'budget-exhausted'
        | 'cooldown'
        | 'already-applied'
        | 'guild-full'
        | 'no-such-guild'
        | 'message-too-long';
      /** For `budget-exhausted`, so the client can show the budget it hit. */
      readonly open?: number;
      /** For `cooldown`, when they may try this guild again. */
      readonly retryAt?: Date;
    };

/**
 * The applicant's budget, **shown rather than discovered** (FR-008).
 *
 * Exported because the client renders *"3 of 5 open"* beside the button. A cap a
 * player only learns about by hitting it is a cap that reads as a bug.
 */
export async function openApplicationCount(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(guildApplications)
    .where(and(eq(guildApplications.accountId, accountId), eq(guildApplications.state, 'open')));

  return row?.n ?? 0;
}

export async function apply(
  accountId: string,
  guildId: string,
  message: string,
  clock: Clock,
): Promise<ApplyResult> {
  if (message.length > MAX_APPLICATION_MESSAGE_LENGTH) {
    return { ok: false, reason: 'message-too-long' };
  }

  if (await membershipOf(accountId)) return { ok: false, reason: 'already-in-a-guild' };

  const [guild] = await db()
    .select({ id: guilds.id, disbandedAt: guilds.disbandedAt })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  if (!guild || guild.disbandedAt !== null) return { ok: false, reason: 'no-such-guild' };

  /**
   * Expire lazily on read, so the budget is honest **even though the sweep is not
   * registered yet** (T059). Without this an unregistered job would silently mean
   * five applications is a lifetime allowance.
   */
  await expireOverdue(clock);

  const open = await openApplicationCount(accountId);
  if (open >= MAX_CONCURRENT_APPLICATIONS) {
    return { ok: false, reason: 'budget-exhausted', open };
  }

  const [existing] = await db()
    .select({ state: guildApplications.state, closedAt: guildApplications.closedAt })
    .from(guildApplications)
    .where(
      and(eq(guildApplications.accountId, accountId), eq(guildApplications.guildId, guildId)),
    )
    .orderBy(desc(guildApplications.createdAt))
    .limit(1);

  if (existing?.state === 'open') return { ok: false, reason: 'already-applied' };

  /**
   * FR-014. **A dismissal is shown as a dismissal, and costs 24 hours.**
   *
   * The cooldown is on the *dismissed* state only. An application that merely
   * expired, or was withdrawn because the player joined elsewhere and then left,
   * carries no penalty — they were not turned down.
   */
  if (existing?.state === 'dismissed' && existing.closedAt) {
    const retryAt = new Date(existing.closedAt.getTime() + REAPPLY_COOLDOWN_HOURS * 3_600_000);
    if (clock.now() < retryAt) return { ok: false, reason: 'cooldown', retryAt };
  }

  const [members] = await db()
    .select({ n: count() })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  if ((members?.n ?? 0) >= GUILD_CAPACITY) return { ok: false, reason: 'guild-full' };

  const now = clock.now();
  const expiresAt = addDays(now, APPLICATION_EXPIRY_DAYS);

  const [row] = await db()
    .insert(guildApplications)
    .values({ accountId, guildId, message, createdAt: now, expiresAt })
    .returning({ id: guildApplications.id });

  return { ok: true, applicationId: row!.id, expiresAt };
}

export type AcceptResult =
  | { readonly ok: true; readonly guildId: string; readonly accountId: string }
  | {
      readonly ok: false;
      readonly reason: 'already-joined';
      /** Which guild got them, so the losing officer sees a sentence, not an error. */
      readonly guildId: string;
    }
  | { readonly ok: false; readonly reason: 'expired' | 'not-open' | 'guild-full' | 'no-such-application' };

/**
 * Accept an application. **One transaction, and the membership insert goes first.**
 *
 * The order inside the transaction is deliberate: insert the contended row *before*
 * doing anything else, so a loser fails immediately and does no work. Postgres
 * aborts the whole transaction on the `23505` anyway, but failing on the first
 * statement is what makes the loser cheap.
 *
 * `actorId` is authorised by the caller — `routes.ts` checks `accept` against the
 * permission table before reaching here, and `roles.test.ts` proves an ordinary
 * member gets a 403 from the route.
 */
export async function acceptApplication(
  applicationId: string,
  clock: Clock,
): Promise<AcceptResult> {
  const [application] = await db()
    .select({
      id: guildApplications.id,
      accountId: guildApplications.accountId,
      guildId: guildApplications.guildId,
      state: guildApplications.state,
      expiresAt: guildApplications.expiresAt,
    })
    .from(guildApplications)
    .where(eq(guildApplications.id, applicationId))
    .limit(1);

  if (!application) return { ok: false, reason: 'no-such-application' };
  if (application.state !== 'open') return { ok: false, reason: 'not-open' };

  const now = clock.now();
  if (application.expiresAt <= now) {
    await db()
      .update(guildApplications)
      .set({ state: 'expired', closedAt: now })
      .where(and(eq(guildApplications.id, applicationId), eq(guildApplications.state, 'open')));

    return { ok: false, reason: 'expired' };
  }

  const [members] = await db()
    .select({ n: count() })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, application.guildId));

  if ((members?.n ?? 0) >= GUILD_CAPACITY) return { ok: false, reason: 'guild-full' };

  try {
    await db().transaction(async (tx) => {
      /** The contended row. A `23505` here means this acceptance LOST the race. */
      await tx
        .insert(guildMembers)
        .values({ accountId: application.accountId, guildId: application.guildId, role: 'member' });

      /**
       * Every *other* open application, withdrawn. **Same transaction** — see the
       * header: two operations leave a window, and a second acceptance in that
       * window is a second membership.
       */
      await tx
        .update(guildApplications)
        .set({ state: 'withdrawn', closedAt: now })
        .where(
          and(
            eq(guildApplications.accountId, application.accountId),
            eq(guildApplications.state, 'open'),
            ne(guildApplications.id, applicationId),
          ),
        );

      await tx
        .update(guildApplications)
        .set({ state: 'accepted', closedAt: now })
        .where(eq(guildApplications.id, applicationId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await membershipOf(application.accountId);
      return { ok: false, reason: 'already-joined', guildId: existing?.guildId ?? '' };
    }
    throw error;
  }

  /**
   * **Outside the transaction, deliberately.** 009 owns this write and owns its
   * idempotence; reaching into `accounts` from inside our transaction would be
   * this feature reimplementing a rule that already has a single home. The
   * `isNull` guard there means a retry cannot relabel an earlier exit, so the
   * only cost of doing it after the commit is that a crash between the two leaves
   * a guild member still in the starter league — which the next call corrects,
   * because the exit is idempotent.
   */
  await guildJoined(application.accountId);

  return { ok: true, guildId: application.guildId, accountId: application.accountId };
}

export type DismissResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-open' | 'no-such-application' };

/** FR-014. **Dismissed, not vanished** — the applicant is told, and waits 24 hours. */
export async function dismissApplication(
  applicationId: string,
  clock: Clock,
): Promise<DismissResult> {
  const result = await db()
    .update(guildApplications)
    .set({ state: 'dismissed', closedAt: clock.now() })
    .where(and(eq(guildApplications.id, applicationId), eq(guildApplications.state, 'open')))
    .returning({ id: guildApplications.id });

  return result.length > 0 ? { ok: true } : { ok: false, reason: 'not-open' };
}

/** The applicant withdrawing on their own. */
export async function withdrawApplication(
  applicationId: string,
  accountId: string,
  clock: Clock,
): Promise<DismissResult> {
  const result = await db()
    .update(guildApplications)
    .set({ state: 'withdrawn', closedAt: clock.now() })
    .where(
      and(
        eq(guildApplications.id, applicationId),
        eq(guildApplications.accountId, accountId),
        eq(guildApplications.state, 'open'),
      ),
    )
    .returning({ id: guildApplications.id });

  return result.length > 0 ? { ok: true } : { ok: false, reason: 'not-open' };
}

/**
 * FR-009 — the 7-day sweep (T016).
 *
 * **Resumable, safe to re-run, and driven from Postgres**, the same shape as
 * feature 008's replay cleanup: no cursor to lose, no state outside the rows
 * themselves. Running it twice is running it once.
 *
 * ⛔ **Its schedule is not registered** — see `README.md`. That is why `apply()`
 * calls it on the read path: an expiry nobody runs means the 5-application budget
 * is a lifetime allowance, and the player who hits it has no way to tell.
 */
export async function expireOverdue(clock: Clock, limit = 500): Promise<number> {
  const now = clock.now();

  const overdue = await db()
    .select({ id: guildApplications.id })
    .from(guildApplications)
    .where(and(eq(guildApplications.state, 'open'), lt(guildApplications.expiresAt, now)))
    .limit(limit);

  if (overdue.length === 0) return 0;

  await db()
    .update(guildApplications)
    .set({ state: 'expired', closedAt: now })
    .where(
      and(
        inArray(
          guildApplications.id,
          overdue.map((r) => r.id),
        ),
        eq(guildApplications.state, 'open'),
      ),
    );

  return overdue.length;
}

export interface ApplicationView {
  readonly id: string;
  readonly guildId: string;
  readonly accountId: string;
  readonly state: string;
  readonly message: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** An applicant's own list — their budget, made visible. */
export async function applicationsOf(accountId: string): Promise<readonly ApplicationView[]> {
  return db()
    .select({
      id: guildApplications.id,
      guildId: guildApplications.guildId,
      accountId: guildApplications.accountId,
      state: guildApplications.state,
      message: guildApplications.message,
      createdAt: guildApplications.createdAt,
      expiresAt: guildApplications.expiresAt,
    })
    .from(guildApplications)
    .where(eq(guildApplications.accountId, accountId))
    .orderBy(desc(guildApplications.createdAt))
    .limit(50);
}

/**
 * An officer's review queue. **Open ones only.**
 *
 * *Applications survive the reviewer* — nothing here is scoped to who is asking,
 * so an officer removed mid-review does not take the queue with them.
 */
export async function pendingFor(guildId: string): Promise<readonly ApplicationView[]> {
  return db()
    .select({
      id: guildApplications.id,
      guildId: guildApplications.guildId,
      accountId: guildApplications.accountId,
      state: guildApplications.state,
      message: guildApplications.message,
      createdAt: guildApplications.createdAt,
      expiresAt: guildApplications.expiresAt,
    })
    .from(guildApplications)
    .where(and(eq(guildApplications.guildId, guildId), eq(guildApplications.state, 'open')))
    .orderBy(guildApplications.createdAt);
}
