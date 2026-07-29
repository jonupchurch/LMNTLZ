/**
 * **A stolen client learns nothing useful** (SC-005, FR-016).
 *
 * The threat is not hypothetical and not exotic: the 1.0 client is a static
 * bundle served from a CDN, and later the same bundle ships inside a Steam
 * download. Anybody can read all of it. The only defence is that there is
 * nothing in it worth reading.
 *
 * This is why the whole auth design looks the way it does. Google is verified by
 * **ID token against a public JWKS** rather than by an authorization-code
 * exchange, precisely so there is no client secret to ship. Steam's publisher
 * key stays server-side. Our own signing key never leaves `apps/api`.
 *
 * Written before `apps/client` existed, to scan the API source and its
 * configuration and then **widen by itself** the day a bundle appeared. Feature
 * 006 built one on 2026-07-28 and the bundle scan below went from skipped to
 * green with no edit here — which was the design, and is the reason it was not
 * written as a `TODO` somebody had to come back for.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '../../../..');
const API_SRC = join(REPO, 'apps/api/src');
const CLIENT_DIST = join(REPO, 'apps/client/dist');

function filesUnder(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return filesUnder(full, exts);
    return exts.some((e) => full.endsWith(e)) ? [full] : [];
  });
}

/** Every secret this system has. If one is added, it belongs on this list. */
const SECRET_NAMES = [
  'JWT_SIGNING_KEY',
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'PGPASSWORD',
  'POSTGRES_PASSWORD',
  'STEAM_WEB_API_KEY',
  'PADDLE_API_KEY',
  'RESEND_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
] as const;

describe('no secret is ever hard-coded', () => {
  const sources = filesUnder(API_SRC, ['.ts']).map((path) => ({
    path: path.slice(REPO.length + 1).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }));

  it('scans a non-empty source tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('reads every secret from the environment, never from a literal', () => {
    // A secret in source is a secret in git, and this repository is public.
    for (const { path, text } of sources) {
      for (const name of SECRET_NAMES) {
        const assigned = new RegExp(`${name}\\s*=\\s*['"\`][^'"\`]+['"\`]`);
        expect(assigned.test(text), `${path} assigns a literal ${name}`).toBe(false);
      }
    }
  });

  it('has no connection string or private key anywhere in source', () => {
    const shapes: [string, RegExp][] = [
      ['a postgres connection string', /postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@/],
      ['a PEM private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['a Google client secret', /GOCSPX-[\w-]+/],
      ['a bearer literal', /Bearer\s+[A-Za-z0-9_-]{30,}/],
    ];

    for (const { path, text } of sources) {
      for (const [what, pattern] of shapes) {
        expect(pattern.test(text), `${path} contains ${what}`).toBe(false);
      }
    }
  });

  it('keeps the ONLY Google value a public client id, never a secret', () => {
    // The whole reason for the ID-token flow. `GOOGLE_CLIENT_ID` is public by
    // design — it is baked into every client that shows a sign-in button. A
    // client SECRET would be the thing that must never ship, and there is none
    // to ship because no code exchange happens.
    const joined = sources.map((s) => s.text).join('\n');
    expect(joined).toContain('GOOGLE_CLIENT_ID');
    expect(joined).not.toContain('GOOGLE_CLIENT_SECRET');
  });
});

describe('the client bundle', () => {
  // Feature 006 builds it. Until then there is nothing to scan, and this says
  // so out loud rather than passing silently and looking like coverage.
  const bundles = filesUnder(CLIENT_DIST, ['.js', '.mjs', '.css', '.html', '.map']);

  it.skipIf(bundles.length === 0)('contains no secret of any kind', () => {
    for (const path of bundles) {
      const text = readFileSync(path, 'utf8');
      for (const name of SECRET_NAMES) {
        expect(text, `${path} references ${name}`).not.toContain(name);
      }
      expect(/postgres(?:ql)?:\/\//.test(text), `${path} has a connection string`).toBe(false);
      expect(/GOCSPX-/.test(text), `${path} has a Google client secret`).toBe(false);
      expect(/steamworks/i.test(text), `${path} bundles steamworks.js`).toBe(false);
    }
  });

  it('records that the bundle scan is pending feature 006', () => {
    // Deliberately not `.skip` — a skipped test is invisible, and this is a
    // real gap somebody should see in the output until 006 closes it.
    expect(existsSync(CLIENT_DIST) ? 'client built' : 'awaiting feature 006').toBe(
      bundles.length > 0 ? 'client built' : 'awaiting feature 006',
    );
  });
});

describe('the documented secret list', () => {
  it('names every secret in .env.example, values excluded', () => {
    // `.env.example` is the only record of what a fresh machine needs. If a
    // secret is added to the code and not here, the next person to set up the
    // project discovers it as a runtime crash.
    const example = readFileSync(join(REPO, '.env.example'), 'utf8');

    for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'GOOGLE_CLIENT_ID', 'JWT_SIGNING_KEY']) {
      expect(example, `.env.example does not mention ${name}`).toContain(name);
    }

    // And it carries no values.
    expect(/postgres(?:ql)?:\/\/[^\s]*:[^\s@]+@/.test(example)).toBe(false);
    for (const line of example.split('\n')) {
      // `exec` returns the full match at index 0, so the value is group TWO.
      const [, name, value] = /^([A-Z_]+)=(.*)$/.exec(line) ?? [];
      if (value !== undefined) {
        expect(value.trim(), `${name} carries a value in .env.example`).toBe('');
      }
    }
  });
});
