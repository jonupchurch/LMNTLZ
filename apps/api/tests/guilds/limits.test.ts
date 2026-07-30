/**
 * The caps, the budget and the expiry (013 T011, T015, T016, T019, T020).
 *
 * ### TL;DR
 *
 * A guild holds 24 people and no more. A player may have five applications open at
 * once, and is told the number rather than discovering it by being refused. An
 * application dies after seven days. Being turned down costs a day before you can
 * ask that guild again; being ignored costs nothing.
 *
 * ### The budget is a *number the client can render*, not an error
 *
 * FR-008 says *"shown as a budget rather than discovered as an error"*, so
 * `openApplicationCount` is exported and the refusal carries `open` back with it. A
 * cap a player only learns about by hitting it reads as a bug — they cannot tell a
 * rule from a fault.
 *
 * ### The cooldown is on dismissal ONLY, and that distinction is the design
 *
 * A dismissed application means somebody looked and said no; 24 hours stops a
 * player re-applying into the same officer's queue every minute. An application
 * that merely **expired** was never answered, and charging for silence would
 * punish the applicant for the guild's inattention.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { guildApplications, guildMembers } from '../../src/db/schema/guilds.js';
import {
  acceptApplication,
  apply,
  dismissApplication,
  expireOverdue,
  openApplicationCount,
} from '../../src/guilds/applications.js';
import { fixedClock, movableClock } from '../../src/guilds/clock.js';
import {
  APPLICATION_EXPIRY_DAYS,
  GUILD_CAPACITY,
  MAX_CONCURRENT_APPLICATIONS,
  REAPPLY_COOLDOWN_HOURS,
} from '../../src/guilds/config.js';
import { Fixtures } from './helpers.js';

const clock = fixedClock('2026-08-01T00:00:00.000Z');
const fx = new Fixtures();

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('the 24-member cap (FR-005, SC-003)', () => {
  it('refuses the 25th, and the guild still holds exactly 24', async () => {
    const guild = await fx.guild('cap');

    /** The master is already one of the 24, so 23 more fill it. */
    for (let i = 1; i < GUILD_CAPACITY; i++) {
      await fx.join(guild.id, await fx.account(`cap${i}`));
    }

    const extra = await fx.account('cap25');
    const result = await apply(extra, guild.id, '', clock);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('guild-full');

    const rows = await db()
      .select({ id: guildMembers.id })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guild.id));

    expect(rows).toHaveLength(GUILD_CAPACITY);
  });

  it('refuses an ACCEPTANCE that would overfill, not only an application', async () => {
    /**
     * The application check alone is not enough: a player can apply while there is
     * room and be accepted after the guild fills. The officer's click is the write,
     * so the officer's click is where the cap has to hold.
     */
    const guild = await fx.guild('capAccept');
    const applicant = await fx.account('capApplicant');

    const application = await apply(applicant, guild.id, '', clock);
    expect(application.ok).toBe(true);

    for (let i = 1; i < GUILD_CAPACITY; i++) {
      await fx.join(guild.id, await fx.account(`capFill${i}`));
    }

    const accepted = await acceptApplication(
      application.ok ? application.applicationId : '',
      clock,
    );

    expect(accepted.ok).toBe(false);
    expect(!accepted.ok && accepted.reason).toBe('guild-full');
  });
});

describe('the 5-application budget (FR-008)', () => {
  it('allows exactly five, refuses the sixth, and REPORTS the number', async () => {
    const applicant = await fx.account('budget');

    for (let i = 0; i < MAX_CONCURRENT_APPLICATIONS; i++) {
      const guild = await fx.guild(`budget${i}`);
      const result = await apply(applicant, guild.id, '', clock);
      expect(result.ok, `application ${i + 1} of 5 was refused`).toBe(true);
    }

    expect(await openApplicationCount(applicant)).toBe(MAX_CONCURRENT_APPLICATIONS);

    const sixth = await fx.guild('budget6');
    const refused = await apply(applicant, sixth.id, '', clock);

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toBe('budget-exhausted');
    /** The number comes back so the client can say "5 of 5", not just "no". */
    expect(!refused.ok && refused.open).toBe(MAX_CONCURRENT_APPLICATIONS);
  });

  it('frees a slot when one closes — the budget is CONCURRENT, not a lifetime cap', async () => {
    const applicant = await fx.account('budgetFree');
    const guild = await fx.guild('budgetFreeG');

    const first = await apply(applicant, guild.id, '', clock);
    expect(first.ok).toBe(true);
    expect(await openApplicationCount(applicant)).toBe(1);

    await dismissApplication(first.ok ? first.applicationId : '', clock);
    expect(await openApplicationCount(applicant)).toBe(0);
  });
});

describe('the 7-day expiry (FR-009)', () => {
  it('expires on the sweep, and an expired application cannot be accepted', async () => {
    const moving = movableClock('2026-08-01T00:00:00.000Z');
    const applicant = await fx.account('expiry');
    const guild = await fx.guild('expiryG');

    const application = await apply(applicant, guild.id, '', moving);
    expect(application.ok).toBe(true);
    const id = application.ok ? application.applicationId : '';

    /** One day short: still open. The boundary is the interesting part. */
    moving.advanceDays(APPLICATION_EXPIRY_DAYS - 1);
    expect(await expireOverdue(moving)).toBe(0);

    moving.advanceDays(2);
    const swept = await expireOverdue(moving);
    expect(swept).toBeGreaterThanOrEqual(1);

    const [row] = await db()
      .select({ state: guildApplications.state })
      .from(guildApplications)
      .where(eq(guildApplications.id, id));

    expect(row?.state).toBe('expired');

    const accepted = await acceptApplication(id, moving);
    expect(accepted.ok).toBe(false);
    expect(!accepted.ok && accepted.reason).toBe('not-open');
  });

  it('an OVERDUE application is refused even if the sweep never ran', async () => {
    /**
     * ⛔ **The sweep has no registered schedule** (T059), so this is not a
     * hypothetical: until 016 owns a cron, the read path is the only thing that
     * expires anything. An acceptance that trusted the stored state alone would
     * honour a three-week-old application forever.
     */
    const moving = movableClock('2026-08-01T00:00:00.000Z');
    const applicant = await fx.account('overdue');
    const guild = await fx.guild('overdueG');

    const application = await apply(applicant, guild.id, '', moving);
    expect(application.ok).toBe(true);

    moving.advanceDays(APPLICATION_EXPIRY_DAYS + 1);

    const accepted = await acceptApplication(
      application.ok ? application.applicationId : '',
      moving,
    );

    expect(accepted.ok).toBe(false);
    expect(!accepted.ok && accepted.reason).toBe('expired');
  });

  it('running the sweep twice is running it once', async () => {
    const moving = movableClock('2026-08-01T00:00:00.000Z');
    const applicant = await fx.account('idem');
    const guild = await fx.guild('idemG');

    await apply(applicant, guild.id, '', moving);
    moving.advanceDays(APPLICATION_EXPIRY_DAYS + 1);

    await expireOverdue(moving);
    const second = await expireOverdue(moving);

    /**
     * Not `toBe(0)` — another suite's fixtures may age into the sweep between the
     * two calls, and this database is shared. The claim is that **ours** is not
     * swept twice, which is what the state check proves.
     */
    const [row] = await db()
      .select({ state: guildApplications.state })
      .from(guildApplications)
      .where(eq(guildApplications.accountId, applicant));

    expect(row?.state).toBe('expired');
    expect(second).toBeGreaterThanOrEqual(0);
  });
});

describe('the 24-hour re-apply cooldown (FR-014)', () => {
  it('a DISMISSED application costs a day, and says when', async () => {
    const moving = movableClock('2026-08-01T00:00:00.000Z');
    const applicant = await fx.account('cool');
    const guild = await fx.guild('coolG');

    const first = await apply(applicant, guild.id, '', moving);
    expect(first.ok).toBe(true);
    await dismissApplication(first.ok ? first.applicationId : '', moving);

    const tooSoon = await apply(applicant, guild.id, '', moving);
    expect(tooSoon.ok).toBe(false);
    expect(!tooSoon.ok && tooSoon.reason).toBe('cooldown');
    /** *When* matters: "try again later" is not an answer a player can act on. */
    expect(!tooSoon.ok && tooSoon.retryAt).toBeInstanceOf(Date);

    moving.advanceDays(REAPPLY_COOLDOWN_HOURS / 24);
    const later = await apply(applicant, guild.id, '', moving);
    expect(later.ok, 'the cooldown never lifted').toBe(true);
  });

  it('an EXPIRED application costs nothing — silence is not a refusal', async () => {
    const moving = movableClock('2026-08-01T00:00:00.000Z');
    const applicant = await fx.account('noCool');
    const guild = await fx.guild('noCoolG');

    await apply(applicant, guild.id, '', moving);
    moving.advanceDays(APPLICATION_EXPIRY_DAYS + 1);
    await expireOverdue(moving);

    const again = await apply(applicant, guild.id, '', moving);
    expect(
      again.ok,
      'an application nobody answered must not penalise the applicant',
    ).toBe(true);
  });

  it('a dismissal is visible AS a dismissal, not a vanishing', async () => {
    const applicant = await fx.account('visible');
    const guild = await fx.guild('visibleG');

    const application = await apply(applicant, guild.id, '', clock);
    await dismissApplication(application.ok ? application.applicationId : '', clock);

    const [row] = await db()
      .select({ state: guildApplications.state, closedAt: guildApplications.closedAt })
      .from(guildApplications)
      .where(eq(guildApplications.accountId, applicant));

    /** Deleting the row would make it *vanish*, which reads as a bug to the player. */
    expect(row?.state).toBe('dismissed');
    expect(row?.closedAt).not.toBeNull();
  });
});
