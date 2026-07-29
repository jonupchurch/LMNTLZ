/**
 * Resolving a verified identity to an account.
 *
 * **The find-or-create must be atomic**, and that is the entire reason this file
 * exists rather than the logic sitting inline in a route. Two sign-ins racing on
 * a first-ever login both find nothing, both insert, and the player ends up with
 * two accounts and no way to say which is theirs — or, if the unique index
 * catches it, one of them gets a 500 on their very first action in the game.
 *
 * The transaction is why `db/client.ts` uses Neon's WebSocket driver rather than
 * the faster HTTP one, which cannot open one at all.
 */

import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, type Account } from '../db/schema/accounts.js';
import { identities } from '../db/schema/identities.js';
import { generatedUsername, usernameKey } from './username.js';
import type { VerifiedIdentity } from './provider.js';

export interface ResolvedAccount {
  readonly account: Account;
  readonly isNewAccount: boolean;
}

export class BannedAccountError extends Error {
  readonly status = 403 as const;
  readonly scope: string;
  readonly until: Date;

  constructor(scope: string, until: Date) {
    super('This account is suspended.');
    this.name = 'BannedAccountError';
    this.scope = scope;
    this.until = until;
  }
}

/**
 * **A ban is checked against the clock, not a flag.**
 *
 * `bannedUntil` in the past simply stops applying — there is no job to run and
 * therefore no job that can fail and leave somebody banned past their time.
 */
export function assertNotBanned(account: Account): void {
  if (account.bannedUntil && account.bannedUntil.getTime() > Date.now()) {
    throw new BannedAccountError(account.banScope ?? 'full', account.bannedUntil);
  }
}

/**
 * Find the account this identity belongs to, or create one.
 *
 * Keyed on `(provider, providerSubject)` — **never on email**. A player can
 * change their Google address; keying on it would make them a different account
 * on their next sign-in, or collide them with whoever later acquires it.
 *
 * The email column is written on every sign-in so it stays current for contact,
 * and is never read to find anything.
 */
export async function resolveAccount(identity: VerifiedIdentity): Promise<ResolvedAccount> {
  return db().transaction(async (tx) => {
    const [existing] = await tx
      .select({ account: accounts })
      .from(identities)
      .innerJoin(accounts, eq(identities.accountId, accounts.id))
      .where(
        and(
          eq(identities.provider, identity.provider),
          eq(identities.providerSubject, identity.subject),
        ),
      )
      .limit(1);

    if (existing) {
      // Refresh contact data. Not identity — this is the one write that email
      // is ever the subject of.
      if (identity.email) {
        await tx
          .update(identities)
          .set({ email: identity.email })
          .where(
            and(
              eq(identities.provider, identity.provider),
              eq(identities.providerSubject, identity.subject),
            ),
          );
      }
      return { account: existing.account, isNewAccount: false };
    }

    const display = generatedUsername(() => randomBytes(6).toString('base64url'));
    const [account] = await tx
      .insert(accounts)
      .values({ username: display, usernameKey: usernameKey(display) })
      .returning();

    await tx.insert(identities).values({
      accountId: account!.id,
      provider: identity.provider,
      providerSubject: identity.subject,
      email: identity.email,
    });

    return { account: account!, isNewAccount: true };
  });
}

/** The `/v1/me` shape. **Never the provider subject, the email, or a token.** */
export async function accountView(accountId: string): Promise<{
  id: string;
  username: string;
  createdAt: string;
  identities: { provider: string; linkedAt: string }[];
}> {
  const database = db();
  const [account] = await database
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) throw new Error(`no account ${accountId}`);

  const links = await database
    .select({ provider: identities.provider, linkedAt: identities.linkedAt })
    .from(identities)
    .where(eq(identities.accountId, accountId));

  return {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt.toISOString(),
    // Which providers, and when. **Not who they say you are** — the subject is
    // Google's identifier for this person and is nobody else's business,
    // including the person's own client (Constitution XVII).
    identities: links.map((l) => ({ provider: l.provider, linkedAt: l.linkedAt.toISOString() })),
  };
}

export async function accountById(accountId: string): Promise<Account | undefined> {
  const [account] = await db()
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return account;
}
