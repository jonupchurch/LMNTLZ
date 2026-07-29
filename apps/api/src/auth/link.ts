/**
 * Attaching a second provider to an existing account.
 *
 * ### It never merges two accounts, and that is the whole design
 *
 * The obvious behaviour — "this Steam id already belongs to account B, so fold
 * B into A" — is unimplementable here, not merely undesirable. A merge would
 * have to reconcile **two shard ledgers, two rating histories and two guild
 * memberships**, and every one of those is append-only by constitutional rule
 * (XVI). There is no correct answer to "what is the merged rating?", and
 * whichever answer you pick, somebody's history is now a fiction.
 *
 * So: `409`, and a support path. That is the honest answer, and saying it in
 * code rather than discovering it during an incident is the point.
 *
 * ### An account must always retain a way in
 *
 * Unlinking the only provider would leave an account nobody can sign into —
 * with its runes, its shards and its guild seat intact and unreachable. There is
 * no recovery flow to fall back on because there are no passwords and no email
 * ownership proof.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { identities } from '../db/schema/identities.js';
import type { Provider, VerifiedIdentity } from './provider.js';

export type LinkFailure =
  /** That provider subject is already attached to a different account. */
  | 'subject-taken'
  /** This account already has an identity for that provider. */
  | 'provider-already-linked'
  /** Removing this would leave the account with no way in. */
  | 'last-provider';

export class LinkRejectedError extends Error {
  readonly reason: LinkFailure;
  readonly status = 409 as const;

  constructor(reason: LinkFailure, message: string) {
    super(message);
    this.name = 'LinkRejectedError';
    this.reason = reason;
  }
}

/**
 * Attach a verified identity to an account.
 *
 * **Both checks happen inside one transaction**, because between "is this
 * subject free?" and "insert it" there is a window in which two requests can
 * both find it free. The unique index would catch that and raise a constraint
 * violation, but a constraint violation surfaces as a 500 — and this is a 409
 * with a specific reason a client can act on.
 */
export async function linkIdentity(
  accountId: string,
  identity: VerifiedIdentity,
): Promise<void> {
  await db().transaction(async (tx) => {
    const [existingSubject] = await tx
      .select({ accountId: identities.accountId })
      .from(identities)
      .where(
        and(
          eq(identities.provider, identity.provider),
          eq(identities.providerSubject, identity.subject),
        ),
      )
      .limit(1);

    if (existingSubject) {
      // **Including when it is already this account's.** Re-linking is not an
      // error worth a 204 either — a client that thinks it needs to link
      // something already linked has a state bug, and silently succeeding hides
      // it.
      throw new LinkRejectedError(
        'subject-taken',
        existingSubject.accountId === accountId
          ? 'That identity is already linked to this account.'
          : 'That identity belongs to another account. Accounts are never merged.',
      );
    }

    const [existingProvider] = await tx
      .select({ id: identities.id })
      .from(identities)
      .where(and(eq(identities.accountId, accountId), eq(identities.provider, identity.provider)))
      .limit(1);

    if (existingProvider) {
      throw new LinkRejectedError(
        'provider-already-linked',
        'This account already has an identity for that provider.',
      );
    }

    await tx.insert(identities).values({
      accountId,
      provider: identity.provider,
      providerSubject: identity.subject,
      email: identity.email,
    });
  });
}

/**
 * Detach a provider — **refusing when it is the last one** (FR-009).
 *
 * Counted inside the transaction for the same reason as above: two concurrent
 * unlinks each seeing two providers would both proceed, and the account would
 * end with none.
 */
export async function unlinkIdentity(accountId: string, provider: Provider): Promise<void> {
  await db().transaction(async (tx) => {
    const rows = await tx
      .select({ provider: identities.provider })
      .from(identities)
      .where(eq(identities.accountId, accountId));

    if (rows.length <= 1) {
      throw new LinkRejectedError(
        'last-provider',
        'An account must keep at least one way to sign in. Link another ' +
          'provider before removing this one.',
      );
    }

    await tx
      .delete(identities)
      .where(and(eq(identities.accountId, accountId), eq(identities.provider, provider)));
  });
}
