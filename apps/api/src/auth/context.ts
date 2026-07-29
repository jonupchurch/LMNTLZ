/**
 * **The single convention fifteen other features depend on.**
 *
 * > `accountId` comes from the verified session and **never** from a request
 * > body, path parameter or query string.
 *
 * This is the whole of authorization in this project, and its violation is
 * invisible in review. `PUT /v1/me/username` reading `body.accountId` looks
 * exactly like `PUT /v1/me/username` reading `context.accountId` — the diff is
 * one word, the tests pass either way, and the first version lets anybody rename
 * anybody. There is no clever runtime check that catches it, so the defence is
 * structural and mechanical:
 *
 * 1. **The context type carries `accountId`**, so the correct source is always
 *    the nearest one to hand.
 * 2. **A route acting on somebody else's account takes a differently-named
 *    parameter** — `targetId`, never `accountId`. The scout view and the public
 *    profile legitimately name another player; giving that a distinct name means
 *    the two can never be confused at a glance, and `targetId` at a call site is
 *    a visible claim that the route intends it.
 * 3. **`convention.test.ts` greps for the violation** and fails the build.
 *
 * Rule 3 is what makes rules 1 and 2 hold a year from now.
 */

import type { Context } from 'hono';

/** What a verified session establishes. Nothing here is client-supplied. */
export interface RequestContext {
  /** **The authenticated player.** Immutable, internal, from the token. */
  readonly accountId: string;
  /**
   * The session this request arrived on — one per sign-in, and the same value
   * as the renewal-token family. Revoking a session is revoking a family, so
   * carrying it here is what lets "sign out this device" mean anything.
   */
  readonly sessionId: string;
}

/**
 * A player other than the caller.
 *
 * A distinct branded type rather than a bare `string`, so that passing a
 * `targetId` where an `accountId` belongs is a **compile error** rather than a
 * privilege escalation. The two are both UUIDs and are otherwise
 * indistinguishable, which is exactly the problem.
 */
export type TargetId = string & { readonly __brand: 'TargetId' };

export const asTargetId = (id: string): TargetId => id as TargetId;

/** Hono's variable map, so `c.get('ctx')` is typed rather than `any`. */
export interface AuthedEnv {
  Variables: {
    ctx: RequestContext;
  };
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('This route requires a verified session.');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Read the verified context, or throw.
 *
 * **Throws rather than returning `undefined`** so an unauthenticated request
 * cannot fall through to a handler that treats a missing account as anonymous
 * and does something reasonable-looking. On an authenticated route there is no
 * sensible behaviour for "no account"; there is only a bug.
 */
export function requireContext(c: Context<AuthedEnv>): RequestContext {
  const ctx = c.get('ctx');
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}
