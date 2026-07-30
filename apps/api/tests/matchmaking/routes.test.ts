/**
 * The three routes are mounted, guarded, and reachable (009 T001, T015, T016).
 *
 * **This is the test features 006 and 007 both needed and neither had.** 006 ended
 * by discovering that every squad component was complete, unit-tested and
 * unreachable from the running app; 007's replay writer was called from one of two
 * settlement paths and the other silently recorded nothing. Both were built
 * correctly and wired incompletely, and in both cases every other test passed.
 *
 * `STATUS.md` drew the conclusion — *"features 007–016 should each check that
 * something renders what they build"* — so this file exists before the client does.
 * A route that typechecks is not a route that answers.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import app from '../../src/index.js';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const RUN = `${process.pid}${Math.floor(Math.random() * 1e6)}`.slice(-9);
const created: string[] = [];
let restore: (() => void) | undefined;

const tokenIsSubject: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

let session: string;

beforeAll(async () => {
  restore = overrideProvider('google', tokenIsSubject);

  const res = await app.request('/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: `sub:mm-routes-${RUN}` }),
  });
  const body = (await res.json()) as { session: { token: string }; account: { id: string } };
  session = body.session.token;
  created.push(body.account.id);
}, 120_000);

afterAll(async () => {
  restore?.();
  if (created.length) await db().delete(accounts).where(inArray(accounts.id, created));
  await closeDb();
});

const authed = (path: string) =>
  app.request(path, { headers: { authorization: `Bearer ${session}` } });

describe('the guard is on the prefix, so a new handler inherits it', () => {
  it('refuses both player routes without a session', async () => {
    for (const path of ['/v1/matchmaking/candidates', '/v1/me/standing']) {
      const res = await app.request(path);
      expect(res.status, `${path} is unguarded`).toBe(401);
    }
  });

  it('refuses a nonsense bearer token', async () => {
    const res = await app.request('/v1/me/standing', {
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/matchmaking/candidates', () => {
  it('answers 200 with the contract shape', async () => {
    const res = await authed('/v1/matchmaking/candidates');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;

    // Set equality on the keys, not containment: an extra field is a field the
    // client will start depending on before anybody decides it should exist.
    expect(Object.keys(body).sort()).toEqual(
      [
        'ambushChance',
        'candidates',
        'consecutiveWins',
        'gearScore',
        'league',
        'positionInLeague',
        'widened',
      ].sort(),
    );

    expect(body['league']).toBe('bronze');
    expect(body['gearScore']).toBe(1500);
    expect(Array.isArray(body['candidates'])).toBe(true);
  });

  it('ignores query parameters rather than honouring them', async () => {
    /**
     * **The HTTP half of *the signature is the enforcement*.** `candidates()` cannot
     * be filtered in TypeScript; this checks nobody can filter it over the wire
     * either. A handler that quietly read `?exclude=` would pass every unit test in
     * `candidates.test.ts`.
     */
    const plain = await (await authed('/v1/matchmaking/candidates')).json();
    const meddled = await (
      await authed('/v1/matchmaking/candidates?exclude=everyone&minRating=9999&limit=0')
    ).json();

    expect(JSON.stringify(meddled)).toBe(JSON.stringify(plain));
  });
});

describe('GET /v1/me/standing', () => {
  it('answers 200 with both axes and the named band', async () => {
    const res = await authed('/v1/me/standing');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(
      [
        'ambushChance',
        'band',
        'consecutiveWins',
        'gearScore',
        'league',
        'positionInLeague',
        'rating',
        'ratedBattles',
        'starter',
      ].sort(),
    );

    expect(body['rating']).toBe(1000);
    expect(body['ratedBattles']).toBe(0);
    expect(body['band']).toBe('provisional');
  });

  it('names the band and never the K value', async () => {
    /**
     * `06-progression.md` calls the K bands *"a starting point, not a decision"*. A
     * client shown `40` will display it; a client shown `provisional` keeps working
     * when the constant moves. The number is available under `config` for anything
     * that genuinely needs it.
     */
    const body = (await (await authed('/v1/me/standing')).json()) as Record<string, unknown>;

    expect(JSON.stringify(body)).not.toContain('40');
    expect(body['band']).toBe('provisional');
  });

  it('does not name an opponent league (FR-006)', async () => {
    // Same-league matching means knowing your own tells you every opponent's band.
    // It is named only on a widened match, which arrives with bots in Phase 7.
    const body = (await (await authed('/v1/matchmaking/candidates')).json()) as {
      candidates: Array<Record<string, unknown>>;
      widened: boolean;
    };

    expect(body.widened).toBe(false);
    for (const candidate of body.candidates) {
      expect(Object.keys(candidate)).not.toContain('league');
    }
  });
});

describe('GET /v1/matchmaking/config', () => {
  it('is public, because a client that must sign in first will hard-code instead', async () => {
    const res = await app.request('/v1/matchmaking/config');
    expect(res.status).toBe(200);
  });

  it('carries the league table and the ambush constants', async () => {
    const body = (await (await app.request('/v1/matchmaking/config')).json()) as {
      leagues: Array<{ league: string; floor: number; ceiling: number }>;
      ambush: { perWin: number; cap: number; capAt: number };
      bound: { normal: number; widened: number };
    };

    expect(body.leagues.map((l) => l.league)).toEqual([
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
    ]);
    expect(body.leagues[0]).toEqual({ league: 'bronze', floor: 1500, ceiling: 2500 });
    expect(body.ambush).toEqual({ perWin: 2, cap: 90, capAt: 45 });
    expect(body.bound).toEqual({ normal: 1.67, widened: 2.67 });
  });

  it('leaks no per-player value', async () => {
    /**
     * **Asserted structurally, because string-sniffing got this wrong.** My first
     * version banned the substring `gearScore"` — and the config legitimately carries
     * a `gearScore` object of *constants* (`perStatPoint`, `completeRune`,
     * `starterGrant`, `fullKit`). The name is shared; the meaning is not.
     *
     * The actual property is that the answer does not depend on who asks. Comparing
     * an authenticated response against an anonymous one proves that directly, and
     * cannot be fooled by a field name.
     */
    const anonymous = await (await app.request('/v1/matchmaking/config')).text();
    const signedIn = await (await authed('/v1/matchmaking/config')).text();

    expect(signedIn, 'the config differs by caller').toBe(anonymous);

    // And nothing account-shaped: a uuid is what every identifier here looks like.
    expect(anonymous).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('the routes are actually mounted under /v1', () => {
  it('404s an unversioned path', async () => {
    // `/` and anything outside `/v1` is a 404 by design — an unversioned route that
    // happens to work is a route somebody will depend on.
    expect((await app.request('/matchmaking/config')).status).toBe(404);
  });

  it('404s a neighbouring path that does not exist', async () => {
    expect((await app.request('/v1/matchmaking/nope')).status).toBe(404);
  });
});
