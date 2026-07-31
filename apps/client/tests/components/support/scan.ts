/**
 * Source-scanning helpers shared by the component suites (017 T006, T016, T017).
 *
 * Not a `.test.ts`, so the `components` project's `include` glob does not
 * collect it — it is a helper, and a helper that reported "0 tests" would be
 * one more thing that looks like a pass.
 *
 * **These live in one file on purpose.** Three suites forbid three different
 * patterns and all three need the same comment-stripping. Three private copies
 * would drift, and the subtle one — sparing `://` so a URL is not truncated —
 * is exactly the kind of detail that gets fixed in one copy and not the others.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Remove `/* *\/` and `//` comments.
 *
 * A scan that forbids a pattern **matches the comment explaining the ban**, so
 * stripping first is mandatory. The `//` rule spares `://` so a URL inside a
 * string survives — otherwise the line is truncated at the protocol and
 * anything after it is invisible to the scan, which is a false *negative* and
 * therefore the more dangerous direction.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every `.ts`/`.tsx` under `dir`, recursively. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Read and strip in one step — the only way these suites should read source. */
export const readStripped = (file: string): string =>
  stripComments(readFileSync(file, 'utf8'));

/**
 * `import.meta.dirname`-based, deliberately.
 *
 * Under jsdom the global `URL` at module-init resolves a relative path against
 * the document base (`http://localhost:3000/`) and ignores a `file://` base, so
 * `fileURLToPath(new URL(rel, import.meta.url))` throws *"The URL must be of
 * scheme file"* at module scope while the identical call inside a function
 * works. Plain string joins have no resolution step to shadow.
 */
export const COMPONENTS_DIR = join(import.meta.dirname, '../../../src/components');
