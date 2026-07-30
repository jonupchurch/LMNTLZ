/**
 * The shape of a `fetch` response, **declared rather than imported**.
 *
 * ### TL;DR
 *
 * Anything in `apps/api` that calls `fetch` must read this type, not the ambient
 * `Response`. Two features have now failed to deploy because of the ambient one,
 * and both failures were invisible locally.
 *
 * ### Why the ambient `Response` cannot be trusted here
 *
 * This app sets `lib: ["ES2022"]` with no `DOM`, so `Response` comes from
 * whatever `@types/node` resolves to. **Vercel compiles this app's entrypoint by
 * naming files on the command line, which makes TypeScript ignore
 * `tsconfig.json` entirely (TS5112)** — so `types: ["node"]` does not apply
 * there, a different `Response` is in scope, and `.ok` / `.status` do not exist
 * on it.
 *
 * The result is the worst shape of failure this repo has: **`pnpm typecheck` is
 * green, the Vercel build is red, and production goes on answering `/v1/health`
 * from the last build that worked.** It is the same class of problem the
 * `strictNullChecks` note in `apps/api/tsconfig.json` records.
 *
 * ### The history, so nobody re-solves it a third time
 *
 * | When | Where | Cost |
 * |---|---|---|
 * | 008 | `replays/storage.ts` | found and fixed with a local interface |
 * | 011 | `payments/vendor/mailer.ts` | **the same bug, because the precedent lived inside `replays/` and nobody looked** — `c3ec06c` never deployed, and a whole session reported it as live |
 *
 * That is why this now lives in `types/` rather than inside one feature: a
 * convention filed under someone else's module is a convention the next feature
 * does not find.
 *
 * ### Rejected alternatives
 *
 * - **Adding `"DOM"` to `lib`.** Would fix it, and puts `window` and `document`
 *   in scope for a server-only app — so a genuine mistake would start
 *   typechecking.
 * - **Chasing Vercel's build environment.** Not observable from here. Depending
 *   on the runtime shape cannot break this way again regardless of which
 *   `Response` is in scope, and the members below are guaranteed by the Fetch
 *   standard.
 *
 * ### ⚠️ It cannot be reproduced locally. Attempted 2026-07-30 and it failed.
 *
 * The obvious repro is to imitate Vercel by naming the entrypoint on the command
 * line: `tsc --noEmit --skipLibCheck --ignoreConfig src/index.ts`. **With the bug
 * deliberately planted back, that command reports zero errors** — so the
 * difference is not the missing `tsconfig.json`, it is whichever `@types/node`
 * Vercel's install resolves, and that is not visible from here.
 *
 * **So there is no local gate that reproduces the compiler.** What exists instead
 * is `tests/platform/ambientFetch.test.ts`, which scans the source for the shape
 * rather than trying to typecheck it, and which has been watched failing on a
 * planted violation. Treat a green local typecheck as **no evidence at all**
 * about this specific class of error, and confirm the deploy commit through
 * `/v1/health` before calling anything shipped.
 */
export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly statusText: string;
  text(): Promise<string>;
}
