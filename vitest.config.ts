import { defineConfig } from 'vitest/config';

/**
 * Root test configuration for the whole workspace.
 *
 * T005 in `specs/001-content-package/tasks.md` calls for `vitest.workspace.ts`.
 * That file was removed in Vitest 4 (installed here: 4.1.10) in favour of
 * `test.projects`, which is the same feature under a different name. The task's
 * intent — one runner, one command, every package discovered — is unchanged.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],

    /**
     * **`dist/` must never be collected**, and this is not hypothetical tidying.
     *
     * `tsc` emits every test file alongside the sources it compiles, so after a
     * single `pnpm build` there are two copies of every suite: the `.ts` source
     * and a `.js` twin under `dist/tests/`. Vitest's default include matches
     * both, so the suite silently doubles — and the compiled copies then *fail*,
     * because several tests read source files by relative path to assert things
     * the type system cannot (the purity gate, the entropy scan, the no-constant-2
     * scan) and those paths do not exist under `dist/`.
     *
     * The symptom is four failures that have nothing to do with the change in
     * front of you, appearing only on machines where a build has run — which is
     * every CI machine and no developer machine until the day it isn't.
     */
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
  },
});
