/**
 * `GET /v1/me/export` — everything of yours, and nobody's squad (012 T015–T017).
 *
 * ### TL;DR
 *
 * A player can download every battle they have ever fought, Hidden ones
 * included, as a spreadsheet file. What the file must never carry is who was in
 * anybody's squad — **not the opponent's, and not the player's own**, because a
 * player can publish their own export and their own Hidden squad is the one
 * thing the zone design rests on being secret.
 *
 * ### The header is matched exactly, never with `toContain`
 *
 * `battle_records` is the analytics product and will keep growing. A
 * containment check passes on a *widened* export, which is the failure mode that
 * matters: a migration adds a column, a spread picks it up, and the file quietly
 * starts publishing something. An exact match makes that a CI failure.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { getAllHeroes } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb } from '../../src/db/client.js';
import { EXPORT_HEADER } from '../../src/profiles/export.js';
import { resetExportLimit } from '../../src/profiles/rateLimit.js';
import { DAY_MS, Ledger, dropAccounts, makeAccount, recordMany } from './helpers.js';
import { signIn, type Signed } from './session.js';

const ledger = new Ledger();
const accountIds: string[] = [];

let me: Signed;
let foe: { id: string; username: string };

const BATTLES = 200;
const HIDDEN_SHARE = 3; // every third battle is Hidden

beforeAll(async () => {
  me = await signIn('export-me');
  foe = await makeAccount('export-foe');
  accountIds.push(me.accountId, foe.id);

  const now = Date.now();
  await recordMany(
    ledger,
    Array.from({ length: BATTLES }, (_, i) => ({
      // Alternate sides so both the attacker and defender branches are exercised.
      attackerId: i % 2 === 0 ? me.accountId : foe.id,
      defenderId: i % 2 === 0 ? foe.id : me.accountId,
      zone: (i % HIDDEN_SHARE === 0 ? 'hidden' : 'visible') as 'hidden' | 'visible',
      concludedAt: new Date(now - i * (DAY_MS / 4)),
    })),
  );
});

afterAll(async () => {
  await ledger.drop();
  await dropAccounts(accountIds);
  await closeDb();
});

async function csv(): Promise<{ status: number; text: string }> {
  resetExportLimit();
  const res = await app.request('/v1/me/export', {
    headers: { authorization: `Bearer ${me.token}` },
  });

  return { status: res.status, text: await res.text() };
}

describe('the header, matched exactly (T015)', () => {
  it('is the ten named columns and nothing else', async () => {
    const { status, text } = await csv();
    expect(status, text.slice(0, 200)).toBe(200);

    const header = text.split('\r\n')[0];

    expect(
      header,
      'A widened export must fail here rather than ship. If a column was added ' +
        'to battle_records and picked up by a spread, this is the assertion ' +
        'that catches it.',
    ).toBe(
      'battleId,concludedAt,role,opponentUsername,opponentWasBot,zone,outcome,turnCount,leagueAtTime,ratingAtBattle',
    );
  });

  it('the exported constant and the emitted row agree', async () => {
    const { text } = await csv();

    expect(text.split('\r\n')[0]).toBe(EXPORT_HEADER.join(','));
  });

  it('every data row has exactly as many columns as the header', async () => {
    const { text } = await csv();
    const lines = text.split('\r\n');

    expect(lines.length).toBe(BATTLES + 1);
    for (const line of lines.slice(1)) {
      expect(line.split(',')).toHaveLength(EXPORT_HEADER.length);
    }
  });

  it("includes the player's own Hidden battles (FR-006)", async () => {
    const { text } = await csv();
    const hidden = text.split('\r\n').slice(1).filter((l) => l.includes(',hidden,'));

    // Every third battle. Their own Hidden battles are theirs to know.
    expect(hidden.length).toBe(Math.ceil(BATTLES / HIDDEN_SHARE));
  });
});

describe('no squad composition, either side (T016, SC-004)', () => {
  it('carries no hero id, no hero name and no row name across 200 battles', async () => {
    const { status, text } = await csv();
    expect(status).toBe(200);

    const body = text.split('\r\n').slice(1).join('\n');

    /**
     * **The complete roster, not the fixture's four.** Identifying what to search
     * for from the fixture would miss exactly the heroes a bug introduced — the
     * same trap that let a scout-panel mutation survive sixteen tests. So the
     * domain is all 27 heroes as the content package defines them.
     */
    for (const hero of getAllHeroes()) {
      expect(body, `hero id "${hero.id}" appears in the export`).not.toContain(hero.id);
      expect(body, `hero name "${hero.name}" appears in the export`).not.toContain(hero.name);
    }

    for (const word of ['squad', 'seats', 'front', 'middle', 'back']) {
      expect(body.toLowerCase(), `"${word}" appears in the export`).not.toContain(word);
    }
  });

  it('drops BOTH squads rather than conditionally emitting one', async () => {
    const source = await readFile(
      new URL('../../src/profiles/export.ts', import.meta.url),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(
      code.length,
      'Comment stripping ate the file — this scan would pass vacuously.',
    ).toBeGreaterThan(400);

    // Neither column may be selected at all. A conditional is one inverted
    // boolean from full disclosure and produces an entirely plausible file.
    expect(code).not.toMatch(/attackerSquad|defenderSquad|attacker_squad|defender_squad/);
  });

  it('never selects with a star or a spread', async () => {
    const source = await readFile(
      new URL('../../src/profiles/export.ts', import.meta.url),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code.length).toBeGreaterThan(400);
    expect(code).not.toMatch(/select\s*\(\s*\)/);
    expect(code, 'A spread of a record row publishes whatever a migration adds').not.toMatch(
      /\.\.\.\s*(row|record|r)\b/,
    );
  });
});

describe('two routes, never a scope parameter (T017)', () => {
  it('no source in profiles/ mentions a scope or an includeGuild flag', async () => {
    const dir = new URL('../../src/profiles/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'));

    expect(files.length, 'the profiles module has no sources to scan').toBeGreaterThan(3);

    for (const file of files) {
      const source = await readFile(new URL(file, dir), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

      expect(
        code,
        `${file} names a scope. A scope parameter invites the bug where an ` +
          `officer requests the wider one; two routes cannot express that.`,
      ).not.toMatch(/\bscope\b|\bincludeGuild\b/);
    }
  });
});

describe('rate limiting (T023, FR-010)', () => {
  it('refuses a second export inside the window', async () => {
    resetExportLimit();

    const first = await app.request('/v1/me/export', {
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(first.status).toBe(200);

    const second = await app.request('/v1/me/export', {
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(second.status).toBe(429);
  });

  it('requires a session', async () => {
    const res = await app.request('/v1/me/export');

    expect(res.status).toBe(401);
  });
});
