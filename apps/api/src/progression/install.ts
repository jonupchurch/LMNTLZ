/**
 * Wiring 010 into the seams 009 left for it.
 *
 * **This file exists because a seam with no caller is the project's most reliable
 * failure mode.** Feature 006 shipped every squad component complete and
 * unit-tested while nothing rendered them; 006 shipped again with a save route no
 * client called. Both times every task was closed and every gate was green,
 * because *"build the thing"* and *"call the thing"* are different tasks and only
 * the first one was written down.
 *
 * `setRuneSource` is the same shape. `gearScore.ts` has answered the 1,500 starter
 * grant for **every account since 009 shipped**, correctly, because
 * `noRuneSource.placedStatPoints` returns `null` and null means *"rune placement
 * does not exist yet"*. The moment it does exist, somebody has to say so — and
 * nothing in 010's task list says it.
 *
 * The symptom if this is never called is the quiet kind: runes place, shards are
 * charged, allocations are stored, and **every player stays in Bronze forever**.
 * Nothing errors.
 */

import { setRuneSource } from '../matchmaking/gearScore.js';
import { runeSource } from './runes.js';
import { setMailer } from '../payments/receipt.js';
import { httpMailer } from '../payments/vendor/mailer.js';

let installed = false;

/**
 * Idempotent, because `index.ts` is imported once per serverless invocation and a
 * second install would stack undo functions nobody holds.
 */
export function installRuneSource(): void {
  if (installed) return;
  setRuneSource(runeSource);
  installed = true;
}

let mailerInstalled = false;

/**
 * Install the mail vendor, if this environment has credentials.
 *
 * **Written immediately after `httpMailer()` shipped with no caller** — the same
 * omission this file was created to fix for 010, in the same session. The symptom
 * is the quiet one every time: receipts simply never send, no error, and the only
 * evidence is a customer who says they got nothing.
 *
 * `null` when there are no credentials is a legitimate state, not a failure. A
 * developer without a key gets no email and everything else works; `sendReceipt`
 * returns `false` and the payment is unaffected.
 */
export function installMailer(): void {
  if (mailerInstalled) return;
  const mailer = httpMailer();
  if (mailer) setMailer(mailer);
  mailerInstalled = true;
}
