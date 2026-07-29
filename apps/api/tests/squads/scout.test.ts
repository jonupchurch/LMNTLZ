/**
 * Scouting (T039–T040, SC-007).
 *
 * **The absence assertions search the entire serialised response.**
 *
 * That is the whole method, and it is not pedantry. Checking remembered fields —
 * `expect(body.hidden.seats).toBeUndefined()` — only ever tests the leaks you
 * already thought of. The leak that actually happens is a field somebody adds
 * later for a good reason, in a place nobody was watching: a debug key, a
 * `_raw`, a nested object that came along with a join. Searching the whole JSON
 * for the *values that must not appear* catches all of those, including the ones
 * that do not exist yet.
 *
 * So the Hidden squad is stocked with champions who appear **nowhere else** in
 * the fixture, and the test asserts their ids and names are absent from the
 * response text entirely.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAllHeroes, getHero } from '@lmntlz/content';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const ROSTER = getAllHeroes().map((h) => h.id);
const created: string[] = [];
let restore: (() => void) | undefined;

/** The scouted player. */
let targetId = '';
/** The scout. A different account, because scouting yourself would prove nothing. */
let scoutSession = '';

const VISIBLE_IDS = ROSTER.slice(0, 6);
const HIDDEN_IDS = ROSTER.slice(6, 12);

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

async function signIn(sub: string) {
  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:${sub}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  created.push(body.account.id);
  return body;
}

const seats = (ids: readonly string[]) =>
  [
    { row: 'front', index: 0, heroId: ids[0] },
    { row: 'front', index: 1, heroId: ids[1] },
    { row: 'middle', index: 0, heroId: ids[2] },
    { row: 'middle', index: 1, heroId: ids[3] },
    { row: 'middle', index: 2, heroId: ids[4] },
    { row: 'back', index: 0, heroId: ids[5] },
  ].map((s) => ({
    ...s,
    config: {
      // **Deliberately distinctive**, so the absence check below is meaningful:
      // if any of these strings appears in the scout response, the defender's
      // plan leaked.
      targeting: ['buffers-first', 'most-mitigation'],
      ranking: [3, 1, 4, 0, 5, 2],
      allyRule: 'highest-current-hp',
    },
  }));

beforeAll(async () => {
  restore = overrideProvider('google', provider);

  const target = await signIn(`scout-target-${RUN}`);
  targetId = target.account.id;
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${target.session.token}` };

  for (const [zone, ids] of [
    ['visible', VISIBLE_IDS],
    ['hidden', HIDDEN_IDS],
  ] as const) {
    const res = await app.request(`/v1/squads/defense/${zone}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ seats: seats(ids) }),
    });
    expect(res.status, zone).toBe(200);
  }

  const scout = await signIn(`scout-caller-${RUN}`);
  scoutSession = scout.session.token;
});

afterAll(async () => {
  restore?.();
  for (const id of created) await db().delete(accounts).where(eq(accounts.id, id));
  await closeDb();
});

const scout = () =>
  app.request(`/v1/players/${targetId}/scout`, {
    headers: { authorization: `Bearer ${scoutSession}` },
  });

describe('what a scout SEES (T039)', () => {
  it('returns the six Visible champions in their 2/3/1 formation', async () => {
    const res = await scout();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      visible: { seats: { row: string; index: number; hero: { id: string } }[]; holdStreak: number };
    };

    expect(body.visible.seats).toHaveLength(6);
    expect(body.visible.seats.map((s) => s.hero.id).sort()).toEqual([...VISIBLE_IDS].sort());

    const rows = body.visible.seats.reduce<Record<string, number>>((acc, s) => {
      acc[s.row] = (acc[s.row] ?? 0) + 1;
      return acc;
    }, {});
    expect(rows).toEqual({ front: 2, middle: 3, back: 1 });
  });

  it('discloses both types, so Bane and Fault are readable', async () => {
    const body = (await (await scout()).json()) as {
      visible: { seats: { hero: { id: string; primary: string; secondary: string; bane: string; fault: string } }[] };
    };

    for (const seat of body.visible.seats) {
      const hero = getHero(seat.hero.id);
      expect(seat.hero.primary).toBe(hero.primary);
      expect(seat.hero.secondary).toBe(hero.secondary);
      // Derived from the two authored types, so this is free information — a
      // scout could compute it from the Codex regardless.
      expect(seat.hero.bane).toBeTruthy();
      expect(seat.hero.fault).toBeTruthy();
    }
  });

  it('shows three rune slots per champion: element and stages only', async () => {
    const body = (await (await scout()).json()) as {
      visible: { seats: { runes: { element: string; stages: number }[] }[] };
    };

    for (const seat of body.visible.seats) {
      expect(seat.runes).toHaveLength(3);
      for (const rune of seat.runes) {
        expect(typeof rune.element).toBe('string');
        expect(rune.stages).toBeGreaterThanOrEqual(0);
        expect(rune.stages).toBeLessThanOrEqual(4);
        // **Commitment, never power.** At an identical 1,950-shard spend the
        // best allocation scores ~3.35x the worst, so pips show that a player
        // committed — not that they committed well. That gap is what makes the
        // disclosure safe and bluffing a real strategy.
        expect(Object.keys(rune).sort()).toEqual(['element', 'stages']);
      }
    }
  });

  it('shows BOTH hold streaks', async () => {
    const body = (await (await scout()).json()) as {
      visible: { holdStreak: number };
      hidden: { holdStreak: number };
    };
    expect(typeof body.visible.holdStreak).toBe('number');
    expect(typeof body.hidden.holdStreak).toBe('number');
  });
});

describe('what a scout must NEVER see, searched across the whole response (T040, SC-007)', () => {
  it('contains no Hidden champion in any form', async () => {
    const text = await (await scout()).text();

    // The Hidden six appear nowhere else in the fixture, so any occurrence of
    // an id or a name is a leak — including through a field nobody has written
    // yet, which is the leak that actually happens.
    for (const id of HIDDEN_IDS) {
      const hero = getHero(id);
      expect(text, `Hidden champion id ${id} leaked`).not.toContain(`"${id}"`);
      expect(text, `Hidden champion name ${hero.name} leaked`).not.toContain(hero.name);
    }
  });

  it('exposes nothing about the Hidden zone but its streak (FR-018, FR-020)', async () => {
    const body = (await (await scout()).json()) as { hidden: Record<string, unknown> };

    // Not "seats is undefined" — the whole key set. An empty array would still
    // tell a scout the shape of what is missing.
    expect(Object.keys(body.hidden)).toEqual(['holdStreak']);
  });

  it('contains no targeting rule or power ranking, in EITHER zone', async () => {
    const text = await (await scout()).text();

    for (const value of ['buffers-first', 'most-mitigation', 'highest-current-hp']) {
      expect(text, `the defender's plan leaked: ${value}`).not.toContain(value);
    }
    for (const key of ['targeting', 'ranking', 'powerRanking', 'allyRule', 'targetPrimary', 'targetFallback']) {
      expect(text.toLowerCase(), `response carries "${key}"`).not.toContain(key.toLowerCase());
    }
  });

  it('contains no stat value, base or runed', async () => {
    const text = (await (await scout()).text()).toLowerCase();

    // Disclosing a stat turns a readable squad into a solvable one.
    for (const key of ['might', 'speed', 'toughness', 'perception', 'agility', 'luck', 'armor', 'magicresist', 'penetration', 'stats']) {
      expect(text, `response carries "${key}"`).not.toContain(key);
    }
  });

  it('contains no boosted stat and no utility effect for any rune', async () => {
    const text = (await (await scout()).text()).toLowerCase();
    for (const key of ['boost', 'utility', 'effect', 'gearscore']) {
      expect(text, `response carries "${key}"`).not.toContain(key);
    }
  });

  it('carries no power list, which would give the ranking away by omission', async () => {
    const text = (await (await scout()).text()).toLowerCase();
    for (const key of ['powers', 'cooldown', 'multiplier', 'tier']) {
      expect(text, `response carries "${key}"`).not.toContain(key);
    }
  });
});

describe('the serialiser is its own, not shared', () => {
  it('imports no serialiser from elsewhere', async () => {
    // **A shared serialiser is exactly how the Hidden squad leaks** — not by
    // somebody writing `hidden: fullSquad`, but by a later feature adding a
    // field to a shared function for a good reason, silently disclosing it here.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(import.meta.dirname, '../../src/squads/scoutSerializer.ts'), 'utf8');

    const imports = [...source.matchAll(/^import .*?from '(.+?)';$/gm)].map((m) => m[1]);
    for (const specifier of imports) {
      expect(specifier, 'the scout view imports a serialiser').not.toMatch(/serial|present|view|dto/i);
    }
  });

  it('needs a session', async () => {
    expect((await app.request(`/v1/players/${targetId}/scout`)).status).toBe(401);
  });

  it('404s an unknown player rather than leaking whether the id exists', async () => {
    const res = await app.request('/v1/players/00000000-0000-0000-0000-000000000000/scout', {
      headers: { authorization: `Bearer ${scoutSession}` },
    });
    expect(res.status).toBe(404);
  });
});
