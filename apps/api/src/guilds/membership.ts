/**
 * Roster, roles and the permission table (013 T020, T037, T038, T054).
 *
 * ### Three roles, and the permissions are enforced here
 *
 * | | invite | accept | kick | succession | motd | emblem | disband |
 * |---|---|---|---|---|---|---|---|
 * | **master** | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
 * | **officer** | ✓ | ✓ | ✓ | ✓ | ✓ | | |
 * | **member** | | | | | | | |
 *
 * **Server-side, never by hiding a control** (Constitution XII). A client that
 * wrongly renders the disband button must still get a `403` when it presses it —
 * that is what `roles.test.ts` asserts, rather than asserting the button is absent.
 *
 * The master has no `succession` mark and that is not an oversight: succession is a
 * petition *against* the master, so the one person who cannot file it is the person
 * it is about.
 *
 * ### A guild with no members is dissolved, and the 650 does not come back
 *
 * *Succession refunds where disbanding does not*, and the difference is
 * deliberate — the rule is **a guild costs 650 to hold**, not *you get your money
 * back*. Dissolution marks `disbanded_at` rather than deleting the row, because
 * applications, invitations and battle records point at it and **the past is
 * immutable** (Constitution XVI).
 */

import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  guildMembers,
  guilds,
  type GuildRole,
} from '../db/schema/guilds.js';
import { GUILD_CAPACITY, MAX_OFFICERS } from './config.js';
import type { Clock } from './clock.js';

/** Everything a role may be asked to authorise. */
export const GUILD_PERMISSIONS = [
  'invite',
  'accept',
  'kick',
  'succession',
  'motd',
  'emblem',
  'pitch',
  'disband',
] as const;
export type GuildPermission = (typeof GUILD_PERMISSIONS)[number];

/**
 * The table itself, as data.
 *
 * Data rather than a chain of `if (role === 'master')`, because the test asserts
 * the **grid** — six rows across three roles — and a grid is only checkable against
 * something that has the shape of a grid. A conditional would be checked by
 * restating the conditional.
 */
const PERMISSIONS: Record<GuildRole, ReadonlySet<GuildPermission>> = {
  master: new Set<GuildPermission>([
    'invite',
    'accept',
    'kick',
    'motd',
    'emblem',
    'pitch',
    'disband',
  ]),
  officer: new Set<GuildPermission>(['invite', 'accept', 'kick', 'succession', 'motd']),
  member: new Set<GuildPermission>(),
};

export function roleCan(role: GuildRole, permission: GuildPermission): boolean {
  return PERMISSIONS[role].has(permission);
}

export interface Membership {
  readonly guildId: string;
  readonly role: GuildRole;
  readonly joinedAt: Date;
}

/** A player's guild, or `null`. **At most one, by `UNIQUE (account_id)`.** */
export async function membershipOf(accountId: string): Promise<Membership | null> {
  const [row] = await db()
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      joinedAt: guildMembers.joinedAt,
    })
    .from(guildMembers)
    .where(eq(guildMembers.accountId, accountId))
    .limit(1);

  return row ?? null;
}

/**
 * Whether `actorId` may do `permission` in `guildId`.
 *
 * Returns the role too, because every caller that asks *"may they?"* also wants to
 * say *"you are an officer, and officers cannot disband"* — an unexplained 403 is
 * how a player concludes the game is broken rather than that they lack a
 * permission.
 */
export async function authorise(
  guildId: string,
  actorId: string,
  permission: GuildPermission,
): Promise<{ readonly allowed: boolean; readonly role: GuildRole | null }> {
  const membership = await membershipOf(actorId);
  if (!membership || membership.guildId !== guildId) return { allowed: false, role: null };

  return { allowed: roleCan(membership.role, permission), role: membership.role };
}

export async function memberCount(guildId: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  return row?.n ?? 0;
}

/** FR-005 · SC-003. Read immediately before an insert, and again by the insert. */
export async function hasRoom(guildId: string): Promise<boolean> {
  return (await memberCount(guildId)) < GUILD_CAPACITY;
}

export interface RosterEntry {
  readonly accountId: string;
  readonly role: GuildRole;
  readonly joinedAt: Date;
}

export async function roster(guildId: string): Promise<readonly RosterEntry[]> {
  return db()
    .select({
      accountId: guildMembers.accountId,
      role: guildMembers.role,
      joinedAt: guildMembers.joinedAt,
    })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId))
    .orderBy(guildMembers.joinedAt);
}

export type RoleChange =
  | { readonly ok: true; readonly role: GuildRole }
  | { readonly ok: false; readonly reason: 'not-a-member' | 'forbidden' | 'officer-limit' };

/**
 * Promote to officer or demote to member. **`master` is not reachable here** —
 * the only two ways to become master are founding and succession, and adding a
 * third would be a hand-over with none of succession's protections.
 */
export async function setRole(
  guildId: string,
  actorId: string,
  targetId: string,
  role: Exclude<GuildRole, 'master'>,
): Promise<RoleChange> {
  const actor = await authorise(guildId, actorId, 'kick');
  if (!actor.allowed || actor.role !== 'master') return { ok: false, reason: 'forbidden' };

  const target = await membershipOf(targetId);
  if (!target || target.guildId !== guildId) return { ok: false, reason: 'not-a-member' };
  if (target.role === 'master') return { ok: false, reason: 'forbidden' };

  if (role === 'officer' && target.role !== 'officer') {
    const [row] = await db()
      .select({ n: count() })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.role, 'officer')));

    if ((row?.n ?? 0) >= MAX_OFFICERS) return { ok: false, reason: 'officer-limit' };
  }

  await db().update(guildMembers).set({ role }).where(eq(guildMembers.accountId, targetId));

  return { ok: true, role };
}

export type LeaveResult =
  | { readonly ok: true; readonly dissolved: boolean }
  | { readonly ok: false; readonly reason: 'not-a-member' | 'master-must-hand-over' };

/**
 * Leave, or be removed.
 *
 * **A master cannot simply walk out of a populated guild.** Not a rule for its own
 * sake: leaving would produce a guild with officers and members and no one able to
 * disband, accept or set an emblem, and the only route back would be succession's
 * 21-day timer — a guild frozen by an action the master took deliberately. They
 * hand over first, or they disband. A master alone *may* leave, and that dissolves.
 */
export async function leaveGuild(accountId: string, clock: Clock): Promise<LeaveResult> {
  const membership = await membershipOf(accountId);
  if (!membership) return { ok: false, reason: 'not-a-member' };

  const remaining = (await memberCount(membership.guildId)) - 1;
  if (membership.role === 'master' && remaining > 0) {
    return { ok: false, reason: 'master-must-hand-over' };
  }

  await db().delete(guildMembers).where(eq(guildMembers.accountId, accountId));

  if (remaining > 0) return { ok: true, dissolved: false };

  await dissolve(membership.guildId, clock);
  return { ok: true, dissolved: true };
}

export type KickResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'forbidden' | 'not-a-member' | 'outranked' };

export async function kick(
  guildId: string,
  actorId: string,
  targetId: string,
): Promise<KickResult> {
  const actor = await authorise(guildId, actorId, 'kick');
  if (!actor.allowed || actor.role === null) return { ok: false, reason: 'forbidden' };

  const target = await membershipOf(targetId);
  if (!target || target.guildId !== guildId) return { ok: false, reason: 'not-a-member' };

  /**
   * An officer may remove members; only the master may remove an officer. And
   * nobody removes the master — that is what succession is for, and it has a
   * 21-day timer precisely so this cannot be done in one click.
   */
  if (target.role === 'master') return { ok: false, reason: 'outranked' };
  if (target.role === 'officer' && actor.role !== 'master') return { ok: false, reason: 'outranked' };
  if (targetId === actorId) return { ok: false, reason: 'outranked' };

  await db().delete(guildMembers).where(eq(guildMembers.accountId, targetId));
  return { ok: true };
}

/**
 * Mark a guild dissolved. **The founding fee is not returned** (FR-001).
 *
 * Rows are removed from the roster but the guild row stays, marked. Deleting it
 * would cascade away the applications and invitations that record how people came
 * and went, and those are history.
 */
export async function dissolve(guildId: string, clock: Clock): Promise<void> {
  await db().delete(guildMembers).where(eq(guildMembers.guildId, guildId));
  await db()
    .update(guilds)
    .set({ disbandedAt: clock.now() })
    .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)));
}

export type DisbandResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'forbidden' };

export async function disband(
  guildId: string,
  actorId: string,
  clock: Clock,
): Promise<DisbandResult> {
  const actor = await authorise(guildId, actorId, 'disband');
  if (!actor.allowed) return { ok: false, reason: 'forbidden' };

  await dissolve(guildId, clock);
  return { ok: true };
}

/** The master of a guild, or `null` for a dissolved one. */
export async function masterOf(guildId: string): Promise<string | null> {
  const [row] = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.role, 'master')))
    .limit(1);

  return row?.accountId ?? null;
}

/** Officers, for the succession check. Excludes the master by construction. */
export async function officersOf(guildId: string): Promise<readonly string[]> {
  const rows = await db()
    .select({ accountId: guildMembers.accountId })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.role, 'officer')));

  return rows.map((r) => r.accountId);
}
