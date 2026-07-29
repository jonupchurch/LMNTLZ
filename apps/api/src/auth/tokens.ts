/**
 * Session and renewal tokens: issue, rotate, revoke.
 *
 * ### Two token types, and they are deliberately not the same kind of thing
 *
 * - The **session token** is a signed JWT. It is short-lived, self-describing,
 *   and verified without touching the database — which is what keeps the common
 *   authenticated request to one round trip.
 * - The **renewal token** is 256 bits of opaque random. It carries no claims,
 *   means nothing on its own, and is only ever a *lookup key* into a row we
 *   control. That is what makes revocation possible at all: you cannot un-issue
 *   a JWT, but you can delete a row.
 *
 * Making the renewal token a JWT too would be tidier and would remove the only
 * mechanism by which a stolen session can be ended early.
 *
 * ### The four states, which are the whole design
 *
 * | The presented token | What happens |
 * |---|---|
 * | unused | rotate — new pair, same family |
 * | used, successor still unused, inside 60 s | **return the stored pair, byte-identical** |
 * | used, in any other case | **revoke the entire family** |
 * | expired / revoked / unknown | 401 |
 *
 * Row two is the honest client retrying a request whose response was lost. Row
 * three is somebody presenting a token that has already done its job — and the
 * two are told apart by **whether the successor was consumed**, not by a clock.
 * A grace period, which is the usual answer, cannot tell them apart at all: it
 * hands the thief a genuinely valid credential for the length of the grace.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT } from 'jose';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { renewalTokens } from '../db/schema/renewalTokens.js';

/** Short, because a stolen session token cannot be revoked — only outlived. */
export const SESSION_MINUTES = 15;
/** Sliding: every rotation pushes it out, so an active player never signs out. */
export const RENEWAL_SLIDING_DAYS = 30;
/** Absolute. A family cannot renew itself forever; a sign-in is not permanent. */
export const FAMILY_ABSOLUTE_DAYS = 90;
/** How long a replay returns the stored pair instead of rotating. */
export const IDEMPOTENCY_WINDOW_MS = 60_000;

export interface TokenPair {
  readonly accessToken: string;
  readonly renewalToken: string;
  readonly familyId: string;
  /** Seconds until `accessToken` expires — what a client schedules against. */
  readonly expiresIn: number;
}

export type RejectionReason = 'unknown' | 'expired' | 'revoked' | 'replayed';

/**
 * **Every reason carries 401 and the same client-facing message.**
 *
 * The named reason is for logs and for the tests, which need to tell a replay
 * from an expiry to know the rotation rule works at all. What reaches a caller
 * is a status and nothing else — "that token existed but expired" is an oracle
 * for probing which tokens are real.
 */
export class TokenRejectedError extends Error {
  readonly reason: RejectionReason;
  readonly status = 401 as const;

  constructor(reason: RejectionReason) {
    super('The renewal token is not valid.');
    this.name = 'TokenRejectedError';
    this.reason = reason;
  }
}

/**
 * `sha256`, and **deliberately not a password KDF** (FR-013).
 *
 * A renewal token is 256 bits from a CSPRNG. There is no dictionary to attack,
 * no rainbow table to build and no user-chosen structure to exploit — the
 * properties a slow hash buys are all properties this input already has. What
 * bcrypt would add is latency on the single most frequent authenticated call in
 * the game.
 */
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

const newToken = (): string => randomBytes(32).toString('base64url');

const signingKey = (): Uint8Array => {
  const key = process.env['JWT_SIGNING_KEY'];
  if (!key) {
    throw new Error(
      'JWT_SIGNING_KEY is not set. Copy .env.example to .env.local — the value ' +
        'is generated, never pasted from anywhere.',
    );
  }
  return new TextEncoder().encode(key);
};

/**
 * Sign a session token, **with a unique `jti`**.
 *
 * Without one, two tokens issued for the same account and family inside the same
 * second are byte-identical: `sub`, `sid`, `iat` and `exp` all match, and JWT
 * timestamps have one-second resolution. A test caught it, and the reason it
 * matters is not the collision itself — both copies are equally valid — but what
 * the collision reveals: **the session token had no identity of its own.**
 *
 * Three things want one. An audit log needs to say *which* token acted. Any
 * future denylist needs a handle to deny, and `sid` is the family, so denying it
 * would sign out every token in the sign-in rather than one. And a rotation
 * inside the same second would otherwise hand back a token expiring at the exact
 * moment the old one did, so the renewal would not have renewed anything.
 */
async function signSession(accountId: string, familyId: string): Promise<string> {
  return new SignJWT({ sid: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(accountId)
    .setJti(randomBytes(16).toString('hex'))
    .setIssuedAt()
    .setIssuer('lmntlz')
    .setAudience('lmntlz-client')
    .setExpirationTime(`${SESSION_MINUTES}m`)
    .sign(signingKey());
}

const daysFromNow = (days: number): Date => new Date(Date.now() + days * 86_400_000);

/**
 * A fresh family. **One per sign-in**, never per rotation.
 *
 * Theft is detected on a single token and answered on the whole family, so the
 * family is the unit that means "this sign-in". Two devices are two families,
 * and a theft on one does not sign the player out of the other.
 */
export async function issuePair(accountId: string): Promise<TokenPair> {
  const renewalToken = newToken();
  const [row] = await db()
    .insert(renewalTokens)
    .values({
      accountId,
      familyId: crypto.randomUUID(),
      tokenHash: hash(renewalToken),
      expiresAt: daysFromNow(RENEWAL_SLIDING_DAYS),
    })
    .returning();

  const familyId = row!.familyId;
  return {
    accessToken: await signSession(accountId, familyId),
    renewalToken,
    familyId,
    expiresIn: SESSION_MINUTES * 60,
  };
}

/**
 * Kill every token in a family.
 *
 * **Not just the presented one.** Revoking a single token would leave a thief
 * holding the successor they already minted — the attack would survive its own
 * detection, which is worse than not detecting it, because now nobody is
 * looking.
 */
async function revokeFamilyById(familyId: string): Promise<void> {
  await db()
    .update(renewalTokens)
    .set({ revokedAt: new Date(), issuedPair: null })
    .where(and(eq(renewalTokens.familyId, familyId), isNull(renewalTokens.revokedAt)));
}

/**
 * Present a renewal token. Returns the next pair, or throws.
 *
 * Reads as the four-state table in the module note, in that order — and the
 * order matters: `revoked` is checked before `used`, so a token from a family
 * that was already killed reports the killing rather than triggering a second
 * one.
 */
export async function renewPair(presented: string): Promise<TokenPair> {
  const database = db();
  const [row] = await database
    .select()
    .from(renewalTokens)
    .where(eq(renewalTokens.tokenHash, hash(presented)))
    .limit(1);

  if (!row) throw new TokenRejectedError('unknown');
  if (row.revokedAt) throw new TokenRejectedError('revoked');
  if (row.expiresAt.getTime() <= Date.now()) throw new TokenRejectedError('expired');

  if (row.usedAt) {
    const withinWindow = Date.now() - row.usedAt.getTime() < IDEMPOTENCY_WINDOW_MS;
    const successorUnused = row.replacedBy
      ? await isUnused(row.replacedBy)
      : false;

    /**
     * **The honest retry.** Inside the window, and the pair this token already
     * minted has not itself been used — so nobody has moved on, and this is the
     * same client asking again for an answer it never received.
     */
    if (withinWindow && successorUnused && row.issuedPair) {
      return JSON.parse(row.issuedPair) as TokenPair;
    }

    /**
     * **Everything else is theft.** The successor was consumed, or the window
     * closed. Either way this token has already done its job and somebody is
     * presenting it anyway.
     */
    await revokeFamilyById(row.familyId);
    throw new TokenRejectedError('replayed');
  }

  // The family cannot renew itself forever.
  const [oldest] = await database
    .select({ createdAt: renewalTokens.createdAt })
    .from(renewalTokens)
    .where(eq(renewalTokens.familyId, row.familyId))
    .orderBy(renewalTokens.createdAt)
    .limit(1);

  if (oldest && Date.now() - oldest.createdAt.getTime() > FAMILY_ABSOLUTE_DAYS * 86_400_000) {
    await revokeFamilyById(row.familyId);
    throw new TokenRejectedError('expired');
  }

  const renewalToken = newToken();
  const [successor] = await database
    .insert(renewalTokens)
    .values({
      accountId: row.accountId,
      familyId: row.familyId,
      tokenHash: hash(renewalToken),
      expiresAt: daysFromNow(RENEWAL_SLIDING_DAYS),
    })
    .returning();

  const pair: TokenPair = {
    accessToken: await signSession(row.accountId, row.familyId),
    renewalToken,
    familyId: row.familyId,
    expiresIn: SESSION_MINUTES * 60,
  };

  // Recorded so a replay inside the window can return *this* pair rather than
  // an equivalent one. Cleared when the family is revoked, and by the cleanup
  // cron once the window has closed.
  await database
    .update(renewalTokens)
    .set({ usedAt: new Date(), replacedBy: successor!.id, issuedPair: JSON.stringify(pair) })
    .where(eq(renewalTokens.id, row.id));

  return pair;
}

async function isUnused(id: string): Promise<boolean> {
  const [row] = await db()
    .select({ usedAt: renewalTokens.usedAt })
    .from(renewalTokens)
    .where(eq(renewalTokens.id, id))
    .limit(1);
  return row?.usedAt === null;
}

/**
 * Sign out. **Idempotent, and silent about tokens it does not recognise.**
 *
 * A 404 here would let anybody probe which tokens exist, and a client retrying
 * a sign-out it already completed should not see an error for succeeding twice.
 */
export async function revokeFamily(presented: string): Promise<void> {
  const [row] = await db()
    .select({ familyId: renewalTokens.familyId })
    .from(renewalTokens)
    .where(eq(renewalTokens.tokenHash, hash(presented)))
    .limit(1);

  if (row) await revokeFamilyById(row.familyId);
}

/**
 * Constant-time comparison, for anywhere a token is compared to a token.
 *
 * Unused by the lookups above — they compare *hashes* inside Postgres, via an
 * index, which leaks nothing useful — but exported so that the next person
 * needing to compare two secrets does not reach for `===`.
 */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
