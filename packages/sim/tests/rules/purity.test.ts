import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **Constitution XII, expressed as an assertion rather than an intention.**
 *
 * This file was written and made to fail before a single rule existed. That
 * ordering is the whole point: a purity test written afterwards gets written to
 * fit whatever got built, and the one line it would have caught is the line
 * somebody added "temporarily".
 *
 * It checks two different things, and both matter:
 *
 *   (a) nothing reachable from `rules/` can consume randomness or read a clock
 *   (b) nothing reachable from the client can reach the resolver or the AI
 *
 * (a) is about the rules being *shared*; (b) is about the seed never leaving the
 * server. A build that satisfies one and not the other is broken.
 */

const here = dirname(fileURLToPath(import.meta.url));
const simRoot = resolve(here, '../..');
const repoRoot = resolve(simRoot, '../..');

// ---------------------------------------------------------------------------
// A minimal module-graph walker
// ---------------------------------------------------------------------------

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const specifiersIn = (source: string): string[] => {
  const found: string[] = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) found.push(match[1]!);
  }
  return found;
};

/** Workspace package name -> the directory its subpath exports resolve inside. */
const WORKSPACE: Record<string, string> = {
  '@lmntlz/content': join(repoRoot, 'packages/content'),
  '@lmntlz/sim': join(repoRoot, 'packages/sim'),
};

const tryFile = (path: string): string | null => {
  for (const candidate of [path, `${path}.ts`, join(path, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
};

const resolveSpecifier = (specifier: string, fromFile: string): string | null => {
  if (specifier.startsWith('.')) {
    const raw = resolve(dirname(fromFile), specifier);
    return tryFile(raw.replace(/\.js$/, '')) ?? tryFile(raw);
  }

  for (const [pkg, dir] of Object.entries(WORKSPACE)) {
    if (specifier === pkg) return tryFile(join(dir, 'src')) ?? tryFile(join(dir, 'index.ts'));
    if (specifier.startsWith(`${pkg}/`)) {
      const sub = specifier.slice(pkg.length + 1);
      return tryFile(join(dir, sub)) ?? tryFile(join(dir, 'src', sub));
    }
  }

  return null; // node: builtin or third-party — not part of our graph
};

interface GraphNode {
  readonly file: string;
  readonly source: string;
  readonly specifiers: readonly string[];
}

/** Every first-party file reachable from `entry`, transitively. */
function walk(entry: string): Map<string, GraphNode> {
  const seen = new Map<string, GraphNode>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;

    const source = readFileSync(file, 'utf8');
    const specifiers = specifiersIn(source);
    seen.set(file, { file, source, specifiers });

    for (const specifier of specifiers) {
      const resolved = resolveSpecifier(specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const relative = (file: string): string => file.slice(repoRoot.length + 1).replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// (a) No entropy, no clock  (T007)
// ---------------------------------------------------------------------------

/**
 * Every way a JavaScript module can become non-deterministic without importing
 * anything. A rule that reads any of these stops being a pure function of its
 * arguments, and the client and server stop agreeing.
 */
const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bMath\s*\.\s*random\b/, what: 'Math.random' },
  { pattern: /\bgetRandomValues\b/, what: 'crypto.getRandomValues' },
  { pattern: /\brandomUUID\b/, what: 'crypto.randomUUID' },
  { pattern: /\bDate\s*\.\s*now\b/, what: 'Date.now' },
  { pattern: /\bnew\s+Date\b/, what: 'new Date' },
  { pattern: /\bperformance\s*\.\s*now\b/, what: 'performance.now' },
  { pattern: /\bprocess\s*\.\s*hrtime\b/, what: 'process.hrtime' },
  { pattern: /\bnode:crypto\b/, what: 'node:crypto' },
];

describe('the rules half is pure', () => {
  const graph = walk(join(simRoot, 'rules/index.ts'));

  it('reaches at least the whole rules directory', () => {
    // A walker that silently resolved nothing would pass every test below.
    expect(graph.size).toBeGreaterThan(5);
  });

  it('reaches no source of randomness or time, at any depth', () => {
    const violations: string[] = [];

    for (const node of graph.values()) {
      const code = stripComments(node.source);
      for (const { pattern, what } of FORBIDDEN) {
        if (pattern.test(code)) violations.push(`${relative(node.file)} uses ${what}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('never imports the resolver or the AI', () => {
    const violations: string[] = [];

    for (const node of graph.values()) {
      for (const specifier of node.specifiers) {
        if (/\/resolver\b|\/ai\b|@lmntlz\/sim\/(resolver|ai)/.test(specifier)) {
          violations.push(`${relative(node.file)} imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Scoped to `rules/` itself, not the transitive graph.
   *
   * `@lmntlz/content` depends on `zod`, and that is content's business — it is
   * an isomorphic validation library that both sides already ship. What matters
   * here is that the *rules* stay reachable from a browser with nothing but
   * content behind them, so a new third-party import in this directory is the
   * thing worth catching.
   *
   * The two checks above are deliberately NOT scoped this way: entropy and a
   * resolver import are dangerous at any depth, in anybody's package.
   */
  it('adds no third-party dependency of its own', () => {
    const allowed = /^(@lmntlz\/content|\.{1,2}\/|node:)/;
    const violations: string[] = [];

    for (const node of graph.values()) {
      if (!relative(node.file).startsWith('packages/sim/rules/')) continue;

      for (const specifier of node.specifiers) {
        if (!allowed.test(specifier)) {
          violations.push(`${relative(node.file)} imports "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) The client cannot reach the resolver  (T007b)
// ---------------------------------------------------------------------------

describe('the client cannot reach the resolver or the AI', () => {
  const clientDir = join(repoRoot, 'apps/client');

  const clientExists = (): boolean => {
    try {
      return statSync(clientDir).isDirectory();
    } catch {
      return false;
    }
  };

  const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  it('holds — checked at every depth, or recorded as not-yet-applicable', () => {
    if (!clientExists()) {
      // `apps/client` arrives with feature 006. Asserting the package.json
      // export map instead is not a substitute for the graph walk, but it IS
      // the property that makes the graph walk pass later: there is no root
      // export, so nobody can reach the resolver through a barrel file.
      const manifest = JSON.parse(
        readFileSync(join(simRoot, 'package.json'), 'utf8'),
      ) as { exports: Record<string, string> };

      expect(Object.keys(manifest.exports).sort()).toEqual(['./ai', './resolver', './rules']);
      expect(manifest.exports['.']).toBeUndefined();
      return;
    }

    const violations: string[] = [];
    for (const file of sourceFiles(clientDir)) {
      const graph = walk(file);
      for (const node of graph.values()) {
        for (const specifier of node.specifiers) {
          if (/@lmntlz\/sim\/(resolver|ai)/.test(specifier)) {
            violations.push(`${relative(file)} reaches ${specifier} via ${relative(node.file)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (c) No exported function decides an outcome  (T009)
// ---------------------------------------------------------------------------

describe('no rule returns an outcome', () => {
  /**
   * The distinction this protects is the entire architecture: `rules` answers
   * *"what are the odds"* and `resolver` answers *"what happened"*. A function
   * here returning `hit: boolean` would be the resolver, living on the client,
   * with the seed one refactor away.
   */
  const OUTCOME_SHAPED = [
    /\bhit\s*:\s*boolean\b/,
    /\bmissed\s*:\s*boolean\b/,
    /\bcrit\s*:\s*boolean\b/,
    /\bcritted\s*:\s*boolean\b/,
    /\bdidHit\b/,
    /\blanded\s*:\s*boolean\b/,
  ];

  it('declares no boolean hit, miss or crit result anywhere in rules/', () => {
    const graph = walk(join(simRoot, 'rules/index.ts'));
    const violations: string[] = [];

    for (const node of graph.values()) {
      const code = stripComments(node.source);
      for (const pattern of OUTCOME_SHAPED) {
        if (pattern.test(code)) {
          violations.push(`${relative(node.file)} declares ${pattern.source}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
