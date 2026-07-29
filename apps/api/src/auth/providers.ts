/**
 * The provider registry — **Constitution XIX's seam, made concrete.**
 *
 * Routes ask for `providerFor('google')` and never import `google.ts`. That is
 * what makes SC-003 hold: no route outside `src/auth/` reads a provider name,
 * and adding Steam at 1.1 means registering one more entry here.
 *
 * It also makes the routes testable without a live Google, which is not a
 * side benefit — a route suite that could not exercise sign-in would leave the
 * `403` and `isNewAccount` paths untested, and those are exactly the paths that
 * only run for a banned player and a brand-new one.
 */

import { createGoogleProvider } from './google.js';
import { steamProvider } from './steam.js';
import type { IdentityProvider, Provider } from './provider.js';

const overrides = new Map<Provider, IdentityProvider>();
let google: IdentityProvider | undefined;

export function providerFor(name: Provider): IdentityProvider {
  const override = overrides.get(name);
  if (override) return override;

  if (name === 'steam') return steamProvider;

  google ??= createGoogleProvider({ clientId: process.env['GOOGLE_CLIENT_ID'] ?? '' });
  return google;
}

/**
 * Swap an implementation. **Tests only**, and named so that its appearance in
 * anything under `src/` outside this file is obvious in review.
 *
 * The alternative — a module-level singleton with no seam — would push the route
 * tests into either mocking the module loader or talking to Google's live
 * endpoint from CI. Both are worse than one clearly-labelled function.
 */
export function overrideProvider(name: Provider, implementation: IdentityProvider): () => void {
  overrides.set(name, implementation);
  return () => overrides.delete(name);
}
