/**
 * `pnpm icons:build` — copy the design system's SVGs into the client and emit a
 * typed manifest (017 T033, T034, T035).
 *
 * Sibling of `tools/build-content.ts` and deliberately the same shape: read
 * authored sources, verify them, write a GENERATED file, and **fail loudly**
 * rather than emitting something half-right. CI re-runs it and diffs the
 * result, exactly as it does for `heroes.generated.ts`.
 *
 * ### What makes a missing icon a build error
 *
 * `HERO_ICONS` is typed `Record<HeroId, string>`, and `HeroId` is the literal
 * union of the 27 ids generated with the roster. An exhaustive record over a
 * closed union means a hero without an icon **does not compile** — `tsc
 * --noEmit` already runs before `vite build`, so it cannot reach a bundle.
 * That is FR-010, and it is why the union exists at all: `Hero['id']` is
 * `string`, and `Record<string, T>` would happily accept a blank square.
 *
 * ### The overview sheet is excluded BY NAME
 *
 * `00-overview-3x9.svg` is a 3×9 contact sheet, not a hero. It is skipped by
 * its exact filename rather than by a `^\d+-` pattern, because that pattern
 * would also swallow a genuinely misnamed hero icon and turn a loud failure
 * into a silent one (T034).
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

const HERO_SRC = root('resources/designsystem/hero-icons');
const STATUS_SRC = root('resources/designsystem/status-icons');
const HERO_DEST = root('apps/client/src/assets/icons/hero');
const STATUS_DEST = root('apps/client/src/assets/icons/status');
const OUT = root('apps/client/src/components/icons/icons.generated.ts');
const ROSTER = root('packages/content/src/heroes.generated.ts');

/** Not a hero. Named exactly, never pattern-matched — see the header. */
const NOT_A_HERO = new Set(['00-overview-3x9.svg']);

const problems: string[] = [];
const note = (m: string): void => {
  problems.push(m);
};

// ---------------------------------------------------------------------------
// The roster, read as text
// ---------------------------------------------------------------------------

/**
 * Parsed out of the generated file rather than imported.
 *
 * Importing `@lmntlz/content` would make this tool depend on the package being
 * built, and `icons:build` has to run in a clean checkout before anything is
 * compiled. The roster file is generated and its shape is stable, so reading
 * the two fields needed is cheaper than a build ordering constraint.
 */
function roster(): { id: string; slug: string }[] {
  const text = readFileSync(ROSTER, 'utf8');
  const entries = [...text.matchAll(/"id":"(h\d+)","name":"[^"]*","slug":"([^"]+)"/g)];
  if (entries.length === 0) {
    note(`parsed 0 heroes out of ${ROSTER} — the generated shape changed`);
  }
  return entries.map((m) => ({ id: m[1]!, slug: m[2]! }));
}

/** `01-earth-bramwen` → `earth-bramwen`. The ordinal is sort order, not identity. */
const iconStem = (slug: string): string => slug.replace(/^\d+-/, '');

/**
 * `earth-bramwen` → `EarthBramwen`, a legal identifier suffix.
 *
 * Pascal rather than camel because every use is prefixed (`hero…`, `status…`),
 * and `heroearthBramwen` is unreadable in a file whose whole job is to be read
 * by whoever is debugging a missing icon.
 */
const pascal = (stem: string): string =>
  stem.replace(/(^|[^a-z0-9]+)([a-z0-9])/gi, (_, __, c: string) => c.toUpperCase());

const svgsIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .sort();

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const heroes = roster();
const heroFiles = new Set(svgsIn(HERO_SRC).filter((f) => !NOT_A_HERO.has(f)));

const heroRows: { id: string; ident: string; file: string }[] = [];
for (const hero of heroes) {
  const file = `${iconStem(hero.slug)}.svg`;
  if (!heroFiles.has(file)) {
    note(`hero ${hero.id} (${hero.slug}) has no icon — expected ${file}`);
    continue;
  }
  heroFiles.delete(file);
  heroRows.push({ id: hero.id, ident: `hero${pascal(iconStem(hero.slug))}`, file });
}

/** Anything left over is an icon no hero claims — a rename that half-landed. */
for (const orphan of heroFiles) {
  note(`orphan hero icon with no matching hero: ${orphan}`);
}

const statusFiles = svgsIn(STATUS_SRC);
if (statusFiles.length === 0) note(`no status icons found in ${STATUS_SRC}`);

const statusRows = statusFiles.map((file) => {
  const stem = file.replace(/\.svg$/, '');
  return { key: stem, ident: `status${pascal(stem)}`, file };
});

if (problems.length > 0) {
  console.error('icons:build failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

// --- copy ------------------------------------------------------------------

/**
 * The destination is cleared first. Without it a renamed icon leaves its old
 * copy behind, the manifest stops referencing it, and the stale file ships
 * forever — invisible, because nothing points at it.
 */
for (const dir of [HERO_DEST, STATUS_DEST]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
for (const row of heroRows) copyFileSync(join(HERO_SRC, row.file), join(HERO_DEST, row.file));
for (const row of statusRows) copyFileSync(join(STATUS_SRC, row.file), join(STATUS_DEST, row.file));

// --- emit ------------------------------------------------------------------

const BANNER = `// GENERATED by tools/build-icons.ts from resources/designsystem/.
// DO NOT EDIT. Run \`pnpm icons:build\` and commit the result.
//
// HERO_ICONS is Record<HeroId, string> over the 27-id literal union, so a hero
// without an icon is a COMPILE ERROR rather than a blank square (FR-010).
`;

const heroImports = heroRows
  .map((r) => `import ${r.ident} from '../../assets/icons/hero/${r.file}';`)
  .join('\n');
const statusImports = statusRows
  .map((r) => `import ${r.ident} from '../../assets/icons/status/${r.file}';`)
  .join('\n');

const heroEntries = heroRows.map((r) => `  ${r.id}: ${r.ident},`).join('\n');
const statusEntries = statusRows.map((r) => `  '${r.key}': ${r.ident},`).join('\n');
const statusKeys = statusRows.map((r) => `  '${r.key}',`).join('\n');

writeFileSync(
  OUT,
  `${BANNER}
import type { HeroId } from '@lmntlz/content';

${heroImports}

${statusImports}

export const HERO_ICONS: Record<HeroId, string> = {
${heroEntries}
};

export const STATUS_ICON_KEYS = Object.freeze([
${statusKeys}
] as const);

export type StatusIconKey = (typeof STATUS_ICON_KEYS)[number];

export const STATUS_ICONS: Record<StatusIconKey, string> = {
${statusEntries}
};
`,
  'utf8',
);

console.log(
  `icons:build wrote ${heroRows.length} hero icons and ${statusRows.length} status icons`,
);
