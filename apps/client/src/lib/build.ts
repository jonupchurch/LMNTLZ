/**
 * Which build this bundle is.
 *
 * ### Why a user-visible stamp earns its seven characters
 *
 * *"Is it actually deployed?"* has cost this project real time three separate
 * times: twice a deploy was reported green that had never happened, and once
 * the new code was verifiably live at the CDN while the browser in front of us
 * showed the previous build for half an hour. **Nothing on the screen could
 * tell those apart**, so both were diagnosed by argument instead of evidence.
 *
 * A hash in the corner ends it in a glance: if it does not match `git log -1`,
 * the page is stale. Full stop, no further debate.
 *
 * `VERCEL_GIT_COMMIT_SHA` is injected by Vercel on every build and turned into
 * a literal by `vite.config.ts`'s `define`. A local build has no commit to
 * name — it is whatever is on disk — so it says `dev`, which is the honest
 * answer rather than a stale hash pretending to be current.
 */

declare const __BUILD_SHA__: string;

export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev';
