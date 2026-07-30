/**
 * A signed-in account, over HTTP.
 *
 * The same `sub:`-prefixed stand-in provider every other route suite installs.
 * Identity is feature 005's problem and has its own tests; a profile test that
 * also verified JWTs would fail for two unrelated reasons and get read as flaky.
 */

import { expect } from 'vitest';
import app from '../../src/index.js';
import { overrideProvider } from '../../src/auth/providers.js';
import { InvalidProviderTokenError, type IdentityProvider } from '../../src/auth/provider.js';

const provider: IdentityProvider = {
  name: 'google',
  verify: (token: string) =>
    token.startsWith('sub:')
      ? Promise.resolve({ provider: 'google' as const, subject: token.slice(4), email: null })
      : Promise.reject(new InvalidProviderTokenError('signature')),
};

export interface Signed {
  readonly accountId: string;
  readonly token: string;
  readonly username: string;
  headers(): Record<string, string>;
}

/**
 * Sign in, creating a fresh account each call.
 *
 * `options.subject` pins the provider subject instead, so **signing in twice
 * returns the SAME account** — which is the only way to test anything that happens
 * *on* a sign-in rather than on account creation. 013's succession lapse needs it:
 * *presence is the reply*, and proving the auth route lapses a pending request
 * means signing an existing master back in.
 */
export async function signIn(
  tag: string,
  options: { readonly subject?: string } = {},
): Promise<Signed> {
  const restore = overrideProvider('google', provider);

  try {
    const subject =
      options.subject ?? `${tag}-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
    const res = await app.request('/v1/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: `sub:${subject}` }),
    });

    const body = (await res.json()) as {
      session: { token: string };
      account: { id: string; username: string };
    };
    expect(res.status, JSON.stringify(body)).toBe(200);

    return {
      accountId: body.account.id,
      token: body.session.token,
      username: body.account.username,
      headers: () => ({
        'content-type': 'application/json',
        authorization: `Bearer ${body.session.token}`,
      }),
    };
  } finally {
    restore();
  }
}
