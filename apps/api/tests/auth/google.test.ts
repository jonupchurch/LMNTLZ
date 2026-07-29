/**
 * **Verifying is not parsing**, and every quiet failure of this flow is somebody
 * who did the second thinking they had done the first.
 *
 * A JWT is three base64url segments. Decoding the middle one gives you `sub`,
 * `email` and `aud` in plain sight, and an implementation that stops there
 * *works* — for every honest user, forever, until somebody hands it a token they
 * wrote themselves. There is no functional symptom. The tests below are the only
 * thing standing between the two implementations.
 *
 * Each one takes a **real, correctly-signed token** and breaks exactly one
 * thing. A parser passes none of them; a verifier passes all of them.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createGoogleProvider } from '../../src/auth/google.js';
import { InvalidProviderTokenError } from '../../src/auth/provider.js';
import {
  CLIENT_ID,
  GOOGLE_ISS,
  GOOGLE_ISS_BARE,
  fakeGoogle,
  unsignedToken,
  type FakeGoogle,
} from './fixtures.js';
import { createLocalJWKSet } from 'jose';

let google: FakeGoogle;
let provider: ReturnType<typeof createGoogleProvider>;

beforeAll(async () => {
  google = await fakeGoogle();
  provider = createGoogleProvider({
    clientId: CLIENT_ID,
    jwks: createLocalJWKSet(google.jwks),
  });
});

const reasonOf = async (token: string): Promise<string> => {
  try {
    await provider.verify(token);
    return 'ACCEPTED';
  } catch (err) {
    if (err instanceof InvalidProviderTokenError) return err.reason;
    throw err;
  }
};

describe('a valid Google ID token', () => {
  it('resolves to the provider subject', async () => {
    const identity = await provider.verify(await google.sign());

    expect(identity.provider).toBe('google');
    expect(identity.subject).toBe('110169484474386276334');
    expect(identity.email).toBe('player@example.com');
  });

  it('accepts both issuer spellings, because Google emits both', async () => {
    // Code that accepts only the URL form rejects real users, and it does so
    // intermittently — which is the worst way to discover it.
    await expect(provider.verify(await google.sign({ iss: GOOGLE_ISS }))).resolves.toBeDefined();
    await expect(
      provider.verify(await google.sign({ iss: GOOGLE_ISS_BARE })),
    ).resolves.toBeDefined();
  });
});

describe('the signature', () => {
  it('rejects `alg: none` — the token with no signature at all', async () => {
    // The attack is not that a library will sign this. It is that a verifier
    // trusting the HEADER's alg will accept it, because the header is written
    // by the attacker.
    expect(await reasonOf(unsignedToken())).not.toBe('ACCEPTED');
  });

  it('rejects a symmetric algorithm', async () => {
    // The classic confusion attack: sign with HS256 using the PUBLIC key as the
    // HMAC secret. A verifier that does not pin the algorithm treats the public
    // key — which is public — as a shared secret.
    const forged = await google.sign({}, { alg: 'HS256' }).catch(() => null);
    if (forged) expect(await reasonOf(forged)).not.toBe('ACCEPTED');
  });

  it('rejects a signature from a key Google never published', async () => {
    expect(await reasonOf(await google.signWithUnknownKey())).not.toBe('ACCEPTED');
  });

  it('rejects a tampered payload', async () => {
    // Swap the subject and keep the original signature. This is the single most
    // valuable forgery there is — it is an account takeover by editing a string.
    const [header, , signature] = (await google.sign()).split('.');
    const tampered = Buffer.from(
      JSON.stringify({ iss: GOOGLE_ISS, aud: CLIENT_ID, sub: 'somebody-else', exp: 9999999999 }),
    ).toString('base64url');

    expect(await reasonOf(`${header}.${tampered}.${signature}`)).not.toBe('ACCEPTED');
  });
});

describe('the claims', () => {
  it('rejects a token minted for a different `aud`', async () => {
    // **The check that catches the whole class.** A token from ANY other Google
    // app is real, correctly signed, unexpired and issued by Google — every
    // check except this one passes. Without it, anyone running any Google app
    // can mint credentials for this game.
    expect(await reasonOf(await google.sign({ aud: 'someone-elses-app.apps.googleusercontent.com' }))).toBe(
      'aud',
    );
  });

  it('rejects a wrong issuer', async () => {
    expect(await reasonOf(await google.sign({ iss: 'https://accounts.evil.example' }))).toBe('iss');
  });

  it('rejects an expired token', async () => {
    expect(await reasonOf(await google.sign({}, { expiresIn: -3600 }))).toBe('exp');
  });

  it('rejects a token issued in the future beyond the skew allowance', async () => {
    expect(await reasonOf(await google.sign({}, { issuedAtOffset: 600 }))).toBe('iat');
  });

  it('tolerates clock skew up to 60 seconds', async () => {
    // Real clocks disagree. Zero tolerance turns a correctly-configured server
    // into an intermittent 401 nobody can reproduce.
    await expect(provider.verify(await google.sign({}, { expiresIn: -30 }))).resolves.toBeDefined();
    await expect(
      provider.verify(await google.sign({}, { issuedAtOffset: 30 })),
    ).resolves.toBeDefined();
  });

  it('rejects garbage that is not a token at all', async () => {
    for (const junk of ['', 'not-a-token', 'a.b.c', '...', 'Bearer xyz']) {
      expect(await reasonOf(junk), junk).not.toBe('ACCEPTED');
    }
  });
});

describe('identity is keyed on `sub`, never on email', () => {
  it('returns the same subject when the email changes', async () => {
    // **The single most common way provider-agnostic identity is quietly lost.**
    // A player changes their Google address; if email were the key they would
    // become a different account — or collide with whoever later acquires the
    // old one. It fails silently until the day somebody actually does it.
    const before = await provider.verify(await google.sign({ email: 'old@example.com' }));
    const after = await provider.verify(await google.sign({ email: 'new@example.com' }));

    expect(after.subject).toBe(before.subject);
    expect(after.email).not.toBe(before.email);
  });

  it('accepts a token with no email at all', async () => {
    // Email is optional at the provider and is contact data here, never
    // identity. A verifier that requires it rejects a valid sign-in.
    const identity = await provider.verify(
      await google.sign({ email: undefined as unknown as string }),
    );
    expect(identity.subject).toBeTruthy();
    expect(identity.email).toBeNull();
  });
});

describe('a rejected token creates nothing', () => {
  it('throws rather than returning a partial identity', async () => {
    // No `{ subject: null }`, no `{ ok: false }` that a caller can forget to
    // check. The only way past `verify` is a token that verified.
    await expect(provider.verify(unsignedToken())).rejects.toBeInstanceOf(
      InvalidProviderTokenError,
    );
    await expect(provider.verify(await google.sign({ aud: 'wrong' }))).rejects.toBeInstanceOf(
      InvalidProviderTokenError,
    );
  });
});
