/**
 * Vercel Web Analytics — page views only, and only from a web build.
 *
 * `../../../docs/tech-stack.md` decided this on 2026-07-28 and it is narrower
 * than it sounds. **Game telemetry is not product analytics**: every balance
 * question is a battle question and `battle_records` answers it in SQL at full
 * fidelity, so no vendor is involved in any of that. What SQL cannot see is the
 * visitor who never signed up, and that — the pre-signup funnel — is the whole
 * job of this file.
 *
 * ### Two guards, for two different reasons
 *
 * **`import.meta.env.PROD`** keeps it out of dev servers and out of jsdom. A
 * development-mode `<Analytics/>` loads a debug script and logs on every mount,
 * which would be noise in a dozen component tests for no signal at all.
 *
 * **The protocol check is the Steam seam**, and it is the one worth writing down.
 * `vite.config.ts` sets `base: './'` because the Steam build ships this same
 * bundle to be loaded off disk — but the analytics beacon is an *absolute* path
 * on the deployment origin, and `file://` has no such origin. Left ungated, the
 * desktop build would fire a request at nothing on every launch and report zero
 * for the audience that actually bought the game. There is no Electron at 1.0
 * (`CLAUDE.md`, *Tech stack*), so this guard is unreachable today and that is
 * exactly when it is cheap to add.
 *
 * ### What it must never send
 *
 * The privacy policy promises the game sets no cookies. Vercel Web Analytics
 * keeps that true — it identifies visitors by a hash of the request, server
 * side, and discards it after 24 hours — but *the URL is collected verbatim,
 * query string included*, and that is ours to control. Hence `scrubEvent`.
 */

import type { BeforeSendEvent } from '@vercel/analytics';

/**
 * Whether a page served from `protocol` can reach the analytics endpoint.
 *
 * Takes the protocol rather than reading `location` so it is a function of its
 * argument and can be tested for `file:` without a browser that serves one.
 */
export function isWebOrigin(protocol: string): boolean {
  return protocol === 'https:' || protocol === 'http:';
}

/** Whether to mount `<Analytics/>` at all. See the two guards above. */
export function analyticsEnabled(): boolean {
  return import.meta.env.PROD && isWebOrigin(globalThis.location?.protocol ?? '');
}

/**
 * Strip the query string from every reported URL.
 *
 * **This drops everything rather than filtering known-bad names**, which is the
 * choice worth defending: LMNTLZ uses no query parameters at all today, so
 * nothing legitimate is lost, and the ones on the way are credentials — Steam's
 * OpenID return carries a signed `openid.sig`, and an OAuth redirect carries a
 * `code` that is a one-time key to an account. A blocklist of parameter names
 * would have to be extended by whoever adds the next one, and the failure mode
 * of forgetting is a bearer token in a third party's dashboard.
 *
 * The path is kept, because the path is the entire point.
 *
 * Returns the event so `beforeSend` can also refuse one by returning `null`
 * later without changing the call site.
 */
export function scrubEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const marker = event.url.search(/[?#]/);
  if (marker === -1) return event;

  return { ...event, url: event.url.slice(0, marker) };
}
