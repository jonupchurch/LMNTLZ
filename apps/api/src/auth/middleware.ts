/**
 * The middleware that turns a bearer token into a `RequestContext`.
 *
 * **A suspended account is refused even when it presents a perfectly valid
 * token** (FR-015, T025). That is not belt-and-braces: session tokens are
 * stateless and cannot be un-issued, so a player banned thirty seconds ago is
 * still holding a token that verifies for up to fifteen minutes. Checking the
 * signature and stopping there means a ban does not take effect until the token
 * expires — and the fifteen minutes after a ban are exactly the minutes somebody
 * spends doing whatever got them banned.
 *
 * The cost is one indexed lookup per authenticated request. That is the price of
 * a ban meaning something immediately, and it is worth it.
 */

import { jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { apiError } from '../errors.js';
import { accountById, assertNotBanned, BannedAccountError } from './accounts.js';
import type { AuthedEnv } from './context.js';

const signingKey = (): Uint8Array => {
  const key = process.env['JWT_SIGNING_KEY'];
  if (!key) throw new Error('JWT_SIGNING_KEY is not set.');
  return new TextEncoder().encode(key);
};

/**
 * Extract a bearer token. **Case-insensitive on the scheme**, because clients
 * send `bearer` and `Bearer` and rejecting one produces a 401 that looks like
 * a credential problem rather than a formatting one.
 */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export const requireSession: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const token = bearerFrom(c.req.header('authorization'));
  if (!token) {
    return c.json(apiError('unauthenticated', 'This endpoint requires a session token.'), 401);
  }

  let accountId: string;
  let sessionId: string;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'], // pinned; never trust the header's `alg`
      issuer: 'lmntlz',
      audience: 'lmntlz-client',
    });
    if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') {
      return c.json(apiError('unauthenticated', 'The session token is not valid.'), 401);
    }
    accountId = payload.sub;
    sessionId = payload['sid'];
  } catch {
    // One message for every failure. Telling a caller that the signature was
    // fine but the token had expired is an oracle, and it helps nobody honest.
    return c.json(apiError('unauthenticated', 'The session token is not valid.'), 401);
  }

  const account = await accountById(accountId);
  if (!account) {
    // The account was deleted while a token was live. Not an error condition to
    // explain — the token simply no longer refers to anything.
    return c.json(apiError('unauthenticated', 'The session token is not valid.'), 401);
  }

  try {
    assertNotBanned(account);
  } catch (err) {
    if (err instanceof BannedAccountError) {
      return c.json(
        {
          ...apiError('account_suspended', 'This account is suspended.'),
          scope: err.scope,
          until: err.until.toISOString(),
        },
        403,
      );
    }
    throw err;
  }

  c.set('ctx', { accountId, sessionId });
  await next();
};
