/**
 * The shape that lets the API survive Vercel's build.
 *
 * ### The failure this exists to prevent, stated plainly
 *
 * On 2026-07-29 the deployed API was found to be a **feature-005 build**.
 * Feature 006's routes had never shipped: `/v1/roster` answered 404 in
 * production while passing every test locally. Every deploy since 006 had
 * failed, and nothing said so — because the only endpoint anyone checked was
 * `/v1/health`, which has existed in every build since the first commit and
 * therefore cannot distinguish one build from another.
 *
 * The cause was two facts meeting:
 *
 * 1. **Vercel compiles the API entrypoint by naming the file**, so TypeScript
 *    refuses to load `tsconfig.json` at all (TS5112) and runs with `strict`
 *    **off**.
 * 2. **The workspace packages exported raw `.ts`**, so that non-strict compile
 *    re-derived every type in `@lmntlz/content` from scratch — and **Zod v4's
 *    inference collapses to `unknown` without `strict`**. Five errors in
 *    `validate.ts` that exist under no other configuration.
 *
 * ### Why this test is structural rather than a compile
 *
 * Running the real non-strict compile takes ~30s, which is four times the whole
 * unit suite. It belongs in CI, and it is there. **What belongs here is the
 * cause**: a `types` entry pointing at a `.ts` file is the thing that lets a
 * consumer re-derive our types under options we do not control. That is one
 * `readFileSync` per package and it fails the moment somebody reintroduces it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/index.js';

const ROOT = join(import.meta.dirname, '../../../..');

const PACKAGES = ['packages/content', 'packages/sim', 'apps/api', 'apps/client'] as const;

interface Manifest {
  readonly name?: string;
  readonly types?: string;
  readonly exports?: Record<string, unknown>;
}

const manifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as Manifest;

/** Every `types` value reachable from a manifest, top-level or per-condition. */
function typeEntries(pkg: Manifest): string[] {
  const found: string[] = [];
  if (pkg.types) found.push(pkg.types);
  for (const target of Object.values(pkg.exports ?? {})) {
    if (target && typeof target === 'object' && 'types' in target) {
      const value = (target as { types?: unknown }).types;
      if (typeof value === 'string') found.push(value);
    }
  }
  return found;
}

/** Every value a *runtime* will actually try to load: `main`, and each
 *  non-`types` export condition. */
function runtimeEntries(pkg: Manifest & { main?: string }): string[] {
  const found: string[] = [];
  if (pkg.main) found.push(pkg.main);
  for (const target of Object.values(pkg.exports ?? {})) {
    if (typeof target === 'string') found.push(target);
    else if (target && typeof target === 'object') {
      for (const [condition, value] of Object.entries(target)) {
        if (condition !== 'types' && typeof value === 'string') found.push(value);
      }
    }
  }
  return found;
}

describe('no package hands its raw source to a consumer type-checker', () => {
  it.each(PACKAGES)('%s declares types as .d.ts, never .ts', (dir) => {
    for (const entry of typeEntries(manifest(dir))) {
      expect(entry, `${dir} → ${entry}`).toMatch(/\.d\.ts$/);
    }
  });

  /**
   * **Libraries only.** `apps/api`'s own `main` is `src/index.ts` and must stay
   * that way — it is not something another package imports, it is how Vercel's
   * Hono preset *finds the entrypoint to compile*. Pointing it at built JS would
   * be telling the platform there is nothing to build.
   */
  it.each(['packages/content', 'packages/sim'] as const)(
    '%s serves runtime entries as .js, never .ts',
    (dir) => {
    /**
     * **The other half, and it cost its own deploy.** Moving `types` to the
     * built `.d.ts` fixed the build and left `default` pointing at
     * `src/index.ts`, so the function compiled cleanly and then died on its
     * first request: Node cannot execute TypeScript, and the `.js` specifiers
     * inside the source resolve next to the `.ts` where nothing was emitted.
     *
     * `FUNCTION_INVOCATION_FAILED` rather than a build error — a *later* and
     * more expensive place to find out, because the deploy reports success.
     */
    for (const entry of runtimeEntries(manifest(dir))) {
      expect(entry, `${dir} → ${entry}`).not.toMatch(/\.tsx?$/);
    }
  });

  it.each(['packages/content', 'packages/sim'] as const)(
    '%s declares types for every export it offers',
    (dir) => {
      // A subpath with no `types` condition falls back to the runtime target,
      // which is the `.ts` again — so a missing condition is the same defect
      // as a wrong one, and silent.
      const pkg = manifest(dir);
      const targets = Object.entries(pkg.exports ?? {});
      expect(targets.length).toBeGreaterThan(0);
      for (const [subpath, target] of targets) {
        expect(target, `${dir} exports "${subpath}" as a bare string`).toBeTypeOf('object');
        expect(target).toHaveProperty('types');
      }
    },
  );
});

describe('the health check can tell two builds apart', () => {
  const before = process.env['VERCEL_GIT_COMMIT_SHA'];
  afterEach(() => {
    if (before === undefined) delete process.env['VERCEL_GIT_COMMIT_SHA'];
    else process.env['VERCEL_GIT_COMMIT_SHA'] = before;
  });

  it('reports the deployed commit', async () => {
    /**
     * The whole point. `{status: "ok"}` alone is the same answer in every build
     * ever made, so it cannot distinguish a current deployment from one two
     * features old — which is precisely how production served a feature-005
     * build through the whole of 006 without anybody noticing.
     */
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'abcdef1234567890';
    const body = (await (await app.request('/v1/health')).json()) as { commit: string };
    expect(body.commit).toBe('abcdef1');
  });

  it('says `dev` off-platform rather than pretending to be a deployment', async () => {
    delete process.env['VERCEL_GIT_COMMIT_SHA'];
    const body = (await (await app.request('/v1/health')).json()) as { commit: string };
    expect(body.commit).toBe('dev');
  });
});

describe('turbo declares every variable the deployment sets', () => {
  /**
   * Turborepo warns — loudly and on every build — about a variable set on a
   * Vercel project but absent from `turbo.json`. It is a cache-correctness
   * mechanism: an undeclared variable is not in the task hash, so a build can be
   * replayed from cache after that variable changed.
   *
   * The real cost is the training effect. The build that failed above printed
   * three such warnings immediately before the error that mattered, and a log
   * that always warns is a log nobody reads to the bottom of.
   */
  const turbo = readFileSync(join(ROOT, 'turbo.json'), 'utf8');
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');

  const declared = new Set([
    ...(JSON.parse(turbo.replace(/^\s*\/\/.*$/gm, '')) as { globalEnv: string[] }).globalEnv,
    ...(JSON.parse(turbo.replace(/^\s*\/\/.*$/gm, '')) as { globalPassThroughEnv: string[] })
      .globalPassThroughEnv,
  ]);

  const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);

  it('documents at least one variable to check', () => {
    expect(documented.length).toBeGreaterThan(0);
  });

  it.each(documented)('%s is declared in turbo.json', (name) => {
    expect(declared.has(name)).toBe(true);
  });
});
