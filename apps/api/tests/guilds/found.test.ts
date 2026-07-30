/**
 * Founding, and **the starter warning on the door most likely to be missed**
 * (013 T021–T025, T060 · FR-001, FR-002, FR-015, SC-002, SC-004).
 *
 * ### TL;DR
 *
 * Making a guild costs 650 shards, you become its master, and the name can never be
 * changed. If you are still a beginner you have to acknowledge — in so many words —
 * that you are giving up both the easy opponents *and* the bonus income, because
 * they are two different losses and being told about one is not being told.
 *
 * ### Founding is tested FIRST among the doors, on purpose
 *
 * `09-matchmaking.md` says the warning has been lost three times. Founding is the
 * likeliest of the three to be missed because it **feels like a creation flow
 * rather than a joining one** — nobody building a "create guild" form thinks they
 * are building a starter-league exit.
 *
 * ### The timing case is the one nobody writes
 *
 * A player applies on Monday and an officer accepts on Tuesday. The warning has to
 * have been shown on **Monday**, at the application — because on Tuesday the player
 * is not present, and would otherwise be graduated by somebody else's click.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { guilds, guildMembers } from '../../src/db/schema/guilds.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { balance } from '../../src/progression/ledger.js';
import { GUILD_DOORS, guildDoorConfirm } from '../../src/matchmaking/starterLeague.js';
import { emblemValid, foundGuild } from '../../src/guilds/found.js';
import { acceptApplication, apply } from '../../src/guilds/applications.js';
import { fixedClock } from '../../src/guilds/clock.js';
import { FOUNDING_COST_SHARDS } from '../../src/guilds/config.js';
import { Fixtures } from './helpers.js';

const clock = fixedClock('2026-08-01T00:00:00.000Z');
const fx = new Fixtures();

const BOTH = ['bot-opponents-end', 'income-multiplier-ends'];

/** A founder with shards. Graduated unless the test wants a starter. */
async function funded(tag: string, over: { starter?: boolean } = {}): Promise<string> {
  const id = await fx.account(tag);
  await db()
    .insert(shardLedger)
    .values({ accountId: id, delta: FOUNDING_COST_SHARDS * 2, reason: 'grant' });

  if (!over.starter) {
    await db()
      .update(accounts)
      .set({ starterExitedAt: new Date('2026-07-01T00:00:00.000Z'), starterExitReason: 'voluntary' })
      .where(eq(accounts.id, id));
  }

  return id;
}

/**
 * **The starter league has to be OPEN for any of these assertions to mean
 * anything.** See `helpers.ts` — with no authored bot in the database,
 * `starterStatus()` reports `no-authored-pool`, the warning is `null` for every
 * account, and every "was it warned?" test passes vacuously.
 */
beforeAll(async () => {
  await fx.starterBot();
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('founding costs 650 and makes you master (FR-001)', () => {
  it('charges exactly 650 and seats the founder as master', async () => {
    const founder = await funded('found');
    const before = await balance(founder);

    const result = await foundGuild(founder, { name: `Reach ${Date.now() % 1e6}` }, clock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    fx.guildIds.push(result.guildId);

    expect(await balance(founder)).toBe(before - FOUNDING_COST_SHARDS);

    const [membership] = await db()
      .select({ role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.accountId, founder));

    expect(membership?.role).toBe('master');
  });

  it('refuses a founder who cannot afford it, and says by how much', async () => {
    const broke = await fx.account('broke');
    await db().update(accounts).set({ starterExitedAt: new Date('2026-07-01T00:00:00.000Z') })
      .where(eq(accounts.id, broke));

    const result = await foundGuild(broke, { name: `Poor ${Date.now() % 1e6}` }, clock);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('insufficient-shards');
    expect(!result.ok && result.required).toBe(FOUNDING_COST_SHARDS);
    expect(!result.ok && result.available).toBe(0);
  });

  it('charges NOTHING when founding fails — no half-purchase', async () => {
    /**
     * The transaction's whole purpose. A partial failure leaves a paid-for guild
     * that does not exist, or a guild nobody paid for — and only one of those is
     * visible to us.
     */
    const founder = await funded('halfway');
    const before = await balance(founder);

    const result = await foundGuild(founder, { name: 'x' }, clock); // too short
    expect(result.ok).toBe(false);
    expect(await balance(founder)).toBe(before);
  });

  it('the name is case- and confusable-folded, so lookalikes collide', async () => {
    const first = await funded('nameA');
    const second = await funded('nameB');
    const name = `Long Reach ${Date.now() % 1e6}`;

    const one = await foundGuild(first, { name }, clock);
    expect(one.ok).toBe(true);
    if (one.ok) fx.guildIds.push(one.guildId);

    const two = await foundGuild(second, { name: name.toUpperCase() }, clock);
    expect(two.ok, 'an upper-case twin is not a different guild').toBe(false);
    expect(!two.ok && two.reason).toBe('name-taken');
  });

  it('a player already in a guild cannot found another', async () => {
    const founder = await funded('twice');
    const first = await foundGuild(founder, { name: `First ${Date.now() % 1e6}` }, clock);
    expect(first.ok).toBe(true);
    if (first.ok) fx.guildIds.push(first.guildId);

    const second = await foundGuild(founder, { name: `Second ${Date.now() % 1e6}` }, clock);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.reason).toBe('already-in-a-guild');
  });
});

describe('the starter warning, on FOUNDING first (FR-015, SC-002)', () => {
  it('a starter founder with BOTH acknowledgements succeeds and graduates', async () => {
    const founder = await funded('starterOk', { starter: true });

    const result = await foundGuild(
      founder,
      { name: `Starter ${Date.now() % 1e6}`, acknowledged: BOTH },
      clock,
    );

    expect(result.ok).toBe(true);
    if (result.ok) fx.guildIds.push(result.guildId);

    const [row] = await db()
      .select({ exitedAt: accounts.starterExitedAt, reason: accounts.starterExitReason })
      .from(accounts)
      .where(eq(accounts.id, founder));

    expect(row?.exitedAt, 'founding is a starter-league exit').not.toBeNull();
    expect(row?.reason).toBe('guild');
  });

  it('ONE acknowledgement is refused — they are two different losses', async () => {
    for (const partial of [['bot-opponents-end'], ['income-multiplier-ends'], []]) {
      const founder = await funded(`partial${partial.length}${partial[0] ?? 'none'}`, {
        starter: true,
      });

      const result = await foundGuild(
        founder,
        { name: `Partial ${Math.random().toString(36).slice(2, 8)}`, acknowledged: partial },
        clock,
      );

      expect(result.ok, `acknowledging ${JSON.stringify(partial)} must not be enough`).toBe(false);
      expect(!result.ok && result.reason).toBe('starter-warning-not-acknowledged');
    }
  });

  it('a player NOT in the starter league needs no acknowledgement at all', async () => {
    const founder = await funded('graduated');

    const result = await foundGuild(founder, { name: `Grad ${Date.now() % 1e6}` }, clock);

    expect(result.ok, 'a graduated player must not be asked to acknowledge a loss they already took')
      .toBe(true);
    if (result.ok) fx.guildIds.push(result.guildId);
  });

  it('all THREE doors are named, and founding is one of them', () => {
    expect([...GUILD_DOORS].sort()).toEqual(['application', 'founding', 'invitation']);
  });

  it('the warning is shown at the APPLICATION, not at the acceptance', async () => {
    /**
     * The timing case. A day passes between the two, and on the second day the
     * player is not present — so a warning shown at acceptance is a warning shown
     * to an officer about somebody else's income.
     */
    const applicant = await fx.account('timing');
    const guild = await fx.guild('timingG');

    const atApplication = await guildDoorConfirm(applicant, 'application', guild.id);
    expect(
      atApplication.starterWarning,
      'a starter player applying must be warned right there',
    ).not.toBeNull();

    const application = await apply(applicant, guild.id, '', clock);
    expect(application.ok).toBe(true);

    /** A day later, an officer clicks. The player is nowhere near their screen. */
    const accepted = await acceptApplication(
      application.ok ? application.applicationId : '',
      clock,
    );
    expect(accepted.ok).toBe(true);

    const [row] = await db()
      .select({ reason: accounts.starterExitReason })
      .from(accounts)
      .where(eq(accounts.id, applicant));

    expect(row?.reason, 'the acceptance graduated them, which is why the warning had to be earlier')
      .toBe('guild');
  });
});

describe('the emblem warns and never blocks (FR-003, FR-004, SC-004)', () => {
  it('accepts every index inside the curated palette', () => {
    expect(emblemValid({ icon: 0, ink: 0, ground: 0 })).toBe(true);
    expect(emblemValid({ icon: 35, ink: 11, ground: 11 })).toBe(true);
  });

  it('rejects an index OUTSIDE the palette — validity, not taste', () => {
    expect(emblemValid({ icon: 36, ink: 0, ground: 0 })).toBe(false);
    expect(emblemValid({ icon: 0, ink: 12, ground: 0 })).toBe(false);
    expect(emblemValid({ icon: -1, ink: 0, ground: 0 })).toBe(false);
    expect(emblemValid({ icon: 1.5, ink: 0, ground: 0 })).toBe(false);
  });

  it('SAVES the worst possible contrast — ink 0 on ground 0 (SC-004)', async () => {
    /**
     * Constitution XVIII: **harm is a gate, taste is a note.** The same ink and
     * ground with the blank icon is a solid block of colour and is a *permitted
     * choice*. A server that refused it would be enforcing taste.
     */
    const founder = await funded('contrast');

    const result = await foundGuild(
      founder,
      { name: `Solid ${Date.now() % 1e6}`, emblem: { icon: 0, ink: 0, ground: 0 } },
      clock,
    );

    expect(result.ok, 'a low-contrast emblem must never be blocked').toBe(true);
    if (!result.ok) return;
    fx.guildIds.push(result.guildId);

    const [row] = await db()
      .select({ icon: guilds.emblemIcon, ink: guilds.emblemInk, ground: guilds.emblemGround })
      .from(guilds)
      .where(eq(guilds.id, result.guildId));

    expect(row).toEqual({ icon: 0, ink: 0, ground: 0 });
  });

  it('stores three integers — never a blob key, a URL or a pending state', async () => {
    const founder = await funded('noUpload');
    const result = await foundGuild(
      founder,
      { name: `Composed ${Date.now() % 1e6}`, emblem: { icon: 17, ink: 5, ground: 9 } },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    fx.guildIds.push(result.guildId);

    const [row] = await db().select().from(guilds).where(eq(guilds.id, result.guildId));

    /**
     * The shape *is* the argument for having no review queue: there is nothing a
     * player can put in it. An avatar is an upload and is still pre-moderated.
     */
    for (const key of Object.keys(row ?? {})) {
      expect(key, `guilds.${key} looks like an upload`).not.toMatch(/blob|url|pending|review/i);
    }
  });
});
