/**
 * Succession, **all four branches, on an injected clock** (013 T040–T043, T065
 * · FR-020–FR-025 · SC-005, SC-006).
 *
 * ### TL;DR
 *
 * If a guild's leader stops playing for two weeks, a deputy can ask to take over.
 * The leader then gets a week, and **simply opening the game cancels it**. If they
 * never come back, the deputy takes over, pays 650, and the old leader is paid 650
 * and stays in the guild as an ordinary member.
 *
 * ### 21 days across two timers, so none of this is testable by waiting
 *
 * That is why the clock was Phase 2 and not an afterthought. An implementation
 * requiring three weeks of wall-clock is an implementation that ships untested.
 *
 * ### The day-22 branch is the one worth naming
 *
 * A master who returns *just too late* loses their guild, and nothing gives it
 * back. **That is what a real person experiences as unfair**, and it is the branch
 * nobody thinks to write. Succession being final is a deliberate decision **only
 * because this test exists** — without it, it is merely what the code happened to
 * do.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { guildMembers, guildSuccessions } from '../../src/db/schema/guilds.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { balance } from '../../src/progression/ledger.js';
import { movableClock } from '../../src/guilds/clock.js';
import {
  FOUNDING_COST_SHARDS,
  SUCCESSION_GRACE_DAYS,
  SUCCESSION_INACTIVE_DAYS,
} from '../../src/guilds/config.js';
import {
  completeSuccession,
  noteSignedIn,
  pendingSuccession,
  requestSuccession,
  resolveDue,
} from '../../src/guilds/succession.js';
import { Fixtures } from './helpers.js';

const START = '2026-08-01T00:00:00.000Z';
const fx = new Fixtures();

/** A guild whose master last played `daysAgo`, and an officer holding `shards`. */
async function scenario(
  tag: string,
  daysAgo: number,
  shards = FOUNDING_COST_SHARDS,
): Promise<{ guildId: string; master: string; officer: string }> {
  const master = await fx.account(`${tag}M`);
  const guild = await fx.guild(tag, master);
  const officer = await fx.account(`${tag}O`);
  await fx.join(guild.id, officer, 'officer');

  await db()
    .insert(playerRatings)
    .values({
      accountId: master,
      lastActivityAt: new Date(Date.parse(START) - daysAgo * 86_400_000),
    });

  if (shards > 0) {
    await db().insert(shardLedger).values({ accountId: officer, delta: shards, reason: 'grant' });
  }

  return { guildId: guild.id, master, officer };
}

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('a request needs 14 days of silence (FR-020)', () => {
  it('refuses at 13 days, and says when the master was last seen', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('s13', SUCCESSION_INACTIVE_DAYS - 1);

    const result = await requestSuccession(guildId, officer, clock);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('master-is-active');
    expect(!result.ok && result.masterLastSeen).toBeInstanceOf(Date);
  });

  it('accepts at 14 days', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('s14', SUCCESSION_INACTIVE_DAYS);

    const result = await requestSuccession(guildId, officer, clock);
    expect(result.ok, 'fourteen days of silence is the stated bar').toBe(true);
  });

  it('refuses the MASTER — the petition is about them (FR-017)', async () => {
    const clock = movableClock(START);
    const { guildId, master } = await scenario('sSelf', SUCCESSION_INACTIVE_DAYS);

    const result = await requestSuccession(guildId, master, clock);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('forbidden');
  });

  it('refuses an ordinary member', async () => {
    const clock = movableClock(START);
    const { guildId } = await scenario('sMember', SUCCESSION_INACTIVE_DAYS);
    const member = await fx.account('sMemberX');
    await fx.join(guildId, member);

    const result = await requestSuccession(guildId, member, clock);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('forbidden');
  });

  it('refuses an officer who cannot afford 650 (FR-024)', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('sPoor', SUCCESSION_INACTIVE_DAYS, 0);

    const result = await requestSuccession(guildId, officer, clock);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('insufficient-shards');
  });
});

describe('the four branches', () => {
  it('1 — the master returns at day 13: nothing to return to, it is not available', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('b13', 13);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(false);
    expect(await pendingSuccession(guildId)).toBeNull();
  });

  it('2 — the master returns at day 20: it LAPSES, and they keep the guild (SC-005)', async () => {
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('b20', SUCCESSION_INACTIVE_DAYS);

    const requested = await requestSuccession(guildId, officer, clock);
    expect(requested.ok).toBe(true);

    /** Day 20 of 21. One day short. */
    clock.advanceDays(SUCCESSION_GRACE_DAYS - 1);
    const lapsed = await noteSignedIn(master, clock);
    expect(lapsed, 'signing in must lapse the pending request').toBe(1);

    /** And the deadline passing afterwards changes nothing. */
    clock.advanceDays(5);
    await resolveDue(clock);

    const [row] = await db()
      .select({ role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.accountId, master));

    expect(row?.role, 'a master who logged in NEVER loses their guild').toBe('master');
    expect(await pendingSuccession(guildId)).toBeNull();
  });

  it('3 — the master never returns: it COMPLETES at day 21 (FR-023, FR-025)', async () => {
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('b21', SUCCESSION_INACTIVE_DAYS);

    const requested = await requestSuccession(guildId, officer, clock);
    expect(requested.ok).toBe(true);

    /** One tick short of the deadline: still nothing. */
    clock.advanceDays(SUCCESSION_GRACE_DAYS - 1);
    expect(await resolveDue(clock)).toBe(0);

    clock.advanceDays(1);
    expect(await resolveDue(clock)).toBeGreaterThanOrEqual(1);

    const roles = await db()
      .select({ accountId: guildMembers.accountId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));

    expect(roles.find((r) => r.accountId === officer)?.role).toBe('master');
    /** FR-025 — displaced, **not removed**. They built the guild. */
    expect(
      roles.find((r) => r.accountId === master)?.role,
      'a displaced master stays a member of the guild',
    ).toBe('member');
  });

  it('4 — DAY 22: the master returns too late, and it is not reversed', async () => {
    /**
     * **The branch nobody writes.** It is what a real person experiences as
     * unfair, and succession being final is a deliberate decision only because
     * this assertion exists.
     */
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('b22', SUCCESSION_INACTIVE_DAYS);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(true);

    clock.advanceDays(SUCCESSION_GRACE_DAYS);
    await resolveDue(clock);

    clock.advanceDays(1);
    const lapsed = await noteSignedIn(master, clock);

    expect(lapsed, 'there is nothing pending left to lapse').toBe(0);

    const roles = await db()
      .select({ accountId: guildMembers.accountId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));

    expect(
      roles.find((r) => r.accountId === master)?.role,
      'returning after completion does not reverse it — succession is final',
    ).toBe('member');
    expect(roles.find((r) => r.accountId === officer)?.role).toBe('master');
  });
});

describe('the money (FR-023, SC-006)', () => {
  it('is economically neutral — 650 moves, nothing is created or destroyed', async () => {
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('money', SUCCESSION_INACTIVE_DAYS);

    const officerBefore = await balance(officer);
    const masterBefore = await balance(master);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(true);
    clock.advanceDays(SUCCESSION_GRACE_DAYS);
    await resolveDue(clock);

    const officerAfter = await balance(officer);
    const masterAfter = await balance(master);

    expect(officerAfter).toBe(officerBefore - FOUNDING_COST_SHARDS);
    expect(masterAfter).toBe(masterBefore + FOUNDING_COST_SHARDS);

    /** The sum is the assertion: a transfer, not revenue and not a grant. */
    expect(
      officerAfter + masterAfter,
      'succession must not mint or burn a single shard',
    ).toBe(officerBefore + masterBefore);
  });

  it('an officer who SPENT it by day 21 does not inherit — checked twice', async () => {
    /**
     * Affordable on day 14, gone by day 21. Without the second check the transfer
     * would credit the former master out of an account that cannot cover it,
     * minting shards from nothing.
     */
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('spent', SUCCESSION_INACTIVE_DAYS);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(true);

    await db()
      .insert(shardLedger)
      .values({ accountId: officer, delta: -250, reason: 'rune-stage' });

    clock.advanceDays(SUCCESSION_GRACE_DAYS);
    const completed = await resolveDue(clock);

    expect(completed, 'the 650 is checked AT COMPLETION, not only at initiation').toBe(0);

    const [row] = await db()
      .select({ role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.accountId, master));

    expect(row?.role).toBe('master');

    const [succession] = await db()
      .select({ state: guildSuccessions.state })
      .from(guildSuccessions)
      .where(eq(guildSuccessions.guildId, guildId));

    expect(succession?.state).toBe('refused');
  });
});

describe('resolution is idempotent and safe to re-run', () => {
  it('resolving twice transfers once', async () => {
    const clock = movableClock(START);
    const { guildId, master, officer } = await scenario('twice', SUCCESSION_INACTIVE_DAYS);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(true);
    clock.advanceDays(SUCCESSION_GRACE_DAYS);

    await resolveDue(clock);
    await resolveDue(clock);

    const rows = await db()
      .select({ delta: shardLedger.delta })
      .from(shardLedger)
      .where(eq(shardLedger.accountId, master));

    const credits = rows.filter((r) => r.delta === FOUNDING_COST_SHARDS);
    expect(credits, 'a second resolve must not pay the former master again').toHaveLength(1);
  });

  it('completing an already-completed succession is a result, not a throw', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('done', SUCCESSION_INACTIVE_DAYS);

    const requested = await requestSuccession(guildId, officer, clock);
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;

    clock.advanceDays(SUCCESSION_GRACE_DAYS);
    expect((await completeSuccession(requested.succession.id, clock)).ok).toBe(true);

    const again = await completeSuccession(requested.succession.id, clock);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.reason).toBe('not-pending');
  });
});

describe('the sign-in path is the one that lapses it (T065)', () => {
  it('SIGNING IN over HTTP lapses it — the wire, not the function', async () => {
    /**
     * **Driven through `POST /v1/auth/google`, deliberately.** Calling
     * `noteSignedIn()` here would prove the function works and prove nothing about
     * whether anything calls it — and an absent master hits no guilds route *by
     * definition*, so a lapse living only inside `succession.ts` is a function the
     * one person it protects never triggers.
     *
     * The subject is pinned so the second sign-in resolves to the **same account**
     * rather than making a new one. Cutting `noteSignedIn` from `auth/routes.ts`
     * fails this test and nothing else in the suite.
     */
    const { signIn } = await import('../profiles/session.js');
    const clock = movableClock(START);
    const subject = `lapse-${process.pid}-${Math.floor(Math.random() * 1e9)}`;

    const master = await signIn('lapseMaster', { subject });
    fx.accountIds.push(master.accountId);

    const guild = await fx.guild('lapse', master.accountId);
    const officer = await fx.account('lapseOfficer');
    await fx.join(guild.id, officer, 'officer');

    await db()
      .insert(playerRatings)
      .values({
        accountId: master.accountId,
        lastActivityAt: new Date(Date.parse(START) - SUCCESSION_INACTIVE_DAYS * 86_400_000),
      });
    await db()
      .insert(shardLedger)
      .values({ accountId: officer, delta: FOUNDING_COST_SHARDS, reason: 'grant' });

    expect((await requestSuccession(guild.id, officer, clock)).ok).toBe(true);
    expect(await pendingSuccession(guild.id)).not.toBeNull();

    /** A failed renewal is not presence. It must lapse nothing. */
    const res = await app.request('/v1/auth/renew', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ renewal: 'not-a-real-token' }),
    });
    expect(res.status).toBe(401);
    expect(await pendingSuccession(guild.id)).not.toBeNull();

    /** The master opens the game. That is the whole interaction. */
    const returned = await signIn('lapseMaster', { subject });
    expect(returned.accountId, 'the pinned subject must resolve to the same account').toBe(
      master.accountId,
    );

    expect(
      await pendingSuccession(guild.id),
      'signing in did not lapse the request — is auth/routes.ts still calling noteSignedIn?',
    ).toBeNull();
  });

  it('and noteSignedIn touches nobody else', async () => {
    const clock = movableClock(START);
    const { guildId, officer } = await scenario('other', SUCCESSION_INACTIVE_DAYS);

    expect((await requestSuccession(guildId, officer, clock)).ok).toBe(true);

    /** A different player signing in is not the master returning. */
    const bystander = await fx.account('bystander');
    expect(await noteSignedIn(bystander, clock)).toBe(0);
    expect(await pendingSuccession(guildId)).not.toBeNull();
  });
});
