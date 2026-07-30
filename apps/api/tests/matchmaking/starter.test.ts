/**
 * The starter league, end to end (009 T024, T025, T027 · SC-005, SC-006).
 *
 * A new account's first week: **authored bot opponents only, a dormant defense, ×1.5
 * on attack income, and four exits**. All of it against the real database, because
 * every one of those is a query rather than a calculation.
 *
 * ### This file owns the only starter bot in the suite, and that is a constraint
 *
 * `starterLeagueOpen()` asks a **global** question — *does any starter bot exist* — so
 * a second file creating one would silently break the first block below, which asserts
 * the league is closed before any bot is authored. That block is the most important
 * one here: it is what keeps a live deploy safe between Phase 5 and Phase 7.
 *
 * So the bot is created inside the second block's own `beforeAll`, after the closed
 * case has been observed, and **`starterWarning.test.ts` deliberately touches no
 * database at all** — its subject is the shape of the warning, which is a type-level
 * question. T027's timing case lives here rather than there for the same reason: it
 * needs this fixture, and the fixture cannot be shared across parallel files.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getAllHeroes } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { squads, squadSeats } from '../../src/db/schema/squads.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';
import { candidates } from '../../src/matchmaking/candidates.js';
import { botRating } from '../../src/matchmaking/bots.js';
import { STARTER_BOTS } from '../../src/matchmaking/starterBots.js';
import {
  removeStarterBots,
  seedStarterBots,
  type SeedReport,
} from '../../src/matchmaking/seedBots.js';
import { validateUsername } from '../../src/auth/username.js';
import { playerRatings, STARTING_RATING } from '../../src/db/schema/ratings.js';
import { standing } from '../../src/matchmaking/standing.js';
import {
  GUILD_DOORS,
  REQUIRED_ACKNOWLEDGEMENTS,
  exitStarter,
  guildDoorConfirm,
  guildJoined,
  noteShardsEarned,
  starterExitWarning,
  starterIncomeMultiplier,
  starterLeagueOpen,
  starterStatus,
} from '../../src/matchmaking/starterLeague.js';
import {
  STARTER_DAYS,
  STARTER_INCOME_MULTIPLIER,
  STARTER_SHARD_TARGET,
} from '../../src/matchmaking/config.js';

const RUN = `${process.pid}-${Math.floor(Math.random() * 1e9)}`;
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];
const DAY_MS = 86_400_000;

let seq = 0;

/**
 * An account with a complete Visible defense — the minimum to be a candidate.
 *
 * `ageDays` backdates `created_at`, which is the only way to observe the **time** exit:
 * it is derived from that column rather than written, so there is no flag to set.
 */
async function player(
  label: string,
  options: { ageDays?: number; isBot?: boolean; band?: 'starter' | 'bronze' } = {},
): Promise<string> {
  const key = `${label}-${RUN}-${seq++}`;
  const createdAt = new Date(Date.now() - (options.ageDays ?? 0) * DAY_MS);

  const [account] = await db()
    .insert(accounts)
    .values({
      username: `${label}${seq}`,
      usernameKey: key,
      createdAt,
      isBot: options.isBot ?? false,
      botBand: options.isBot ? (options.band ?? 'starter') : null,
    })
    .returning();

  const id = account!.id;
  created.push(id);

  const [squad] = await db()
    .insert(squads)
    .values({ accountId: id, kind: 'defense', zone: 'visible' })
    .returning();

  await db()
    .insert(squadSeats)
    .values(
      (
        [
          { row: 'front', index: 0 },
          { row: 'front', index: 1 },
          { row: 'middle', index: 0 },
          { row: 'middle', index: 1 },
          { row: 'middle', index: 2 },
          { row: 'back', index: 0 },
        ] as const
      ).map((p, i) => ({ squadId: squad!.id, row: p.row, index: p.index, heroId: ROSTER[i]! })),
    );

  return id;
}

/** Eight days old: past the seven-day week, so graduated by time. */
const veteranAge = STARTER_DAYS + 1;

let fresh: string;
let veteran: string;
/**
 * A second graduated account, so the veteran's ordinary pool is never empty.
 *
 * **This file owns it because relying on another file's fixtures is the defect, not the
 * workaround.** Several assertions below are of the form *"the starter player is absent,
 * and the pool is non-empty so that absence means something"* — and in a full-suite run
 * the pool was empty, because `candidates.test.ts`'s defenders had already been cleaned
 * up by the time this ran. The absence assertion still passed; the non-vacuity guard is
 * what caught it, which is the argument for writing those guards at all.
 */
let peer: string;

beforeAll(async () => {
  fresh = await player('sFresh');
  veteran = await player('sVet', { ageDays: veteranAge });
  peer = await player('sPeer', { ageDays: veteranAge });
}, 120_000);

afterAll(async () => {
  if (created.length) await db().delete(accounts).where(inArray(accounts.id, created));
  await closeDb();
});

describe('before any bot is authored, the league is closed', () => {
  /**
   * **The block that makes a mid-feature deploy safe.** The starter league offers bots
   * and nothing else, and bots arrive in Phase 7 — so between the two, an open starter
   * league would hand every new account an empty opponent list and no way to attack
   * anybody. That is not a degraded first week, it is a broken signup.
   *
   * The rejected alternative was to quietly fall back to the ordinary league pool when
   * the bot query came back empty. That would have passed every test in this file while
   * feeding new players full-kit veterans, which is the precise failure mode this
   * project keeps rediscovering. A feature with no pool says so instead.
   */
  it('reports no authored pool rather than an empty one', async () => {
    expect(await starterLeagueOpen()).toBe(false);

    const status = await starterStatus(fresh);
    expect(status.active).toBe(false);
    expect(status.active === false && status.reason).toBe('no-authored-pool');
  });

  it('leaves a brand-new account attackable, because nothing is protecting it yet', async () => {
    /**
     * The dormant-defense rule is gated on the same question. Without that gate this
     * would remove every account under a week old from every pool **while none of them
     * were actually protected** — a pool that thins for no reason, with nothing to
     * show it had.
     */
    const ids = (await candidates(veteran)).candidates.map((c) => c.playerId);
    expect(ids, 'a new account should still be in the pool while the league is closed').toContain(
      fresh,
    );
  });

  it('pays no multiplier and offers no warning while the league is closed', async () => {
    expect(await starterIncomeMultiplier(fresh)).toBe(1);
    expect(await starterExitWarning(fresh)).toBeNull();
  });
});

describe('once a starter bot is authored, the league opens itself', () => {
  let bot: string;

  beforeAll(async () => {
    bot = await player('sBot', { isBot: true, band: 'starter' });
  }, 120_000);

  it('needed nothing flipped — seeding the pool was the switch', async () => {
    /**
     * The property that makes the gate safe rather than merely correct: **Phase 7 turns
     * this on by doing its own job.** There is no feature flag to remember, and no
     * deploy step between authoring the bots and the league working.
     */
    expect(await starterLeagueOpen()).toBe(true);

    const status = await starterStatus(fresh);
    expect(status.active).toBe(true);
  });

  it('ends exactly seven days after the account was created', async () => {
    const [row] = await db()
      .select({ createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.id, fresh))
      .limit(1);

    const status = await starterStatus(fresh);
    expect(status.active).toBe(true);
    if (!status.active) throw new Error('unreachable');

    expect(status.endsAt.getTime()).toBe(row!.createdAt.getTime() + STARTER_DAYS * DAY_MS);
  });

  it('offers bots and only bots, and the list is not empty (SC-005)', async () => {
    const list = await candidates(fresh);

    // Not empty first: "every candidate is a bot" is true of nothing at all.
    expect(list.candidates.length, 'an empty pool satisfies every claim below').toBeGreaterThan(0);
    expect(list.candidates.map((c) => c.playerId)).toContain(bot);

    for (const candidate of list.candidates) {
      expect(candidate.isBot, `${candidate.username} is not a bot`).toBe(true);
    }

    // And specifically not the human accounts this file created.
    expect(list.candidates.map((c) => c.playerId)).not.toContain(veteran);
  });

  it('offers the bot even though no bot has ever been active', async () => {
    /**
     * **A bot has no activity row and never will** — nothing signs into one. Without
     * the `is_bot` arm in the eligibility clause it would fall through to `created_at`
     * and every authored bot would drop out of every pool thirty days after seeding,
     * with no error anywhere. Checked here by backdating a bot past the window.
     */
    const oldBot = await player('sOldBot', { isBot: true, band: 'starter', ageDays: 400 });
    const ids = (await candidates(fresh)).candidates.map((c) => c.playerId);

    expect(ids, 'a 400-day-old bot fell out of the pool').toContain(oldBot);
  });

  it('is never attacked — the defense is dormant (FR-020, SC-005)', async () => {
    const ids = (await candidates(veteran)).candidates.map((c) => c.playerId);

    expect(ids, 'a starter player was offered as a target').not.toContain(fresh);
    // The veteran's own pool still works, or the assertion above is vacuous — and it is
    // checked against this file's own peer rather than whatever else is in the database.
    expect(ids, 'the pool was empty, so the absence above means nothing').toContain(peer);
  });

  it('is not offered to a graduated player — the nursery is not farmable', async () => {
    /**
     * **Found by a surviving mutant, not by reading the code.** Removing the
     * `bot_band <> 'starter'` clause from the ordinary pool changed nothing in a 137-test
     * run: I had added the clause as a real requirement and asserted none of it.
     *
     * It matters as much as any exit. A starter bot's gear score sits at or below the
     * Bronze floor, so without the clause it lands in every Bronze player's ordinary
     * pool — and `09-matchmaking.md` rejects exactly that: *"a player who returns after
     * leaving would be farming a pool built for beginners."* **Opting out can only be
     * permanent if the door is also shut from the other side**, and that is what this
     * checks.
     */
    const ids = (await candidates(veteran)).candidates.map((c) => c.playerId);

    expect(ids, 'a graduated player was offered the beginner ramp').not.toContain(bot);
    for (const candidate of (await candidates(veteran)).candidates) {
      expect(candidate.isBot && candidate.playerId === bot).toBe(false);
    }

    // Non-vacuous: the same bot IS offered to somebody still in the starter league.
    expect((await candidates(fresh)).candidates.map((c) => c.playerId)).toContain(bot);
  });

  it('is not itself in the starter league, because it is the pool', async () => {
    // A bot counted as a starter player would be excluded from its own pool by the
    // dormant-defense rule, which is a pool that empties itself.
    const status = await starterStatus(bot);
    expect(status.active).toBe(false);
  });

  it('pays the multiplier to a starter and nobody else (FR-021)', async () => {
    expect(await starterIncomeMultiplier(fresh)).toBe(STARTER_INCOME_MULTIPLIER);
    expect(await starterIncomeMultiplier(fresh)).toBe(1.5);
    expect(await starterIncomeMultiplier(veteran)).toBe(1);
  });

  it('reports the status on /v1/me/standing rather than a hardcoded false', async () => {
    const mine = await standing(fresh);
    expect(mine.starter.active).toBe(true);

    const theirs = await standing(veteran);
    expect(theirs.starter.active).toBe(false);
    expect(theirs.starter.active === false && theirs.starter.reason).toBe('time');
  });

  describe('the four exits (SC-006)', () => {
    it('1 — time, derived from created_at with nothing written', async () => {
      /**
       * **No row records this exit**, and that is the design: a written time exit needs
       * a job to write it, and a job that fails leaves a player farming an authored pool
       * past their week. The same argument `accounts.banned_until` already makes.
       */
      const status = await starterStatus(veteran);
      expect(status.active === false && status.reason).toBe('time');

      const [row] = await db()
        .select({ exitedAt: accounts.starterExitedAt, reason: accounts.starterExitReason })
        .from(accounts)
        .where(eq(accounts.id, veteran))
        .limit(1);

      expect(row!.exitedAt, 'the time exit wrote a row').toBeNull();
      expect(row!.reason).toBeNull();
    });

    it('2 — shards, and only at the target', async () => {
      const climber = await player('sShard');

      const below = await noteShardsEarned(climber, STARTER_SHARD_TARGET - 1);
      expect(below.active, `${STARTER_SHARD_TARGET - 1} shards should not graduate`).toBe(true);

      const at = await noteShardsEarned(climber, STARTER_SHARD_TARGET);
      expect(at.active).toBe(false);
      expect(at.active === false && at.reason).toBe('shards');
    });

    it('2 — measured on lifetime earnings, so spending cannot send anybody back', async () => {
      // The same reasoning that keeps a shard balance out of the gear score: a signal
      // that could fall is a signal a player could game by spending.
      const spender = await player('sSpend');
      await noteShardsEarned(spender, STARTER_SHARD_TARGET);

      const afterSpending = await noteShardsEarned(spender, 0);
      expect(afterSpending.active).toBe(false);
      expect(afterSpending.active === false && afterSpending.reason).toBe('shards');
    });

    it('3 — voluntary, and permanent', async () => {
      const quitter = await player('sQuit');

      const after = await exitStarter(quitter, 'voluntary');
      expect(after.active).toBe(false);
      expect(after.active === false && after.reason).toBe('voluntary');

      // No operation anywhere clears the column, so there is nothing to test for a
      // "rejoin" — what is testable is that a later door cannot relabel the first.
      const relabelled = await exitStarter(quitter, 'guild');
      expect(relabelled.active === false && relabelled.reason).toBe('voluntary');
    });

    it('4 — guild, one rule for both doors, and leaving does not send them back', async () => {
      const joiner = await player('sGuild');

      const after = await guildJoined(joiner);
      expect(after.active === false && after.reason).toBe('guild');

      /**
       * *"Leaving the guild later does not send them back"* needs no code — there is no
       * write in the module that clears `starter_exited_at`. Asserted as an absence in
       * the only place it can be: the timestamp is still there afterwards.
       */
      const [row] = await db()
        .select({ exitedAt: accounts.starterExitedAt })
        .from(accounts)
        .where(eq(accounts.id, joiner))
        .limit(1);

      expect(row!.exitedAt).not.toBeNull();
    });

    it('an exited player rejoins the ordinary pool immediately', async () => {
      const graduate = await player('sGrad');
      expect((await candidates(graduate)).candidates.map((c) => c.playerId)).not.toContain(veteran);

      await exitStarter(graduate, 'voluntary');

      const ids = (await candidates(graduate)).candidates.map((c) => c.playerId);
      expect(ids, 'graduating did not open the real pool').toContain(veteran);
      // And they can now be attacked, which is the other half of graduating.
      expect((await candidates(veteran)).candidates.map((c) => c.playerId)).toContain(graduate);
    });
  });

  describe('T027 — the warning appears at application time, not at acceptance', () => {
    it('produces a warning at every door, including the one that only applies', async () => {
      /**
       * **The failure this exists to prevent**: a player applies to a guild, is admitted
       * a day later, and is graduated by somebody else's click at a moment they were not
       * present for. The application is where the decision is actually made, so it
       * carries the warning — and so does founding, because `09-matchmaking.md` asks for
       * the cost at *"every point a player could cross the line, in either direction."*
       *
       * Iterated over the door list rather than spot-checked, so a door added later
       * without a warning fails here instead of shipping.
       */
      for (const door of GUILD_DOORS) {
        const confirm = await guildDoorConfirm(fresh, door, door === 'founding' ? null : 'g-1');

        expect(confirm.door).toBe(door);
        expect(confirm.starterWarning, `the ${door} door renders unwarned`).not.toBeNull();
        expect(confirm.starterWarning).toEqual({
          endsBotOpponents: true,
          endsIncomeMultiplier: true,
          permanent: true,
        });
      }

      expect(GUILD_DOORS).toContain('application');
    });

    it('warns on the application even though the exit fires on the acceptance', async () => {
      /**
       * The timing case as a sequence: the applicant is still a starter when they apply,
       * and the exit lands a day later when somebody else accepts. The warning has to
       * exist at the first moment, not the second.
       */
      const applicant = await player('sApply');

      const atApplication = await guildDoorConfirm(applicant, 'application', 'g-2');
      expect(atApplication.starterWarning, 'unwarned at the moment of deciding').not.toBeNull();

      // A day passes and an officer accepts. The player is not present.
      await guildJoined(applicant);

      const afterAdmission = await starterStatus(applicant);
      expect(afterAdmission.active === false && afterAdmission.reason).toBe('guild');

      // And now there is nothing left to warn about, which is why a warning fetched
      // only at acceptance would have been null and shown nobody anything.
      expect(await starterExitWarning(applicant)).toBeNull();
    });
  });

  describe('POST /v1/me/starter/exit (T025)', () => {
    let session: string;
    let routeAccount: string;
    let restore: (() => void) | undefined;

    const tokenIsSubject: IdentityProvider = {
      name: 'google',
      verify: (token: string) =>
        token.startsWith('sub:')
          ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
          : Promise.reject(new InvalidProviderTokenError('signature')),
    };

    beforeAll(async () => {
      restore = overrideProvider('google', tokenIsSubject);
      const res = await app.request('/v1/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: `sub:starter-${RUN}` }),
      });
      const body = (await res.json()) as { session: { token: string }; account: { id: string } };
      session = body.session.token;
      routeAccount = body.account.id;
      created.push(routeAccount);
    }, 120_000);

    afterAll(() => restore?.());

    const post = (body: unknown) =>
      app.request('/v1/me/starter/exit', {
        method: 'POST',
        headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('requires a session', async () => {
      const res = await app.request('/v1/me/starter/exit', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('409s on one acknowledgement, and names the one that is missing', async () => {
      /**
       * **The whole point of T025.** Both losses are separate things — beginner
       * *status* and the beginner *bonus* — and a screen that dropped one of the two
       * would send exactly this body. The response names what is absent rather than
       * saying "invalid", because the client bug is a missing sentence, not a bad shape.
       */
      const res = await post({ confirmed: true, acknowledged: ['bot-opponents-end'] });
      expect(res.status).toBe(409);

      const body = (await res.json()) as { missing: string[]; required: string[] };
      expect(body.missing).toEqual(['income-multiplier-ends']);
      expect(body.required).toEqual([...REQUIRED_ACKNOWLEDGEMENTS]);
    });

    it('409s on the other one alone, so neither is the privileged half', async () => {
      const res = await post({ confirmed: true, acknowledged: ['income-multiplier-ends'] });
      expect(res.status).toBe(409);

      const body = (await res.json()) as { missing: string[] };
      expect(body.missing).toEqual(['bot-opponents-end']);
    });

    it('409s when both are acknowledged but nothing was confirmed', async () => {
      // Acknowledging is "I have read what this costs"; confirming is "do it". Reading
      // the warning must not be the act of accepting it.
      const res = await post({ acknowledged: [...REQUIRED_ACKNOWLEDGEMENTS] });
      expect(res.status).toBe(409);
    });

    it('409s on a duplicated acknowledgement, because it is checked by name', async () => {
      // A count would be satisfied by this. The contract asks for both names.
      const res = await post({
        confirmed: true,
        acknowledged: ['bot-opponents-end', 'bot-opponents-end'],
      });
      expect(res.status).toBe(409);
    });

    it('409s on a missing body rather than throwing', async () => {
      const res = await app.request('/v1/me/starter/exit', {
        method: 'POST',
        headers: { authorization: `Bearer ${session}` },
      });
      expect(res.status).toBe(409);
    });

    it('exits on both plus a confirmation, and is idempotent', async () => {
      const res = await post({ confirmed: true, acknowledged: [...REQUIRED_ACKNOWLEDGEMENTS] });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { starter: { active: boolean; reason?: string } };
      expect(body.starter.active).toBe(false);
      expect(body.starter.reason).toBe('voluntary');

      // A double-click answers the same thing rather than a 409 — the player asked for
      // a state they are already in.
      const again = await post({ confirmed: true, acknowledged: [...REQUIRED_ACKNOWLEDGEMENTS] });
      expect(again.status).toBe(200);

      const repeat = (await again.json()) as { starter: { reason?: string } };
      expect(repeat.starter.reason).toBe('voluntary');
    });
  });
});

/**
 * The **real** twenty, seeded through the players' own write path (T041 · T045–T048).
 *
 * ### Why this lives here and not in its own file
 *
 * It has to. The first block in this file asserts `starterLeagueOpen()` is **false**,
 * which is a claim about the *whole database* — no starter bot anywhere. A separate file
 * calling `seedStarterBots()` would run in parallel with it and make that assertion
 * flake, and the header of this file predicted exactly that: *"a second file creating one
 * would silently break the first block below."*
 *
 * The blocks above use one synthetic bot, which was the right fixture when no authored
 * content existed. This one uses the shipped ramp, so what is checked is the content the
 * game will actually serve rather than a stand-in for it.
 *
 * **It cleans up after itself with `removeStarterBots()`**, which also collects the
 * synthetic bots the earlier blocks made — they are `is_bot` in the starter band too.
 * `tests/globalSetup.ts` fails the run on a leaked account, and tests share the database
 * with production, so twenty stray bots would be twenty stray bots in the live game.
 */
describe('the authored ramp, seeded', () => {
  let report: SeedReport;

  beforeAll(async () => {
    report = await seedStarterBots();
  }, 180_000);

  afterAll(async () => {
    await removeStarterBots();
  }, 120_000);

  it('creates all twenty, and skips them all on a second run', async () => {
    expect(report.created).toHaveLength(STARTER_BOTS.length);
    expect(report.skipped).toEqual([]);

    /**
     * **Idempotence is a correctness requirement, not a convenience.** `battle_records`
     * stores squad composition and Constitution XVI makes those records permanent — so a
     * re-seed that recreated a bot with a different squad would leave older records
     * describing a squad that no longer exists, uncorrectably. Skipping is the only safe
     * re-seed, which is why it is asserted rather than assumed.
     */
    const again = await seedStarterBots();
    expect(again.created, 'a second seed created duplicates').toEqual([]);
    expect(again.skipped).toHaveLength(STARTER_BOTS.length);
  });

  it('gives every bot a player-legal username', async () => {
    /**
     * Bots share `accounts.username_key`'s unique index with every player, and that index
     * is only impersonation protection if both sides draw from the same alphabet. It also
     * catches the thing that was actually wrong: the squad names contain spaces, which
     * `validateUsername` rejects outright, so *"The Nine Stones"* could never have been
     * an account name at all.
     */
    for (const bot of STARTER_BOTS) {
      expect(validateUsername(bot.username), `${bot.username} is not a legal username`).toBeNull();
    }
  });

  it('seats twelve champions per bot across two zones, through the players’ own writer', async () => {
    const ids = await db()
      .select({ id: accounts.id, username: accounts.username })
      .from(accounts)
      .where(and(eq(accounts.isBot, true), eq(accounts.botBand, 'starter')));

    const seeded = ids.filter((r) => STARTER_BOTS.some((b) => b.username === r.username));
    expect(seeded).toHaveLength(STARTER_BOTS.length);

    for (const row of seeded) {
      const zones = await db()
        .select({ id: squads.id, zone: squads.zone, name: squads.name })
        .from(squads)
        .where(and(eq(squads.accountId, row.id), eq(squads.kind, 'defense')));

      expect(zones.map((z) => z.zone).sort(), `${row.username} has the wrong zones`).toEqual([
        'hidden',
        'visible',
      ]);

      // The flavour name rides on the squad, which is the field that was always for it.
      for (const zone of zones) {
        expect(zone.name, `${row.username}'s ${zone.zone} squad is unnamed`).toBeTruthy();

        const seats = await db()
          .select({ heroId: squadSeats.heroId })
          .from(squadSeats)
          .where(eq(squadSeats.squadId, zone.id));

        expect(seats, `${row.username}'s ${zone.zone} squad is not six`).toHaveLength(6);
      }
    }
  });

  it('gives every bot the ramp’s own gear and a fixed rating, not the seam’s defaults', async () => {
    /**
     * **The seam that protects real players would have erased the ramp.** `candidates()`
     * coalesces a missing gear score to the 1,500 starter grant and a missing rating to
     * 1,000 — so a bot without a standing row would read as gear 1,500 and rating 1,000,
     * collapsing all twenty rungs onto one point and silently discarding both axes this
     * phase authored.
     */
    const rows = await db()
      .select({
        username: accounts.username,
        gearScore: playerRatings.gearScore,
        rating: playerRatings.rating,
      })
      .from(accounts)
      .innerJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
      .where(and(eq(accounts.isBot, true), eq(accounts.botBand, 'starter')));

    const byName = new Map(rows.map((r) => [r.username, r]));

    for (const [index, bot] of STARTER_BOTS.entries()) {
      const row = byName.get(bot.username);
      expect(row, `${bot.username} has no standing row`).toBeDefined();
      expect(row!.gearScore, `${bot.username}'s gear is not the ramp's`).toBe(bot.gearScore);
      expect(row!.rating, `${bot.username}'s rating is not its ramp position`).toBe(
        botRating(index, STARTER_BOTS.length),
      );
    }

    // And the ratings are a spread, which is the whole point of a calibration anchor.
    const ratings = new Set(rows.map((r) => r.rating));
    expect(ratings.size, 'the bots all share one rating').toBeGreaterThan(15);
  });

  it('offers a starter player the whole authored pool, all of it bots (T041)', async () => {
    const list = await candidates(fresh);

    /**
     * T041's claim, against the real content: **100% bots with at least twenty distinct.**
     * The count can exceed twenty because the blocks above seeded two synthetic bots into
     * the same band, so this asserts the floor rather than an exact figure — a number that
     * depends on what another block did is a number that breaks when that block changes.
     */
    const distinct = new Set(list.candidates.map((c) => c.playerId));
    expect(distinct.size, 'the authored pool is not all there').toBeGreaterThanOrEqual(
      STARTER_BOTS.length,
    );

    for (const candidate of list.candidates) {
      expect(candidate.isBot, `${candidate.username} is not a bot`).toBe(true);
    }

    // Every authored bot specifically, by name — a count alone would pass on twenty
    // copies of one squad.
    const names = new Set(list.candidates.map((c) => c.username));
    for (const bot of STARTER_BOTS) {
      expect(names, `${bot.username} is missing from the pool`).toContain(bot.username);
    }
  });

  it('spans the gear ramp, so the pool is a ramp and not twenty of the same fight', async () => {
    const list = await candidates(fresh);
    const seeded = list.candidates.filter((c) => STARTER_BOTS.some((b) => b.username === c.username));

    const ratings = seeded.map((c) => c.rating).sort((a, b) => a - b);
    expect(ratings[0], 'no weak opponent in the pool').toBeLessThan(STARTING_RATING);
    expect(ratings.at(-1), 'no strong opponent in the pool').toBeGreaterThan(STARTING_RATING);

    // Ordered by rating descending, which is the one place rating is allowed to appear.
    const asServed = seeded.map((c) => c.rating);
    expect(asServed, 'the pool is not ordered by rating').toEqual(
      [...asServed].sort((a, b) => b - a),
    );
  });
});
