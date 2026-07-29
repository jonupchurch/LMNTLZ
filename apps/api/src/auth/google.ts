/**
 * Google sign-in, by **verifying an ID token** rather than exchanging a code.
 *
 * The browser obtains a signed JWT from Google Identity Services and posts it
 * here; we check the signature against Google's published keys. That is the
 * whole flow, and it means **this server holds no Google credential at all** —
 * no client secret, nothing to leak from the shipped desktop build, and nothing
 * to rotate. The authorization-code flow exists so a server can act on a user's
 * behalf at Google; we only ever need to know who they are.
 *
 * It also makes Steam identical in shape later: a provider hands the client a
 * credential, the client posts it, we verify it server-side. One code path.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  InvalidProviderTokenError,
  type IdentityProvider,
  type RejectionReason,
  type VerifiedIdentity,
} from './provider.js';

/** Google emits **both** spellings. Accepting only one rejects real users. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Real clocks disagree. Zero tolerance is an intermittent 401 nobody can reproduce. */
const CLOCK_SKEW_SECONDS = 60;

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * **Module-level, deliberately.** `createRemoteJWKSet` caches inside the object
 * it returns, so building one per request would fetch Google's keys on every
 * sign-in — latency on the critical path, and a rate limit waiting to happen.
 *
 * The two options are the whole reason this is not hand-rolled:
 *
 * - **`cacheMaxAge`** bounds staleness. Caching forever is a key-rotation
 *   problem: Google rotates, every sign-in starts failing, and nothing in our
 *   logs says why.
 * - **`cooldownDuration`** bounds refetching. Without it, a token bearing a
 *   *random* `kid` triggers a fetch — so an attacker sending forged tokens with
 *   fresh `kid`s turns this server into a fetch amplifier pointed at Google, and
 *   the first symptom is Google rate-limiting our real sign-ins.
 *
 * The cooldown is the security control; the max-age is the correctness one.
 */
const remoteJwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 30 * 60 * 1000,
});

export interface GoogleProviderOptions {
  readonly clientId: string;
  /** Injectable so tests can serve a local key set. Production uses the remote one. */
  readonly jwks?: JWTVerifyGetKey;
}

export function createGoogleProvider(options: GoogleProviderOptions): IdentityProvider {
  const { clientId, jwks = remoteJwks } = options;

  if (!clientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID is not set. Without it `aud` cannot be checked, and a ' +
        'token minted for any other Google app would be accepted as a sign-in here.',
    );
  }

  return {
    name: 'google',

    async verify(token: string): Promise<VerifiedIdentity> {
      if (typeof token !== 'string' || token.split('.').length !== 3) {
        throw new InvalidProviderTokenError('malformed');
      }

      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          // Everything below is checked BY the library, in one place, rather
          // than by us after the fact. A claim checked afterwards is a claim
          // somebody can forget to check.
          algorithms: ['RS256'], // never `none`, never a symmetric alg
          issuer: ISSUERS,
          audience: clientId, // exactly ours
          clockTolerance: CLOCK_SKEW_SECONDS,
        }));
      } catch (err) {
        throw new InvalidProviderTokenError(reasonFor(err), messageOf(err));
      }

      /**
       * **`iat` is checked here because `jose` does not check it.**
       *
       * `jwtVerify` validates `exp` and `nbf`; `iat` is informational under the
       * RFC and is only consulted if you pass `maxTokenAge`. So a token claiming
       * to be issued ten minutes from now sails straight through — which the
       * test caught, and which the claim table in research.md explicitly asks
       * for.
       *
       * Its value is modest and worth stating honestly: the signature check
       * already makes a forged `iat` impossible, so this cannot stop an
       * attacker. What it catches is a **badly skewed clock** — ours or a
       * provider's — surfacing as a named, greppable rejection rather than as
       * tokens that behave strangely for reasons nobody can reproduce.
       */
      const iat = payload.iat;
      if (typeof iat === 'number' && iat > Math.floor(Date.now() / 1000) + CLOCK_SKEW_SECONDS) {
        throw new InvalidProviderTokenError('iat', 'issued in the future');
      }

      // `sub` is the account key and must exist. A token without one is not
      // something to paper over with a fallback.
      const subject = payload.sub;
      if (typeof subject !== 'string' || subject.length === 0) {
        throw new InvalidProviderTokenError('sub');
      }

      const email = payload['email'];

      return {
        provider: 'google',
        subject,
        // **Contact only.** Never joined on, never used to find an account.
        email: typeof email === 'string' && email.length > 0 ? email : null,
      };
    },
  };
}

/**
 * Map `jose`'s error codes to our named reasons.
 *
 * The mapping exists so tests can assert *which* check failed. An
 * implementation that rejects every token for the wrong reason passes a suite
 * that only asserts "it threw", and that suite would also pass on an
 * implementation that rejected everything unconditionally.
 */
function reasonFor(err: unknown): RejectionReason {
  const code = (err as { code?: string }).code ?? '';
  const message = messageOf(err);

  if (code === 'ERR_JWT_EXPIRED') return 'exp';
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'signature';
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return 'signature';
  if (code === 'ERR_JOSE_ALG_NOT_ALLOWED') return 'alg';
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const claim = (err as { claim?: string }).claim;
    if (claim === 'aud') return 'aud';
    if (claim === 'iss') return 'iss';
    if (claim === 'iat' || claim === 'nbf') return 'iat';
    return 'malformed';
  }
  if (/alg/i.test(message)) return 'alg';
  return 'malformed';
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * The production instance, built from the environment on first use.
 *
 * Lazy rather than at import so that a test importing anything from this module
 * does not need `GOOGLE_CLIENT_ID` set.
 */
let cached: IdentityProvider | undefined;

export function googleProvider(): IdentityProvider {
  cached ??= createGoogleProvider({ clientId: process.env['GOOGLE_CLIENT_ID'] ?? '' });
  return cached;
}
