/**
 * Sending mail from this feature, through **the sender that already exists**.
 *
 * Constitution XIX: vendors behind interfaces. Feature 011 built `Mailer` and
 * `installMailer()` wires the real one at startup in `src/index.ts`. This is a
 * one-line adapter and not a second sender, deliberately —
 * `payments/grantPath.test.ts` scans `src/` for vendor names outside
 * `payments/vendor/`, and a guilds module that imported an SDK would fail it.
 *
 * **A missing mailer is not an error.** In development and in every test there is
 * none installed, and a succession must proceed regardless: the email is a
 * courtesy, and *presence is the reply* — the master's protection is signing in,
 * not receiving a message. Making the request depend on delivery would mean a mail
 * outage silently froze every guild in the game.
 */

import { deliver, type Email } from '../payments/receipt.js';

/** Returns whether anything was sent, so a test can assert it without needing it to. */
export async function sendIfPossible(email: Email): Promise<boolean> {
  return deliver(email);
}
