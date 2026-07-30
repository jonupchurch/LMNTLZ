/**
 * Guild activity (013 T051, T052 · FR-026, FR-027 · SC-007, SC-008).
 *
 * ### TL;DR
 *
 * A guild counts as alive if anybody in it has played recently — and a brand-new
 * guild counts as alive for its first two weeks no matter what, so nobody's guild
 * dies before they have had a chance to fill it. **What time of day people play
 * makes no difference**, which sounds obvious and is exactly the kind of thing a
 * `date_trunc` quietly breaks.
 *
 * ### SC-008 is measured, not asserted once
 *
 * *"A guild's activity state does not change based on what hours its members
 * play."* One test with one timestamp cannot see that. This sweeps a member's last
 * activity across **all 24 hours** and asserts the answer never moves — the same
 * shape as the population checks in `matchmaking`, and for the same reason: a
 * property about a *range* needs the range.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../../src/db/client.js';
import { playerRatings } from '../../src/db/schema/ratings.js';
import { guilds } from '../../src/db/schema/guilds.js';
import { eq } from 'drizzle-orm';
import { ACTIVITY_WINDOW_DAYS, guildActivity } from '../../src/guilds/activity.js';
import { fixedClock, movableClock } from '../../src/guilds/clock.js';
import { NEW_GUILD_GRACE_DAYS } from '../../src/guilds/config.js';
import { Fixtures } from './helpers.js';

const NOW = '2026-08-01T12:00:00.000Z';
const fx = new Fixtures();

/**
 * Set a guild's founding date relative to the test's `NOW`.
 *
 * **Every test that reasons about the grace must call this**, including with `0`.
 * The fixture's `founded_at` defaults to Postgres's `now()` — the *real* clock —
 * while these tests run on a synthetic one, so a test that skipped this was
 * silently measuring the gap between the two. That is what failed the 14-day case:
 * the guild was already two days old before the injected clock started ticking.
 */
async function age(guildId: string, days: number): Promise<void> {
  await db()
    .update(guilds)
    .set({ foundedAt: new Date(Date.parse(NOW) - days * 86_400_000) })
    .where(eq(guilds.id, guildId));
}

async function playedAt(accountId: string, at: Date): Promise<void> {
  await db().insert(playerRatings).values({ accountId, lastActivityAt: at });
}

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('a newborn guild is active regardless of headcount (FR-026, SC-007)', () => {
  it('is active on day 0 with nobody having played at all', async () => {
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actNew');
    await age(guild.id, 0);

    const result = await guildActivity(guild.id, clock);

    expect(result.active).toBe(true);
    expect(result.reason).toBe('new');
    expect(result.lastSeen, 'nobody has played — that is allowed').toBeNull();
  });

  it('stays active for the whole 14 days, then stops relying on the grace', async () => {
    const clock = movableClock(NOW);
    const guild = await fx.guild('actGrace');
    await age(guild.id, 0);

    clock.advanceDays(NEW_GUILD_GRACE_DAYS - 1);
    expect((await guildActivity(guild.id, clock)).reason).toBe('new');

    clock.advanceDays(1);
    const after = await guildActivity(guild.id, clock);
    expect(after.reason, 'the grace is 14 days, not forever').not.toBe('new');
  });

  it('a guild with NO members is not active once the grace has passed', async () => {
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actEmpty');
    await age(guild.id, NEW_GUILD_GRACE_DAYS + 1);

    /** Remove the master, leaving the row with an empty roster. */
    const { dissolve } = await import('../../src/guilds/membership.js');
    await dissolve(guild.id, clock);

    const result = await guildActivity(guild.id, clock);
    expect(result.active).toBe(false);
    expect(result.reason).toBe('no-members');
  });
});

describe('activity follows members, on a rolling window (FR-027)', () => {
  it('one member inside the window keeps the guild active', async () => {
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actLive');
    await age(guild.id, NEW_GUILD_GRACE_DAYS + 5);

    await playedAt(guild.masterId, new Date(Date.parse(NOW) - 3 * 86_400_000));

    const result = await guildActivity(guild.id, clock);
    expect(result.active).toBe(true);
    expect(result.reason).toBe('members-active');
  });

  it('everybody outside the window makes it dormant', async () => {
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actDead');
    await age(guild.id, NEW_GUILD_GRACE_DAYS + 60);

    await playedAt(
      guild.masterId,
      new Date(Date.parse(NOW) - (ACTIVITY_WINDOW_DAYS + 1) * 86_400_000),
    );

    const result = await guildActivity(guild.id, clock);
    expect(result.active).toBe(false);
    expect(result.reason).toBe('dormant');
  });

  it('ONE active member is enough, however dormant the rest are', async () => {
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actMixed');
    await age(guild.id, NEW_GUILD_GRACE_DAYS + 60);

    await playedAt(
      guild.masterId,
      new Date(Date.parse(NOW) - (ACTIVITY_WINDOW_DAYS + 40) * 86_400_000),
    );

    const live = await fx.account('actMixedLive');
    await fx.join(guild.id, live);
    await playedAt(live, new Date(Date.parse(NOW) - 86_400_000));

    expect((await guildActivity(guild.id, clock)).active).toBe(true);
  });
});

describe('SC-008 — the answer does not depend on WHAT HOURS people play', () => {
  it('holds across all 24 hours of the day, swept', async () => {
    /**
     * The property is about a *range*, so the test uses the range. A single
     * timestamp would pass for a `date_trunc('day', …)` implementation that
     * silently reports a guild dead every midnight in one timezone and alive in
     * another — which is exactly the shape FR-027 forbids.
     */
    const clock = fixedClock(NOW);
    const guild = await fx.guild('actHours');
    await age(guild.id, NEW_GUILD_GRACE_DAYS + 5);

    const member = await fx.account('actHoursMember');
    await fx.join(guild.id, member);

    const answers = new Set<boolean>();

    for (let hour = 0; hour < 24; hour++) {
      const at = new Date(Date.parse(NOW) - 3 * 86_400_000);
      at.setUTCHours(hour, 0, 0, 0);

      await db()
        .insert(playerRatings)
        .values({ accountId: member, lastActivityAt: at })
        .onConflictDoUpdate({
          target: playerRatings.accountId,
          set: { lastActivityAt: at },
        });

      answers.add((await guildActivity(guild.id, clock)).active);
    }

    expect(
      answers.size,
      `the answer changed with the hour: ${JSON.stringify([...answers])}`,
    ).toBe(1);
    expect([...answers]).toEqual([true]);
  });
});
