/**
 * **No `fetch` result may be read as the ambient `Response`.**
 *
 * ### TL;DR for someone with no context
 *
 * The API compiles cleanly on this machine and *differently* on Vercel. One
 * specific thing breaks that way: reading `.ok` or `.status` off whatever `fetch`
 * returns. Locally the type has them; in Vercel's build it does not, the build
 * fails, and **production keeps serving the previous version with nothing to
 * indicate anything is wrong**. This test is the local stand-in for that build.
 *
 * ### Why a scan and not a typecheck
 *
 * Because the typecheck is the thing that disagrees. `pnpm typecheck` uses
 * `apps/api/tsconfig.json`; Vercel compiles the entrypoint by naming files on the
 * command line, which makes TypeScript **ignore `tsconfig.json` entirely**
 * (TS5112) — so `types: ["node"]` never applies there. No local invocation of
 * `tsc` reproduces it, so the guard has to be about *what the source says*.
 *
 * ### The cost of not having had this
 *
 * | When | Cost |
 * |---|---|
 * | 008 `replays/storage.ts` | five failed Vercel builds before anyone read a build log |
 * | 011 `payments/vendor/mailer.ts` | **`c3ec06c` never deployed at all**, and the session that wrote it reported it live |
 *
 * The second is the one this exists to prevent. The fix had already been found
 * and written down — inside `replays/`, where the next feature never looked.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sources(full)));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Comments are stripped: this rule is about code, and the prose explains the ban. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('every fetch call is cast to FetchResponse', () => {
  it('finds sources to scan at all', async () => {
    expect((await sources(SRC)).length).toBeGreaterThan(30);
  });

  it('no source reads a fetch result without the cast', async () => {
    const offenders: string[] = [];

    for (const file of await sources(SRC)) {
      const raw = await readFile(file, 'utf8');
      const code = strip(raw);

      // The strip must not have eaten the file, or this passes vacuously.
      if (raw.length > 400) {
        expect(
          code.length,
          `comment stripping removed almost all of ${relative(SRC, file)}`,
        ).toBeGreaterThan(60);
      }

      /**
       * Every `await fetch(` in the file must be followed, before the next
       * statement boundary we can cheaply find, by the cast. Rather than parse,
       * this takes the 600 characters after each call — comfortably past the
       * longest request literal in this codebase — and requires the cast inside.
       */
      for (const match of code.matchAll(/await\s+fetch\s*\(/g)) {
        const window = code.slice(match.index, match.index + 600);
        if (!/as\s+unknown\s+as\s+FetchResponse/.test(window)) {
          offenders.push(relative(SRC, file).replaceAll('\\', '/'));
        }
      }
    }

    expect(
      offenders,
      `These read a fetch result as the ambient Response, which typechecks here ` +
        `and FAILS the Vercel build — leaving production on the previous ` +
        `deploy with no signal. Cast to FetchResponse from src/types/fetch.ts.`,
    ).toEqual([]);
  });

  it('the shared type is where features can find it, not inside one of them', async () => {
    const shared = await readFile(new URL('../../src/types/fetch.ts', import.meta.url), 'utf8');

    expect(shared).toContain('export interface FetchResponse');
    for (const member of ['status', 'ok', 'statusText', 'text']) {
      expect(shared).toContain(member);
    }
  });
});
