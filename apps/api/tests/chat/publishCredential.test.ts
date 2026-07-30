/**
 * **No client can ever publish** (014 T018, SC-001, FR-008).
 *
 * ### Why this is a source scan and not a request
 *
 * You cannot write a runtime test that proves a capability *does not exist*. A
 * test that connects and fails to publish proves one broker rejected one attempt
 * with one token — it says nothing about the method somebody adds next quarter
 * that mints a publishing credential "just for the admin console". The property
 * worth defending is that **the capability is not nameable in this codebase**,
 * and the only way to check that is to read the codebase.
 *
 * ### The stakes are money, not tidiness
 *
 * Some postings cost shards. A client holding a publish-capable credential puts a
 * message in front of every subscriber without touching the route that charges
 * for it, and there is no reconciliation that gets the shard back afterwards.
 *
 * ### Scanning code, not prose
 *
 * Comments are stripped before the scan. This repo has hit the opposite bug six
 * times — a scan that forbids a pattern matching the comment explaining the ban —
 * most recently in `packages/sim/tests/rules/purity.test.ts`, where a JSDoc
 * sentence was reported as a third-party import. And the strip is itself checked,
 * because a strip that ate the file would make every assertion below vacuous.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = resolve(here, '../../src');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = walk(apiSrc);
const stripped = new Map(files.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));
const relative = (f: string): string => f.slice(resolve(here, '../..').length + 1).replace(/\\/g, '/');

describe('the broker only fans out', () => {
  it('scanned a real tree, and the strip did not eat it', () => {
    // Every assertion below is an ABSENCE. If the scan read nothing, or the
    // strip emptied every file, they would all pass and prove nothing.
    expect(files.length).toBeGreaterThan(50);

    // Compared on a normalised path: on Windows these are backslashes, and an
    // `endsWith('chat/transport.ts')` matched nothing at all — which is exactly
    // the vacuum this test exists to catch.
    const transport = [...stripped].find(([f]) => relative(f).endsWith('src/chat/transport.ts'));
    expect(transport, 'chat/transport.ts was not scanned').toBeDefined();
    // Real code survived the strip — a declaration the comments never contain.
    expect(transport![1]).toContain('subscribeToken');
    expect(transport![1]).toContain('export class InMemoryBroker');
  });

  it('names no publish credential anywhere in apps/api/src', () => {
    /**
     * The three shapes this would actually take. Deliberately not a single
     * loose `/publish/` — `publish` itself is legitimate and load-bearing; it
     * is *ours*, called server-side inside `send`, after the charge.
     */
    const forbidden = [
      { pattern: /\bmintPublish\w*/, what: 'mintPublish*' },
      { pattern: /\bpublishToken\b/, what: 'publishToken' },
      { pattern: /\bpublishCredential\b/, what: 'publishCredential' },
      { pattern: /\bpublishGrant\b/, what: 'publishGrant' },
      { pattern: /capability\s*[:=][^\n]*publish/i, what: 'a publish capability' },
      { pattern: /\bcanPublish\b/, what: 'canPublish' },
    ];

    const violations: string[] = [];
    for (const [file, source] of stripped) {
      for (const { pattern, what } of forbidden) {
        if (pattern.test(source)) violations.push(`${relative(file)} names ${what}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('gives the RealtimeBroker interface no method that returns a writable grant', () => {
    const source = stripped.get(join(apiSrc, 'chat', 'transport.ts'));
    expect(source).toBeDefined();

    // The interface body, so a helper elsewhere in the file cannot mask this.
    const match = /export interface RealtimeBroker \{([\s\S]*?)\n\}/.exec(source!);
    expect(match, 'RealtimeBroker interface not found — has it been renamed?').not.toBeNull();

    const body = match![1]!;
    const methods = [...body.matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]!);

    // Exactly three, and each one is named here so ADDING one fails this test
    // rather than sliding in under a wildcard.
    expect([...methods].sort()).toEqual(['notifyStale', 'publish', 'subscribeToken']);
  });

  it('hands the client a token from subscribeToken and from nowhere else', () => {
    const tokens = stripped.get(join(apiSrc, 'chat', 'tokens.ts'));
    expect(tokens).toBeDefined();

    expect(tokens!).toContain('subscribeToken');
    // The route layer must go through mintChatToken, never the broker directly.
    for (const [file, source] of stripped) {
      if (!file.includes('chat')) continue;
      if (file.endsWith('tokens.ts') || file.endsWith('transport.ts')) continue;
      expect(source, `${relative(file)} reaches the broker directly`).not.toMatch(
        /broker\(\)\s*\.\s*subscribeToken/,
      );
    }
  });
});
