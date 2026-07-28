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
  },
});
