/**
 * The cross-origin policy, driven through the **real app**.
 *
 * Every assertion here is about a header a browser reads and a server never
 * does, which is why none of it can be checked by calling a handler. The whole
 * failure class this guards is *"the API returns 200 and the page still cannot
 * read it"* — and the two places that goes wrong are the allowlist match and the
 * middleware order, neither of which is visible from inside a route.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/index.js';
import { CORS_ORIGINS_VAR, parseAllowedOrigins } from '../../src/cors.js';

const CLIENT = 'https://lmntlz.vercel.app';
const before = process.env[CORS_ORIGINS_VAR];

beforeEach(() => {
  process.env[CORS_ORIGINS_VAR] = `${CLIENT}, http://localhost:5173`;
});

afterAll(() => {
  if (before === undefined) delete process.env[CORS_ORIGINS_VAR];
  else process.env[CORS_ORIGINS_VAR] = before;
});

const get = (origin?: string) =>
  app.request('/v1/health', origin ? { headers: { origin } } : {});

const allow = (res: Response) => res.headers.get('access-control-allow-origin');

describe('parsing the allowlist', () => {
  it('splits, trims and lowercases', () => {
    expect(parseAllowedOrigins(' https://A.example ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('strips trailing slashes, which people write in env vars and browsers never send', () => {
    expect(parseAllowedOrigins('https://a.example/')).toEqual(['https://a.example']);
  });

  it('drops `*` and `null` rather than honouring them', () => {
    // The two values that turn an allowlist into an open door. Both arrive only
    // by mistake, and the mistake should cost a working feature rather than the
    // whole policy — a copied `*` that silently works is never found.
    expect(parseAllowedOrigins('*')).toEqual([]);
    expect(parseAllowedOrigins('null')).toEqual([]);
    expect(parseAllowedOrigins(`${CLIENT},*,null`)).toEqual([CLIENT]);
  });

  it('treats unset and empty as an empty allowlist, never as a wildcard', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(' , , ')).toEqual([]);
  });
});

describe('which origins are answered', () => {
  it('echoes an allowlisted origin exactly', async () => {
    const res = await get(CLIENT);
    expect(res.status).toBe(200);
    expect(allow(res)).toBe(CLIENT);
  });

  it('varies on Origin, so no cache serves one origin the answer for another', async () => {
    // A shared cache in front of the API that ignored this would hand
    // `lmntlz.vercel.app`'s allow-header to the next caller, whoever that is.
    expect((await get(CLIENT)).headers.get('vary')?.toLowerCase()).toContain('origin');
  });

  it('refuses an origin that is not on the list', async () => {
    expect(allow(await get('https://evil.example'))).toBeNull();
  });

  it('refuses a lookalike that merely starts with an allowed origin', async () => {
    // The reason the match is exact rather than a prefix test. This hostname is
    // registrable by anybody.
    expect(allow(await get(`${CLIENT}.evil.example`))).toBeNull();
  });

  it('refuses `Origin: null`', async () => {
    // Sandboxed iframes and `file://` pages both send it, indistinguishably —
    // allowing one allows every one of them.
    expect(allow(await get('null'))).toBeNull();
  });

  it('leaves a request with no Origin alone', async () => {
    // curl, the uptime check, server-to-server. Not a CORS request; a browser
    // policy has no business refusing it.
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
    expect(allow(res)).toBeNull();
  });

  it('never sends allow-credentials', async () => {
    // Sessions are bearer tokens in memory, never cookies. Leaving this off
    // means an origin that reached the allowlist by mistake still cannot make
    // the browser attach a credential.
    expect((await get(CLIENT)).headers.get('access-control-allow-credentials')).toBeNull();
  });
});

describe('the preflight is answered before authentication', () => {
  /**
   * **The single most load-bearing test in this file.**
   *
   * A browser sends `OPTIONS` with no `Authorization` — it is asking permission
   * to send a credential, so it has not sent one. If `requireSession` sees the
   * preflight first it answers 401, the browser reports a CORS failure, and
   * every authenticated call in the game fails while the auth code is correct.
   */
  const preflight = (path: string) =>
    app.request(path, {
      method: 'OPTIONS',
      headers: {
        origin: CLIENT,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

  it('does not 401 a preflight on an authenticated route', async () => {
    const res = await preflight('/v1/squads/defense/visible');
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(300);
    expect(allow(res)).toBe(CLIENT);
  });

  it('permits the method and the two headers the client actually sends', async () => {
    const res = await preflight('/v1/squads/defense/visible');
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
    const headers = res.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
    expect(headers).toContain('authorization');
    expect(headers).toContain('content-type');
  });

  it('caches the preflight, which is a round trip before every round trip', async () => {
    expect((await preflight('/v1/health')).headers.get('access-control-max-age')).toBe('86400');
  });
});

describe('error responses carry the headers too', () => {
  it('lets the client read a 401 rather than seeing a CORS failure', async () => {
    // Without this the player is told "network error" when the truth is "sign
    // in again" — the client cannot read a response it is not allowed to read,
    // including the one explaining why.
    const res = await app.request('/v1/roster', { headers: { origin: CLIENT } });
    expect(res.status).toBe(401);
    expect(allow(res)).toBe(CLIENT);
  });

  it('lets the client read a 404 for the same reason', async () => {
    const res = await app.request('/v1/no-such-thing', { headers: { origin: CLIENT } });
    expect(res.status).toBe(404);
    expect(allow(res)).toBe(CLIENT);
  });
});
