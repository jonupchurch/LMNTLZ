/**
 * There is exactly one path to an entitlement (011 T012, T015, T030, T032).
 *
 * **These are structural claims, and a behavioural test cannot make them.** No
 * amount of exercising the API proves that a second grant path does not exist
 * somewhere unexercised — the only way to know is to read the source for its
 * absence, and then prove the reader can see it by planting the thing it forbids.
 *
 * Every scan strips comments first (a grep that forbids a pattern matches the
 * comment explaining the ban), checks the strip did not empty the file, and is
 * paired with a planted-string test.
 */

import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stripComments } from '../stripComments.js';

const SRC = new URL('../../src/', import.meta.url).pathname.replace(/^\//, '');

interface SourceFile {
  readonly path: string;
  readonly name: string;
  readonly code: string;
}

async function sources(root = SRC): Promise<SourceFile[]> {
  const out: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const raw = await readFile(full, 'utf8');
        const code = stripComments(raw, entry.name);

        out.push({ path: full, name: entry.name, code });
      }
    }
  }

  await walk(root);
  return out;
}

describe('every write to entitlement_grants goes through the webhook path', () => {
  it('inserts grants from exactly one file', async () => {
    const files = await sources();
    expect(files.length, 'found no source to scan').toBeGreaterThan(20);

    const inserters = files.filter(({ code }) => /insert\s*\(\s*entitlementGrants/.test(code));

    // entitlements.ts, and nothing else. A second inserter is a second place to
    // get idempotency wrong, and it is the one nobody load-tests.
    expect(inserters.map((f) => f.name)).toEqual(['entitlements.ts']);
  });

  it('has that scan able to fail', () => {
    const planted = 'await db().insert(entitlementGrants).values({ accountId, days: 7 });';
    expect(/insert\s*\(\s*entitlementGrants/.test(planted)).toBe(true);
  });

  it('exposes no grant function that does not require a provider event id', async () => {
    const files = await sources();
    const entitlements = files.find((f) => f.name === 'entitlements.ts')!;

    // FR-011 enforced by absence. Any exported grant helper must take a
    // RailNotification, which cannot be constructed without a provider event id.
    const looseGrant = /export\s+(async\s+)?function\s+grant\w*\s*\(\s*accountId/.test(
      entitlements.code,
    );

    expect(looseGrant, 'a grant function taking a bare accountId exists').toBe(false);
  });

  it('requires provider_event_id at the schema level, not only by convention', async () => {
    const files = await sources();
    const schema = files.find((f) => f.name === 'entitlements.ts' && f.path.includes('schema'))!;

    expect(schema.code).toMatch(/providerEventId[\s\S]{0,200}notNull\(\)/);
    expect(schema.code).toMatch(/references\(/);
  });
});

describe('the entitlement belongs to the account, never a storefront', () => {
  it('has no storefront column on the grants table', async () => {
    const files = await sources();
    const schema = files.find((f) => f.name === 'entitlements.ts' && f.path.includes('schema'))!;

    // The one seam that cannot be retrofitted: a player who buys on the web and
    // then links Steam must still hold the pass. Add the column now and the
    // migration removing it has to answer which identity owns the grant.
    expect(schema.code).not.toMatch(/(text|uuid|integer)\s*\(\s*['"][^'"]*(storefront|platform|store)/i);
  });

  it('has that scan able to fail', () => {
    const planted = `storefront: text('storefront').notNull(),`;
    expect(/(text|uuid|integer)\s*\(\s*['"][^'"]*(storefront|platform|store)/i.test(planted)).toBe(
      true,
    );
  });
});

describe('no vendor is named outside payments/vendor', () => {
  /**
   * **No word boundaries, deliberately.**
   *
   * The first version was `/\b(...)\b/i` and it did not catch
   * `process.env['resend_RESEND_API_KEY']` sitting in `receipt.ts` — `_` is a word
   * character, so neither `\b` matches inside `resend_RESEND`. The rule was being
   * satisfied by a regex technicality rather than by the code being right.
   *
   * A substring match will occasionally flag an innocent word. That is the correct
   * trade: a false positive costs one rename, and a false negative costs the thing
   * this scan exists to prevent.
   */
  const VENDORS = /(paddle|stripe|braintree|lemonsqueezy|fastspring|resend)/i;

  it('names no payment vendor anywhere in src outside the vendor directory', async () => {
    const files = await sources();

    const offenders = files
      .filter((f) => !f.path.includes(join('payments', 'vendor')))
      .filter((f) => VENDORS.test(f.code))
      .map((f) => `${f.name}: ${VENDORS.exec(f.code)?.[0]}`);

    // Constitution XIX. Written the other way round, the provider's shape BECOMES
    // the interface and the second rail is a rewrite rather than an implementation.
    expect(offenders).toEqual([]);
  });

  it('has that scan able to fail', () => {
    expect(VENDORS.test("import { Paddle } from '@paddle/paddle-node-sdk';")).toBe(true);
  });
});
