/**
 * What a guild view **never** contains (013 T036 · Constitution XVII).
 *
 * ### TL;DR
 *
 * Looking at a guild shows you who is in it. It does not show you who *applied* and
 * was turned down, how many shards anybody has, or what heroes they defend with.
 * Guild membership is public; the rest is not.
 *
 * ### Storing is not exposing, and the line is drawn between two facts
 *
 * **Membership is public** — it appears on a profile, it is how recruiting works,
 * and hiding it would make guilds invisible to the people meant to join them.
 * **An application is not.** Whether somebody applied to four guilds and was
 * dismissed by three is between them and those guilds; publishing it would make
 * applying a risk, and FR-008's five-at-once budget assumes applying is cheap.
 *
 * ### Asserted over the serialised response, not field by field
 *
 * A `toHaveProperty` check per field passes for whatever the response gained since
 * it was written. Scanning the whole JSON for values that must not appear catches
 * the field nobody thought to exclude — which is the only kind that ever leaks.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { shardLedger } from '../../src/db/schema/ledger.js';
import { squads } from '../../src/db/schema/squads.js';
import { apply, pendingFor } from '../../src/guilds/applications.js';
import { fixedClock } from '../../src/guilds/clock.js';
import { publicProfile } from '../../src/profiles/publicProfile.js';
import { stripComments } from '../stripComments.js';
import { signIn, type Signed } from '../profiles/session.js';
import { Fixtures } from './helpers.js';

const clock = fixedClock('2026-08-01T00:00:00.000Z');
const fx = new Fixtures();

let guildId: string;
let masterId: string;
let memberId: string;
let applicantId: string;
let viewer: Signed;
let view: unknown;

/**
 * **The real response, over HTTP.**
 *
 * The first version of this helper selected the raw `guilds` row and stringified
 * it — which of course contained no shard balance and no applications, because it
 * is one table. **Every assertion below passed and none of them tested anything.**
 * A disclosure test that does not go through the route tests the wrong object;
 * the leak, if there is one, is in what the handler *assembles*.
 */
async function guildViewJson(id: string, viewer: Signed): Promise<string> {
  const res = await app.request(`/v1/guilds/${id}`, { headers: viewer.headers() });
  const text = await res.text();
  expect(res.status, text).toBe(200);

  return text;
}

beforeAll(async () => {
  viewer = await signIn('boundViewer');
  fx.accountIds.push(viewer.accountId);

  const made = await fx.guild('bound');
  guildId = made.id;
  masterId = made.masterId;

  memberId = await fx.account('boundMember');
  await fx.join(guildId, memberId);

  applicantId = await fx.account('boundApplicant');
  await apply(applicantId, guildId, 'a secret hope', clock);

  /** A shard balance and a defense squad, so a leak would have something to leak. */
  await db().insert(shardLedger).values({ accountId: memberId, delta: 4_321, reason: 'grant' });
  await db()
    .insert(squads)
    .values({
      accountId: memberId,
      kind: 'defense',
      zone: 'visible',
      slot: 0,
      seats: [{ row: 'front', index: 0, heroId: 'h07' }],
    });

  view = JSON.parse(await guildViewJson(guildId, viewer));
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('a guild view discloses membership and nothing adjacent', () => {
  it('contains no shard balance anywhere in the payload', () => {
    const json = JSON.stringify(view);
    expect(json).not.toContain('4321');
    expect(json).not.toMatch(/shard|balance|ledger/i);
  });

  it('contains no squad composition — no hero id, no seat, no zone', () => {
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/\bh0[1-9]\b|\bh1[0-9]\b|\bh2[0-7]\b/);
    expect(json).not.toMatch(/seats?|formation|front|middle|back/i);
  });

  it("contains no other player's application, nor its message", () => {
    const json = JSON.stringify(view);
    expect(json, 'an application message is between the applicant and the guild').not.toContain(
      'a secret hope',
    );
    expect(json).not.toMatch(/application/i);
    expect(json).not.toContain(applicantId);
  });
});

describe("the review queue is the officers', and is reached separately", () => {
  it('pendingFor returns the application — it is stored, just not published', async () => {
    const pending = await pendingFor(guildId);

    /**
     * **Storing is not exposing.** The application is here, in full, for the
     * people entitled to act on it. That it exists is not the disclosure; putting
     * it on the public view would be.
     */
    expect(pending.map((p) => p.accountId)).toContain(applicantId);
    expect(pending.find((p) => p.accountId === applicantId)?.message).toBe('a secret hope');
  });
});

describe('a profile shows the guild badge and stops there (T063)', () => {
  it('names the guild and the role, and carries no roster', async () => {
    const profile = await publicProfile(memberId);

    expect(profile.guild, 'the 013 seam still returns a hard-coded null').not.toBeNull();
    expect(profile.guild?.id).toBe(guildId);
    expect(profile.guild?.role).toBe('member');

    /** Three fields. A roster here would make every profile a guild enumeration. */
    expect(Object.keys(profile.guild ?? {}).sort()).toEqual(['id', 'name', 'role']);

    const json = JSON.stringify(profile);
    expect(json, "another member's id has no business on this profile").not.toContain(masterId);
  });

  it('a player in no guild gets null, which is a state and not a stub', async () => {
    const loner = await fx.account('loner');
    const profile = await publicProfile(loner);

    expect(profile.guild).toBeNull();
  });
});

describe('the source says what it does not do', () => {
  it('no guilds module mentions a Wing, an event, a fund or a treasury (T053)', () => {
    /**
     * **A "harmless" Wing column now is a structure with no rules attached, and it
     * will acquire wrong ones.** A Wing exists only for an event, so deferring
     * events defers Wings — they are not separable.
     *
     * Comments are stripped first: this feature's own documentation explains *why*
     * Wings are deferred, at length, and a scan that matched the explanation of a
     * ban is a scan that can never pass.
     */
    const dir = join(import.meta.dirname, '../../src/guilds');
    const files = ['applications.ts', 'clock.ts', 'config.ts', 'found.ts', 'invites.ts', 'membership.ts', 'routes.ts'];

    for (const file of files) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'), file);
      expect(code, `${file} mentions a deferred concept`).not.toMatch(
        /\bwing\b|\bevent\b|guildFund|treasury/i,
      );
    }
  });
});
