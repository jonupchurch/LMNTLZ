/**
 * **Rotation on use, and the retry problem it creates.**
 *
 * Rotating a renewal token every time it is presented is how theft is detected:
 * if a token is ever presented twice, one of the two presenters is not the
 * owner. The cost is that an honest client whose renewal request times out
 * mid-flight retries with the same token — and a naive implementation revokes a
 * legitimate session because a packet dropped.
 *
 * **The usual fix is a grace period, and it is wrong.** Accepting the old token
 * for N seconds hands a genuine thief a genuinely valid credential for N
 * seconds, which is the entire attack. It also passes case 2 below while failing
 * case 3, so a suite that stops at case 2 certifies it.
 *
 * The fix here is a **bounded idempotency window**: a replay inside 60 s returns
 * *the pair already issued*, byte-identical, provided that pair has not itself
 * been used. The honest retry gets its answer; the thief gets nothing. The two
 * are told apart by **whether the successor was consumed**, not by a clock.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../../src/db/client.js';
import { accounts } from '../../src/db/schema/accounts.js';
import { renewalTokens } from '../../src/db/schema/renewalTokens.js';
import {
  FAMILY_ABSOLUTE_DAYS,
  RENEWAL_SLIDING_DAYS,
  SESSION_MINUTES,
  issuePair,
  renewPair,
  revokeFamily,
  TokenRejectedError,
} from '../../src/auth/tokens.js';
import { eq } from 'drizzle-orm';

const SUFFIX = `test-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
let accountId: string;

beforeAll(async () => {
  const [row] = await db()
    .insert(accounts)
    .values({ username: `Rotation ${SUFFIX}`, usernameKey: `rotation-${SUFFIX}` })
    .returning();
  accountId = row!.id;
});

afterAll(async () => {
  // Cascades to renewal_tokens and identities.
  await db().delete(accounts).where(eq(accounts.id, accountId));
  await closeDb();
});

const reasonOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return 'ACCEPTED';
  } catch (err) {
    if (err instanceof TokenRejectedError) return err.reason;
    throw err;
  }
};

describe('the settled lifetimes', () => {
  it('is 15-minute sessions, 30-day sliding renewal, 90-day absolute family', () => {
    expect(SESSION_MINUTES).toBe(15);
    expect(RENEWAL_SLIDING_DAYS).toBe(30);
    expect(FAMILY_ABSOLUTE_DAYS).toBe(90);
  });
});

describe('issuing a pair', () => {
  it('returns a session token and a renewal token', async () => {
    const pair = await issuePair(accountId);

    expect(pair.accessToken).toBeTruthy();
    expect(pair.renewalToken).toBeTruthy();
    expect(pair.accessToken).not.toBe(pair.renewalToken);
    expect(pair.familyId).toBeTruthy();
  });

  it('never stores the raw renewal token', async () => {
    // A database leak should be a leak of hashes, not of live sessions.
    const pair = await issuePair(accountId);
    const rows = await db()
      .select()
      .from(renewalTokens)
      .where(eq(renewalTokens.familyId, pair.familyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(pair.renewalToken);
    expect(rows[0]!.tokenHash).toHaveLength(64); // sha256, hex
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(pair.renewalToken);
    }
  });

  it('starts a NEW family per sign-in', async () => {
    const a = await issuePair(accountId);
    const b = await issuePair(accountId);
    expect(a.familyId).not.toBe(b.familyId);
  });

  it('produces unguessable tokens', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add((await issuePair(accountId)).renewalToken);
    expect(seen.size).toBe(20);
    expect([...seen][0]!.length).toBeGreaterThanOrEqual(43); // >= 256 bits base64url
  });
});

// ---------------------------------------------------------------------------
// The four states (T020)
// ---------------------------------------------------------------------------

describe('case 1 — an unused token gives a new pair', () => {
  it('rotates, and the new token differs from the old', async () => {
    const first = await issuePair(accountId);
    const second = await renewPair(first.renewalToken);

    expect(second.renewalToken).not.toBe(first.renewalToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    // Same family: this is the same sign-in continuing, not a new one.
    expect(second.familyId).toBe(first.familyId);
  });
});

describe('case 2 — a replay inside the window returns THE SAME pair', () => {
  it('is byte-identical, not merely valid', async () => {
    // The honest retry. A newly-minted-but-equivalent pair would also "work",
    // and would double the family's live tokens on every dropped packet.
    const first = await issuePair(accountId);
    const once = await renewPair(first.renewalToken);
    const twice = await renewPair(first.renewalToken);

    expect(twice.renewalToken).toBe(once.renewalToken);
    expect(twice.accessToken).toBe(once.accessToken);
  });

  it('survives several retries', async () => {
    const first = await issuePair(accountId);
    const once = await renewPair(first.renewalToken);

    for (let i = 0; i < 5; i++) {
      expect((await renewPair(first.renewalToken)).renewalToken).toBe(once.renewalToken);
    }
  });

  it('leaves the family alive', async () => {
    const first = await issuePair(accountId);
    const once = await renewPair(first.renewalToken);
    await renewPair(first.renewalToken);

    // The successor still works — a retry must not have poisoned anything.
    await expect(renewPair(once.renewalToken)).resolves.toBeDefined();
  });
});

describe('case 3 — using the new pair, then replaying the old, kills the family', () => {
  it('is the case a grace period gets wrong', async () => {
    // **Write this one explicitly.** A grace-period implementation passes case 2
    // and fails here: it sees a replay inside N seconds and hands the replayer a
    // valid credential, which is precisely the theft it was meant to detect. So
    // case 2 passing does not imply case 3 does.
    const first = await issuePair(accountId);
    const second = await renewPair(first.renewalToken);

    // The legitimate client moves on and uses its new token.
    const third = await renewPair(second.renewalToken);
    expect(third.renewalToken).not.toBe(second.renewalToken);

    // Now the old one comes back. The successor has been consumed, so this is
    // not a retry — somebody else has the token.
    expect(await reasonOf(() => renewPair(first.renewalToken))).toBe('replayed');

    // And the whole family dies, including the token the thief may also hold.
    expect(await reasonOf(() => renewPair(third.renewalToken))).toBe('revoked');
    expect(await reasonOf(() => renewPair(second.renewalToken))).toBe('revoked');
  });

  it('kills the family rather than only the replayed token', async () => {
    // Revoking one token would leave the thief holding the successor they
    // already minted — the attack would survive its own detection.
    const first = await issuePair(accountId);
    const second = await renewPair(first.renewalToken);
    await renewPair(second.renewalToken);
    await renewPair(first.renewalToken).catch(() => undefined);

    const rows = await db()
      .select()
      .from(renewalTokens)
      .where(eq(renewalTokens.familyId, first.familyId));

    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.revokedAt).not.toBeNull();
  });

  it('leaves OTHER families untouched', async () => {
    // A theft on the phone must not sign the player out of their desktop.
    const compromised = await issuePair(accountId);
    const healthy = await issuePair(accountId);

    const second = await renewPair(compromised.renewalToken);
    await renewPair(second.renewalToken);
    await renewPair(compromised.renewalToken).catch(() => undefined);

    await expect(renewPair(healthy.renewalToken)).resolves.toBeDefined();
  });
});

describe('case 4 — an expired or unknown token is refused', () => {
  it('refuses a token that was never issued', async () => {
    expect(await reasonOf(() => renewPair('not-a-real-token'))).toBe('unknown');
  });

  it('refuses an expired token', async () => {
    const pair = await issuePair(accountId);
    await db()
      .update(renewalTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(renewalTokens.familyId, pair.familyId));

    expect(await reasonOf(() => renewPair(pair.renewalToken))).toBe('expired');
  });

  it('does not distinguish unknown from expired to the caller', async () => {
    // The named reason is for logs and tests. What reaches a client is 401 and
    // nothing else — telling it "that token existed but expired" is an oracle.
    const pair = await issuePair(accountId);
    await db()
      .update(renewalTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(renewalTokens.familyId, pair.familyId));

    for (const token of [pair.renewalToken, 'never-existed']) {
      const err = await renewPair(token).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TokenRejectedError);
      expect((err as TokenRejectedError).status).toBe(401);
    }
  });
});

describe('revocation', () => {
  it('kills the whole family and is idempotent', async () => {
    const pair = await issuePair(accountId);

    await revokeFamily(pair.renewalToken);
    expect(await reasonOf(() => renewPair(pair.renewalToken))).toBe('revoked');

    // Signing out twice is not an error — a client retrying must not see a 4xx.
    await expect(revokeFamily(pair.renewalToken)).resolves.toBeUndefined();
  });

  it('ignores an unknown token rather than reporting on it', async () => {
    // Revoking a token that does not exist tells an attacker nothing, and a
    // 404 here would be a way to probe which tokens are real.
    await expect(revokeFamily('never-existed')).resolves.toBeUndefined();
  });
});
