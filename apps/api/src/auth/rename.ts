/**
 * Changing a username.
 *
 * **The whole point of this feature is that a rename breaks nothing.** Every
 * battle, replay, rune, guild membership and message points at `accounts.id`,
 * which never changes — so a rename is one `UPDATE` on one column and nothing
 * downstream notices. The test that proves it is trivial to write now and is
 * the regression that catches somebody later "simplifying" by keying on the
 * username instead.
 */

import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { usernameChanges } from '../db/schema/usernameChanges.js';
import {
  RENAMES_PER_WINDOW,
  RENAME_COST_SHARDS,
  RENAME_WINDOW_DAYS,
  collisionRule,
  displayForm,
  usernameKey,
  validateUsername,
  type CollisionRule,
  type UsernameRejection,
} from './username.js';

export class RenameRejectedError extends Error {
  readonly status: 409 | 422 | 429 | 402;
  readonly code: string;
  /** Present on a 409 only — which rule matched. */
  readonly rule?: CollisionRule;

  constructor(status: 409 | 422 | 429 | 402, code: string, message: string, rule?: CollisionRule) {
    super(message);
    this.name = 'RenameRejectedError';
    this.status = status;
    this.code = code;
    if (rule) this.rule = rule;
  }
}

const REJECTION_MESSAGE: Record<UsernameRejection, string> = {
  'too-short': 'Names are 3 to 16 characters.',
  'too-long': 'Names are 3 to 16 characters.',
  charset: 'Names use letters, digits and underscores. No spaces or punctuation.',
  'leading-underscore': 'A name cannot start with an underscore.',
  'trailing-underscore': 'A name cannot end with an underscore.',
  'doubled-underscore': 'A name cannot contain two underscores in a row.',
  reserved: 'That name is reserved.',
};

export interface RenameOptions {
  /** A moderation-forced rename: **free, and it does not spend the allowance.** */
  readonly forced?: boolean;
  /** Feature 010 owns the ledger; this reports what it would cost. */
  readonly shardsAvailable?: number;
}

export interface RenameResult {
  readonly username: string;
  readonly shardsCharged: number;
  readonly changesRemaining: number;
}

/**
 * Rename an account.
 *
 * **Everything happens in one transaction**, because between the collision check
 * and the update there is a window in which somebody else takes the name. The
 * unique index would catch it, but as a 500 — and this needs to be a `409` that
 * names which rule matched.
 */
export async function renameAccount(
  accountId: string,
  requested: string,
  options: RenameOptions = {},
): Promise<RenameResult> {
  const display = displayForm(requested);

  const rejection = validateUsername(display);
  if (rejection) {
    throw new RenameRejectedError(422, rejection, REJECTION_MESSAGE[rejection]);
  }

  const key = usernameKey(display);

  return db().transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) throw new Error(`no account ${accountId}`);

    // No-op renames are refused rather than silently charged. A client resending
    // the current name has a state bug, and taking 325 shards for it would be a
    // support ticket rather than a lesson.
    if (account.usernameKey === key && account.username === display) {
      throw new RenameRejectedError(409, 'exact', 'That is already your name.', 'exact');
    }

    const [taken] = await tx
      .select({ username: accounts.username })
      .from(accounts)
      .where(eq(accounts.usernameKey, key))
      .limit(1);

    if (taken) {
      const rule = collisionRule(display, taken.username);
      throw new RenameRejectedError(
        409,
        rule,
        rule === 'confusable'
          ? 'That name reads the same as an existing one. Check for lookalike characters.'
          : 'That name is taken.',
        rule,
      );
    }

    // ---------------------------------------------------------------------
    // The allowance. **Counted from history, not from a counter** — a rolling
    // window cannot be expressed as a number that something has to reset, and
    // a reset job is a thing that fails at 3am and either locks somebody out
    // or hands them unlimited renames.
    // ---------------------------------------------------------------------
    const since = new Date(Date.now() - RENAME_WINDOW_DAYS * 86_400_000);
    const [tally] = await tx
      .select({ used: count() })
      .from(usernameChanges)
      .where(
        and(
          eq(usernameChanges.accountId, accountId),
          eq(usernameChanges.forced, false),
          gte(usernameChanges.changedAt, since),
        ),
      );

    // `count()` over a filtered set always returns one row, but
    // `noUncheckedIndexedAccess` cannot know that — so the fallback is stated
    // rather than asserted away with `!`. Zero is also the correct answer if it
    // ever were absent.
    const used = tally?.used ?? 0;

    const voluntary = !options.forced;
    if (voluntary && used >= RENAMES_PER_WINDOW) {
      throw new RenameRejectedError(
        429,
        'rename_limit',
        `Names can change ${RENAMES_PER_WINDOW} times per ${RENAME_WINDOW_DAYS} days.`,
      );
    }

    // The first change is free: a new account carries a generated placeholder,
    // so charging for the first real name charges somebody to undo something
    // we did to them. A forced rename is free because they did not choose it.
    const isFirst = used === 0;
    const cost = options.forced || isFirst ? 0 : RENAME_COST_SHARDS;

    if (cost > 0 && options.shardsAvailable !== undefined && options.shardsAvailable < cost) {
      throw new RenameRejectedError(
        402,
        'insufficient_shards',
        `Renaming costs ${cost} shards.`,
      );
    }

    await tx
      .update(accounts)
      .set({ username: display, usernameKey: key })
      .where(eq(accounts.id, accountId));

    await tx.insert(usernameChanges).values({
      accountId,
      previousUsername: account.username,
      newUsername: display,
      forced: options.forced ?? false,
    });

    return {
      username: display,
      shardsCharged: cost,
      changesRemaining: voluntary ? RENAMES_PER_WINDOW - used - 1 : RENAMES_PER_WINDOW - used,
    };
  });
}
