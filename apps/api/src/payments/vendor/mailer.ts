/**
 * The mail vendor, and **the only file in `src/` allowed to name one**
 * (Constitution XIX).
 *
 * `receipt.ts` owns what the email *says* and when it is sent; this owns who sends
 * it. The split is the same one `rail.ts` makes for payments, and it exists so the
 * scan in `tests/payments/grantPath.test.ts` can be absolute rather than
 * approximate — *no vendor named outside `vendor/`*, with no carve-outs to
 * remember.
 *
 * > **This module first lived in `receipt.ts` and the scan did not catch it**,
 * > because the variable is `resend_RESEND_API_KEY` and `\bresend\b` does not match
 * > inside `resend_RESEND` — `_` is a word character. The rule was being satisfied
 * > by a regex technicality rather than by the code being right, which is worth
 * > exactly nothing the next time the name is spelled differently.
 *
 * ### Two variable names, because the marketplace prefixes and a hand-set one does not
 *
 * A Vercel marketplace integration injects its variables prefixed with the
 * integration's own slug; a variable set by hand has no prefix. Both are read, so
 * the same code works either way.
 *
 * **Which project the integration attached to is the thing to check**, not which
 * name it used. The Neon marketplace resource once attached itself to the *client*
 * project and published the database password to a static site in four forms. A
 * `RESEND_*` or `resend_*` variable on `lmntlz` means the same mistake: the client
 * is a static bundle and cannot hold a secret.
 */

import type { Email, Mailer } from '../receipt.js';
import type { FetchResponse } from '../../types/fetch.js';

const API = 'https://api.resend.com/emails';

/** Credentials, or `null` when this environment has none. **Never logged.** */
export function mailCredentials(): { readonly key: string; readonly domain: string } | null {
  const key = process.env['resend_RESEND_API_KEY'] ?? process.env['RESEND_API_KEY'];
  const domain =
    process.env['resend_RESEND_EMAIL_DOMAIN'] ?? process.env['RESEND_EMAIL_DOMAIN'] ?? 'lmntlz.com';

  if (!key) return null;
  return { key, domain };
}

/**
 * A mailer over the vendor's HTTP API.
 *
 * **`fetch` rather than the SDK.** One POST with a bearer token is the entire
 * surface used, and a dependency whose only job is to build that request is a
 * supply-chain risk bought for nothing. It also keeps the vendor swappable at the
 * size it deserves — this file.
 */
export function httpMailer(): Mailer | null {
  const creds = mailCredentials();
  if (!creds) return null;

  return {
    async send(email: Email): Promise<void> {
      /**
       * **Cast to `FetchResponse`, and never the ambient `Response`** — see
       * `types/fetch.ts` for the full history. Short version: Vercel compiles
       * this app's entrypoint by naming files on the command line, which makes
       * TypeScript ignore `tsconfig.json` entirely (TS5112). So `types:
       * ["node"]` does not apply, the ambient `Response` is some other
       * `Response`, and `.ok` and `.status` do not exist on it.
       *
       * **This shipped as a failed deploy.** `pnpm typecheck` was green locally
       * and the Vercel build was red on these two lines, so production went on
       * serving an older build. `storage.ts` had already hit this and written
       * the fix down; the mailer did not follow the precedent. Anything in
       * `apps/api` that touches `fetch` must depend on the runtime shape rather
       * than on whichever ambient `Response` happens to be in scope.
       */
      const response = (await fetch(API, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${creds.key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: `LMNTLZ <no-reply@${creds.domain}>`,
          to: [email.to],
          subject: email.subject,
          text: email.text,
        }),
      })) as unknown as FetchResponse;

      if (!response.ok) {
        /**
         * **The status, never the body and never the key.** A provider error body
         * routinely echoes the request, and the request carries the bearer token.
         */
        throw new Error(`mail send failed with status ${response.status}`);
      }
    },
  };
}
