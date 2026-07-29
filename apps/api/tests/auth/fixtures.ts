/**
 * A fake Google.
 *
 * **Every one of these tests mints a real, correctly-signed JWT** and then
 * breaks exactly one thing about it. That matters: the failure mode this whole
 * module guards against is an implementation that *parses* a token instead of
 * *verifying* it, and such an implementation accepts every malformed token you
 * could hand it while passing any test that only ever sends good ones.
 *
 * So the fixtures are a real RSA keypair, a real JWKS, and real signatures.
 * Nothing is mocked except the network.
 */

import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

export const CLIENT_ID = '1234567890-testclient.apps.googleusercontent.com';
export const GOOGLE_ISS = 'https://accounts.google.com';

/** Google emits both forms, and code that accepts only one rejects real users. */
export const GOOGLE_ISS_BARE = 'accounts.google.com';

export interface FakeGoogle {
  readonly jwks: { keys: JWK[] };
  readonly kid: string;
  /** Mint a token. Every field defaults to valid; override one to break it. */
  sign(claims?: Partial<TokenClaims>, options?: SignOptions): Promise<string>;
  /** A second key that is NOT in the published JWKS — a forged signature. */
  signWithUnknownKey(claims?: Partial<TokenClaims>): Promise<string>;
  /**
   * A **legitimate** key Google has not published yet.
   *
   * Distinct from `signWithUnknownKey`, and the distinction is the whole point:
   * that one is a forgery and must *never* be accepted, this one is a real
   * rotation and must be accepted the moment the key set catches up. Both look
   * identical to the verifier at first contact — an unknown `kid` — so the only
   * thing that tells them apart is whether the key later appears in the JWKS.
   */
  rotateKey(kid?: string): Promise<RotatedKey>;
}

export interface RotatedKey {
  readonly kid: string;
  /** Publish it by pushing this into `google.jwks.keys`; the fetch stub serves the live object. */
  readonly jwk: JWK;
  sign(claims?: Partial<TokenClaims>, options?: SignOptions): Promise<string>;
}

export interface TokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

export interface SignOptions {
  /** Seconds from now. Negative for an expired token. */
  expiresIn?: number;
  /** Seconds from now. Positive for a token issued in the future. */
  issuedAtOffset?: number;
  alg?: string;
  kid?: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function fakeGoogle(): Promise<FakeGoogle> {
  const kid = 'test-key-1';
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);

  // A key Google never published. Signatures from it must fail.
  const rogue = await generateKeyPair('RS256', { extractable: true });

  const defaults = (): TokenClaims => ({
    iss: GOOGLE_ISS,
    aud: CLIENT_ID,
    sub: '110169484474386276334',
    email: 'player@example.com',
    email_verified: true,
    name: 'Reyna Two-Rivers',
  });

  const build = (claims: Partial<TokenClaims>, options: SignOptions) => {
    const now = nowSeconds();
    return new SignJWT({ ...defaults(), ...claims } as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: options.kid ?? kid })
      .setIssuedAt(now + (options.issuedAtOffset ?? 0))
      .setExpirationTime(now + (options.expiresIn ?? 3600));
  };

  return {
    jwks: { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] },
    kid,
    sign: (claims = {}, options = {}) => build(claims, options).sign(privateKey),
    signWithUnknownKey: (claims = {}) =>
      build(claims, { kid: 'not-published' }).sign(rogue.privateKey),
    rotateKey: async (nextKid = 'test-key-2') => {
      const next = await generateKeyPair('RS256', { extractable: true });
      const jwk: JWK = {
        ...(await exportJWK(next.publicKey)),
        kid: nextKid,
        alg: 'RS256',
        use: 'sig',
      };
      return {
        kid: nextKid,
        jwk,
        sign: (claims = {}, options = {}) =>
          build(claims, { ...options, kid: nextKid }).sign(next.privateKey),
      };
    },
  };
}

/**
 * An `alg: none` token — no signature at all.
 *
 * Built by hand rather than with `jose`, which refuses to produce one. That
 * refusal is the point: the attack is not that a library will sign this, it is
 * that a *verifier* which trusts the header's `alg` will accept it.
 */
export function unsignedToken(claims: Partial<TokenClaims> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = nowSeconds();
  return [
    b64({ alg: 'none', typ: 'JWT' }),
    b64({
      iss: GOOGLE_ISS,
      aud: CLIENT_ID,
      sub: '110169484474386276334',
      iat: now,
      exp: now + 3600,
      ...claims,
    }),
    '',
  ].join('.');
}

/**
 * Replace `globalThis.fetch` with a counting stub that serves one JWKS.
 *
 * The count is the whole point of `jwks.test.ts`: caching too little is a
 * latency and rate-limit problem, caching forever is a key-rotation problem, and
 * neither is visible from the outside without counting.
 */
export function stubJwksFetch(jwks: { keys: JWK[] }): {
  restore(): void;
  get calls(): number;
} {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = original;
    },
    get calls() {
      return calls;
    },
  };
}
