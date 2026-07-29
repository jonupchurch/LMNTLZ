/**
 * **Constitution XIX's seam**: identity is provider-agnostic, and `jose` is one
 * implementation detail behind this interface rather than a thing the rest of
 * the codebase knows about.
 *
 * The payoff is concrete and testable — SC-003 greps every route outside
 * `src/auth/` for any read of `provider` and requires zero matches. Adding Steam
 * at 1.1 means writing one more `IdentityProvider` and inserting one more row.
 * It changes nothing else, anywhere.
 */

export const PROVIDERS = ['google', 'steam'] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * What a provider can tell us, and deliberately nothing more.
 *
 * No display name, no avatar, no locale. Everything a provider offers beyond
 * identity is a thing somebody will be tempted to display, and then the game
 * shows a Google profile photo it does not control and cannot moderate.
 */
export interface VerifiedIdentity {
  readonly provider: Provider;
  /**
   * The provider's stable subject — Google's `sub`, Steam's 64-bit id.
   * **This is the account key.** Never the email.
   */
  readonly subject: string;
  /** Contact only, and allowed to be absent. Steam supplies none. */
  readonly email: string | null;
}

/**
 * Why a token was refused.
 *
 * Named reasons rather than a boolean because **the tests assert on them** — a
 * test that only knows "it threw" cannot tell a signature check from an
 * expiry check, and an implementation that rejects every token for the wrong
 * reason passes it.
 *
 * The reason is for logs and tests. **It is never returned to the caller**: a
 * client learning that its `aud` was wrong but its signature was fine is a
 * client being handed an oracle.
 */
export type RejectionReason =
  | 'malformed'
  | 'signature'
  | 'alg'
  | 'iss'
  | 'aud'
  | 'exp'
  | 'iat'
  | 'sub';

export class InvalidProviderTokenError extends Error {
  readonly reason: RejectionReason;

  constructor(reason: RejectionReason, detail?: string) {
    super(`provider token rejected: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'InvalidProviderTokenError';
    this.reason = reason;
  }
}

export interface IdentityProvider {
  readonly name: Provider;
  /**
   * **Verifies.** Throws `InvalidProviderTokenError` on anything less than a
   * fully valid token.
   *
   * There is no `{ ok: false }` return and no nullable subject, because those
   * shapes let a caller forget to check and carry on with `undefined` as an
   * account key. The only way past this function is a token that verified.
   */
  verify(token: string): Promise<VerifiedIdentity>;
}
