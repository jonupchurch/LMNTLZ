/**
 * `/v1/auth/*` and `/v1/me`.
 *
 * **Every status in the contract's table is produced here deliberately**, and
 * the distinctions matter more than they look:
 *
 * - `400` is *malformed* — no token, wrong type, not three segments. It says
 *   "your request is wrong".
 * - `401` is *unverified* — a real-looking token that failed a check. It says
 *   "your credential is wrong", and it says **nothing about which check**, because
 *   a caller that learns its `aud` was wrong while its signature was fine has
 *   been handed an oracle.
 * - `403` is *banned*, and it is the one that carries detail, because the player
 *   needs to know the scope and when it lifts.
 */

import { Hono, type Context } from 'hono';
import { apiError } from '../errors.js';
import { providerFor } from './providers.js';
import { InvalidProviderTokenError } from './provider.js';
import { SteamNotImplementedError } from './steam.js';
import { assertNotBanned, accountView, BannedAccountError, resolveAccount } from './accounts.js';
import { issuePair, renewPair, revokeFamily, TokenRejectedError } from './tokens.js';
import { linkIdentity, LinkRejectedError, unlinkIdentity } from './link.js';
import { PROVIDERS, type Provider } from './provider.js';
import { requireContext, type AuthedEnv } from './context.js';
import { requireSession } from './middleware.js';
import { RenameRejectedError } from './rename.js';
import { renameWithCharge } from '../profiles/identity.js';
import { noteSignedIn } from '../guilds/succession.js';
import { systemClock } from '../guilds/clock.js';

export const authRoutes = new Hono<AuthedEnv>();

/** The body shape both token endpoints share, minus `isNewAccount`. */
const pairBody = (
  pair: Awaited<ReturnType<typeof issuePair>>,
  account: { id: string; username: string; createdAt: Date },
) => ({
  session: {
    token: pair.accessToken,
    expiresAt: new Date(Date.now() + pair.expiresIn * 1000).toISOString(),
  },
  renewal: { token: pair.renewalToken },
  account: {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt.toISOString(),
  },
});

/**
 * Parse a JSON body, or `null`.
 *
 * **Returns `null` rather than throwing** so a malformed body becomes a 400 the
 * route writes itself, not a 500 from the global handler. A client sending
 * broken JSON has made a client error, and telling them it was a server error
 * sends them looking in the wrong place.
 */
async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await c.req.json();
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /v1/auth/google
// ---------------------------------------------------------------------------

authRoutes.post('/auth/google', async (c) => {
  const body = await jsonBody(c);
  const idToken = body?.['idToken'];

  if (typeof idToken !== 'string' || idToken.length === 0) {
    return c.json(apiError('malformed_request', 'An `idToken` is required.'), 400);
  }

  try {
    const identity = await providerFor('google').verify(idToken);
    const { account, isNewAccount } = await resolveAccount(identity);
    assertNotBanned(account);

    const pair = await issuePair(account.id);

    /**
     * **Presence is the reply** (013 FR-022 · T065).
     *
     * A pending succession against this account lapses the moment they sign in.
     * It has to be called *here*, in the auth path, and not from a guilds route:
     * an absent master hits no guilds route **by definition**, so a lapse written
     * only inside `succession.ts` would be a function the one person it protects
     * never triggers — and they would lose their guild by logging in.
     *
     * That is also why the email carries no link: there is nothing to click, so
     * there is nothing to phish.
     */
    await noteSignedIn(account.id, systemClock);

    return c.json({ ...pairBody(pair, account), isNewAccount }, 200);
  } catch (err) {
    if (err instanceof InvalidProviderTokenError) {
      // `err.reason` names the failed check and goes to the log, not the wire.
      console.warn(`[auth] google token rejected: ${err.reason}`);
      return c.json(apiError('unauthenticated', 'The sign-in token is not valid.'), 401);
    }
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
});

// ---------------------------------------------------------------------------
// POST /v1/auth/steam — the seam, built and dormant
// ---------------------------------------------------------------------------

authRoutes.post('/auth/steam', (c) =>
  c.json(
    apiError(
      'not_implemented',
      'Steam sign-in is not available yet. The route exists so that adding it ' +
        'later changes nothing outside this feature.',
    ),
    501,
  ),
);

// ---------------------------------------------------------------------------
// POST /v1/auth/renew
// ---------------------------------------------------------------------------

authRoutes.post('/auth/renew', async (c) => {
  const body = await jsonBody(c);
  const renewal = body?.['renewal'];

  if (typeof renewal !== 'string' || renewal.length === 0) {
    return c.json(apiError('malformed_request', 'A `renewal` token is required.'), 400);
  }

  try {
    const pair = await renewPair(renewal);
    const account = await accountView(pairAccountId(pair.accessToken));
    return c.json(
      {
        session: {
          token: pair.accessToken,
          expiresAt: new Date(Date.now() + pair.expiresIn * 1000).toISOString(),
        },
        renewal: { token: pair.renewalToken },
        account: {
          id: account.id,
          username: account.username,
          createdAt: account.createdAt,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof TokenRejectedError) {
      console.warn(`[auth] renewal rejected: ${err.reason}`);
      return c.json(apiError('unauthenticated', 'The renewal token is not valid.'), 401);
    }
    throw err;
  }
});

/**
 * Read the subject out of a token we just signed ourselves.
 *
 * Decoding without verifying is normally the cardinal sin of this module. It is
 * safe **only** because this token did not come from a caller — it was produced
 * three lines ago by `renewPair`, from a key only this server holds. Anything
 * arriving over the wire goes through `jwtVerify`, always.
 */
function pairAccountId(accessToken: string): string {
  const [, payload] = accessToken.split('.');
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')).sub as string;
}

// ---------------------------------------------------------------------------
// POST /v1/auth/revoke
// ---------------------------------------------------------------------------

authRoutes.post('/auth/revoke', async (c) => {
  const body = await jsonBody(c);
  const renewal = body?.['renewal'];

  if (typeof renewal !== 'string' || renewal.length === 0) {
    return c.json(apiError('malformed_request', 'A `renewal` token is required.'), 400);
  }

  // Idempotent, and silent about tokens it does not recognise — a 404 here
  // would let anybody probe which tokens are real.
  await revokeFamily(renewal);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /v1/auth/link — attach a second provider to THIS account
// ---------------------------------------------------------------------------

authRoutes.post('/auth/link', requireSession, async (c) => {
  // **The account comes from the session, never from the body** — see
  // `context.ts`. A link endpoint that took an account id would let anybody
  // attach their own Google identity to somebody else's account, which is the
  // most direct account takeover in the whole API.
  const { accountId } = requireContext(c);
  const body = await jsonBody(c);
  const provider = body?.['provider'];
  const token = body?.['token'];

  if (
    typeof provider !== 'string' ||
    !PROVIDERS.includes(provider as Provider) ||
    typeof token !== 'string' ||
    token.length === 0
  ) {
    return c.json(apiError('malformed_request', 'A `provider` and a `token` are required.'), 400);
  }

  try {
    const identity = await providerFor(provider as Provider).verify(token);
    await linkIdentity(accountId, identity);
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof LinkRejectedError) {
      return c.json({ ...apiError(err.reason, err.message) }, 409);
    }
    if (err instanceof InvalidProviderTokenError) {
      console.warn(`[auth] link token rejected: ${err.reason}`);
      return c.json(apiError('unauthenticated', 'That sign-in token is not valid.'), 401);
    }
    if (err instanceof SteamNotImplementedError) {
      return c.json(apiError('not_implemented', 'Steam sign-in is not available yet.'), 501);
    }
    throw err;
  }
});

authRoutes.delete('/auth/link/:provider', requireSession, async (c) => {
  const { accountId } = requireContext(c);
  const provider = c.req.param('provider');

  if (!PROVIDERS.includes(provider as Provider)) {
    return c.json(apiError('malformed_request', 'Unknown provider.'), 400);
  }

  try {
    await unlinkIdentity(accountId, provider as Provider);
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof LinkRejectedError) {
      return c.json({ ...apiError(err.reason, err.message) }, 409);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// GET /v1/me
// ---------------------------------------------------------------------------

authRoutes.get('/me', requireSession, async (c) => {
  const { accountId } = requireContext(c);
  return c.json(await accountView(accountId), 200);
});

// ---------------------------------------------------------------------------
// PUT /v1/me/username
// ---------------------------------------------------------------------------

authRoutes.put('/me/username', requireSession, async (c) => {
  // `/me`, not `/accounts/:id`. The route shape itself carries the convention:
  // there is no path parameter here that could name somebody else.
  const { accountId } = requireContext(c);
  const body = await jsonBody(c);
  const username = body?.['username'];

  if (typeof username !== 'string') {
    return c.json(apiError('malformed_request', 'A `username` is required.'), 400);
  }

  try {
    /**
     * **`renameWithCharge`, not `renameAccount`** (012 T026, FR-011).
     *
     * `renameAccount` computes the 325-shard cost and reports it, and takes an
     * `options.shardsAvailable` to check affordability against. This route used
     * to call it with **no options at all**, so the check ran against
     * `undefined` and never fired, and nothing anywhere debited the ledger. The
     * response said `shardsCharged: 325` while the balance did not move.
     *
     * Feature 012 owns the price, so 012 supplies the caller. The auth module is
     * unchanged — it still knows nothing about shards beyond the number.
     */
    const result = await renameWithCharge(accountId, username);
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof RenameRejectedError) {
      return c.json(
        {
          ...apiError(err.code, err.message),
          // **Which rule matched**, on a 409 only. "Taken" tells a player
          // nothing; "that reads the same as an existing name" tells them their
          // Cyrillic `е` is doing something they cannot see by looking.
          ...(err.rule ? { rule: err.rule } : {}),
        },
        err.status,
      );
    }
    throw err;
  }
});
