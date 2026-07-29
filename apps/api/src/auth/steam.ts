/**
 * Steam — **designed, written down, and deliberately not wired** (FR-010).
 *
 * This is not dead code awaiting deletion. It is the seam, and SC-008 is its
 * test: *adding Steam later touches this feature and nothing else.* The claim is
 * only checkable if the shape exists now, while the cost of getting it wrong is
 * one file rather than a schema migration.
 *
 * > **Do not finish it.** The temptation is real, because it is nearly done —
 * > the verification is one HTTP call to a documented endpoint. The decision is
 * > that 1.0 ships browser-first with Steam as a fast-follow, and a half-tested
 * > second sign-in path at launch buys nothing: nobody can reach it, because
 * > there is no Steam build to reach it from.
 *
 * ### What it will do, recorded now so nobody re-derives it
 *
 * The client obtains an **encrypted app ticket** from `steamworks.js` and posts
 * it. The server calls `ISteamUserAuth/AuthenticateUserTicket` with the
 * publisher web API key, and gets back a `steamid`. That `steamid` is the
 * `providerSubject` — the same column Google's `sub` uses, in the same table.
 *
 * Note what is *absent* from that description: any change to `accounts`, to the
 * token flow, or to any route outside this feature. That is the seam working.
 *
 * **The publisher key is a server secret** and must never reach a client build,
 * which is the same rule as everywhere else and the reason `steamworks.js` is
 * isolated so the browser bundle cannot import it.
 */

import { InvalidProviderTokenError, type IdentityProvider } from './provider.js';

export class SteamNotImplementedError extends Error {
  readonly status = 501 as const;

  constructor() {
    super('Steam sign-in is not available yet.');
    this.name = 'SteamNotImplementedError';
  }
}

export const steamProvider: IdentityProvider = {
  name: 'steam',

  verify(): Promise<never> {
    // Throws rather than returning a placeholder identity. A stub that returned
    // a fake subject would be a way into somebody's account the day a route
    // stopped checking the 501 first.
    return Promise.reject(new SteamNotImplementedError());
  },
};

/**
 * The verification shape, written down and unreferenced.
 *
 * Kept as a type rather than a comment so that the day it is implemented, the
 * response shape is already stated and typed — and so that a reader can see the
 * `steamid` is a string, not a number. Steam ids exceed 2^53 and parsing one as
 * a JavaScript number silently corrupts the last digits.
 */
export interface SteamTicketResponse {
  readonly response: {
    readonly params?: {
      readonly result: 'OK';
      /** **A string.** Exceeds 2^53; parsing as a number corrupts it silently. */
      readonly steamid: string;
      readonly ownersteamid: string;
      readonly vacbanned: boolean;
      readonly publisherbanned: boolean;
    };
    readonly error?: { readonly errorcode: number; readonly errordesc: string };
  };
}

/** Unused at 1.0. Present so the failure mode is already named. */
export const STEAM_AUTH_URL =
  'https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/';

export { InvalidProviderTokenError };
