/**
 * **First acceptance wins** (013 T008–T010 · FR-010 · SC-001).
 *
 * ### TL;DR
 *
 * Two guilds can say yes to the same player at the same moment. Exactly one of them
 * gets them, everything else the player applied to closes itself, and the officer
 * who lost is told *what happened* rather than shown a server error. This file
 * proves that under real concurrency, and proves the two ways of getting it wrong
 * would have been caught.
 *
 * ### Why this test is written before the happy path
 *
 * A concurrency test written afterwards is written against an implementation that
 * already has a shape — and the shape is the thing being tested. `plan.md` and
 * `research.md` both say to confirm this before building anything else.
 *
 * ### The two proofs that matter more than the main case
 *
 * The main case passes for a locking scheme that is wrong in both directions, so
 * each direction gets its own test:
 *
 * - **Right rows, no serialisation.** Guild A accepting X while guild B accepts Y —
 *   *different players* — must both succeed concurrently. Locking the **guild** row
 *   would serialise these two for nothing.
 * - **Right grain.** Guild A accepting application 1 from X while guild B accepts
 *   application 2 from X. **These are different rows.** Locking the **application**
 *   row lets both through, and X joins two guilds.
 *
 * *Lock what the invariant is about.* The invariant is "an account belongs to at
 * most one guild", so the contended row is the applicant's membership.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../../src/db/client.js';
import { guildApplications, guildMembers } from '../../src/db/schema/guilds.js';
import { acceptApplication, apply } from '../../src/guilds/applications.js';
import { fixedClock } from '../../src/guilds/clock.js';
import { stripComments } from '../stripComments.js';
import { Fixtures } from './helpers.js';

const clock = fixedClock('2026-08-01T00:00:00.000Z');
const fx = new Fixtures();

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('two guilds accept the same applicant, simultaneously', () => {
  let applicant: string;
  let guildA: string;
  let guildB: string;
  let guildC: string;
  let appA: string;
  let appB: string;

  beforeAll(async () => {
    applicant = await fx.account('race');
    guildA = (await fx.guild('raceA')).id;
    guildB = (await fx.guild('raceB')).id;
    guildC = (await fx.guild('raceC')).id;

    const a = await apply(applicant, guildA, 'let me in', clock);
    const b = await apply(applicant, guildB, 'or me', clock);
    const c = await apply(applicant, guildC, 'or here', clock);

    expect(a.ok && b.ok && c.ok, 'fixture applications did not all open').toBe(true);
    appA = a.ok ? a.applicationId : '';
    appB = b.ok ? b.applicationId : '';
    expect(c.ok).toBe(true);
  });

  it('produces exactly one membership, one winner, and NEVER throws', async () => {
    /**
     * `Promise.all` over two `db().transaction()` calls takes two connections out
     * of the pool, so these really are concurrent — not two awaits in a row
     * wearing a costume.
     *
     * **The loser has two legitimate reasons and neither is an exception.** If the
     * winner commits before the loser's first read, the loser sees the application
     * already `withdrawn` → `not-open`. If the reads interleave, the loser reaches
     * the insert and takes the `23505` → `already-joined`. Which one happens is the
     * race; that it is a *result* rather than a thrown error is the contract, and
     * `acceptApplication` rejecting would fail this test rather than be caught.
     */
    const [first, second] = await Promise.all([
      acceptApplication(appA, clock),
      acceptApplication(appB, clock),
    ]);

    const winners = [first, second].filter((r) => r.ok);
    const losers = [first, second].filter((r) => !r.ok);

    expect(winners, 'exactly one acceptance must succeed').toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(['already-joined', 'not-open']).toContain(
      losers[0]!.ok === false ? losers[0]!.reason : '',
    );

    const rows = await db()
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.accountId, applicant));

    expect(rows, 'the applicant is in exactly one guild').toHaveLength(1);
  });

  it('tells the losing officer WHAT HAPPENED — already-joined, with the guild', async () => {
    /**
     * **Reproduced deterministically rather than hoped for.** The race above can
     * land on either branch, so the branch that actually matters gets its own
     * setup: a player who already holds a membership, and an application still
     * `open` against a different guild. That is exactly the state the losing
     * transaction sees from the inside, and it is reachable in production whenever
     * two officers click within the same instant.
     *
     * The application is inserted directly because `apply()` correctly refuses a
     * player who is already in a guild — the guard being bypassed here is the one
     * the race bypasses too.
     *
     * A `23505` that escapes is a 500, and a 500 teaches an officer the game is
     * broken. *"Reyna joined The Long Reach a moment ago"* is true and actionable,
     * and `guildId` is what lets the client name the guild.
     */
    const person = await fx.account('loser');
    const home = await fx.guild('loserHome');
    const other = await fx.guild('loserOther');
    await fx.join(home.id, person);

    const [stale] = await db()
      .insert(guildApplications)
      .values({
        accountId: person,
        guildId: other.id,
        message: '',
        createdAt: clock.now(),
        expiresAt: new Date(clock.now().getTime() + 86_400_000),
      })
      .returning({ id: guildApplications.id });

    const result = await acceptApplication(stale!.id, clock);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('already-joined');
    expect(
      !result.ok && result.reason === 'already-joined' && result.guildId,
      'the officer is told WHICH guild took them, or the message has no name in it',
    ).toBe(home.id);
  });

  it('withdraws every OTHER open application — zero remain (SC-001)', async () => {
    const rows = await db()
      .select({ id: guildApplications.id, state: guildApplications.state })
      .from(guildApplications)
      .where(eq(guildApplications.accountId, applicant));

    expect(rows.length, 'three applications were made').toBe(3);
    expect(
      rows.filter((r) => r.state === 'open'),
      'a player in a guild with an open application is one acceptance from two guilds',
    ).toHaveLength(0);
    expect(rows.filter((r) => r.state === 'accepted')).toHaveLength(1);
    expect(rows.filter((r) => r.state === 'withdrawn')).toHaveLength(2);
  });
});

describe('withdrawal is INSIDE the transaction (T014)', () => {
  /**
   * ### This one is asserted structurally, and the reason is worth recording
   *
   * Moving the withdrawal out of the transaction was tried as a mutation against
   * every behavioural test in this file, and **all eighteen still passed.** The bug
   * it introduces is a *window* — a moment where the player holds a membership and
   * still has open applications — and two concurrent calls in a test do not land
   * inside a window that small reliably enough to fail a suite. A test that catches
   * it one run in fifty is worse than no test, because it teaches people to re-run.
   *
   * So the claim is checked where it is actually decidable: **the statements are
   * lexically inside the transaction block.** That is a weaker kind of proof — it
   * reads the source rather than the behaviour — and it is the strongest kind
   * available here. It is written down rather than left implied so nobody later
   * mistakes the behavioural tests for coverage of this.
   */
  const source = stripComments(
    readFileSync(join(import.meta.dirname, '../../src/guilds/applications.ts'), 'utf8'),
    'applications.ts',
  );

  /** The transaction body, by brace matching from the callback's opening brace. */
  function transactionBody(): string {
    const start = source.indexOf('.transaction(');
    expect(start, 'acceptApplication no longer opens a transaction at all').toBeGreaterThan(-1);

    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(open, i);
      }
    }

    throw new Error('unbalanced braces — the scan cannot be trusted, fix it');
  }

  it('the membership insert, the withdrawal and the acceptance are one unit', () => {
    const body = transactionBody();

    expect(body, 'the contended insert must be in the transaction').toContain('guildMembers');
    expect(
      body,
      "withdrawing the OTHER applications outside the transaction leaves a window in " +
        'which a second acceptance is a second membership — that is the whole bug',
    ).toContain("state: 'withdrawn'");
    expect(body).toContain("state: 'accepted'");
  });
});

describe('the RIGHT rows are contended', () => {
  it('two guilds accepting two DIFFERENT players do not serialise', async () => {
    const x = await fx.account('rowX');
    const y = await fx.account('rowY');
    const a = (await fx.guild('rowA')).id;
    const b = (await fx.guild('rowB')).id;

    const ax = await apply(x, a, '', clock);
    const by = await apply(y, b, '', clock);
    expect(ax.ok && by.ok).toBe(true);

    const [first, second] = await Promise.all([
      acceptApplication(ax.ok ? ax.applicationId : '', clock),
      acceptApplication(by.ok ? by.applicationId : '', clock),
    ]);

    /**
     * **Both must succeed.** If this ever fails, somebody has taken a lock on the
     * guild row — which serialises unrelated work and buys nothing, because two
     * different guilds accepting two different players share no invariant.
     */
    expect(first.ok, 'X into A failed — is something locking the guild row?').toBe(true);
    expect(second.ok, 'Y into B failed — is something locking the guild row?').toBe(true);
  });
});

describe('the RIGHT GRAIN is contended', () => {
  it('two DIFFERENT applications from ONE player still produce one membership', async () => {
    /**
     * **The subtle one.** Application 1 and application 2 are different rows with
     * different ids. A lock on "the application" conflicts on nothing here, both
     * transactions commit, and the player is in two guilds — with no error anywhere
     * to say so.
     */
    const person = await fx.account('grain');
    const a = (await fx.guild('grainA')).id;
    const b = (await fx.guild('grainB')).id;

    const one = await apply(person, a, '', clock);
    const two = await apply(person, b, '', clock);
    expect(one.ok && two.ok).toBe(true);

    await Promise.all([
      acceptApplication(one.ok ? one.applicationId : '', clock),
      acceptApplication(two.ok ? two.applicationId : '', clock),
    ]);

    const rows = await db()
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.accountId, person));

    expect(rows, 'two applications, one player, ONE membership').toHaveLength(1);
    expect([a, b]).toContain(rows[0]!.guildId);
  });

  it('and the losing application is not left open', async () => {
    const person = await fx.account('grain2');
    const a = (await fx.guild('grain2A')).id;
    const b = (await fx.guild('grain2B')).id;

    const one = await apply(person, a, '', clock);
    const two = await apply(person, b, '', clock);
    expect(one.ok && two.ok).toBe(true);

    await Promise.all([
      acceptApplication(one.ok ? one.applicationId : '', clock),
      acceptApplication(two.ok ? two.applicationId : '', clock),
    ]);

    const states = await db()
      .select({ state: guildApplications.state })
      .from(guildApplications)
      .where(
        and(
          eq(guildApplications.accountId, person),
          inArray(guildApplications.guildId, [a, b]),
        ),
      );

    /**
     * The loser is `withdrawn` (the winner's transaction closed it) — never left
     * `open`, which would put the player one officer-click from a second guild.
     */
    expect(states.filter((s) => s.state === 'open')).toHaveLength(0);
    expect(states.filter((s) => s.state === 'accepted')).toHaveLength(1);
  });
});
