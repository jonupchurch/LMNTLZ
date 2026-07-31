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
/**
 * **The third set, and it was sitting there unused** (019 US2).
 *
 * `resources/damage-types/` has held two variants of all nine forces since the
 * icon pass, and nothing copied them — so the client had hero emblems, status
 * pips, and no way at all to draw a Force. Every screen fell back to a coloured
 * dot, which is the one channel a player who cannot separate the nine colours
 * has no access to.
 */
const TYPE_SRC = root('resources/damage-types');
const HERO_DEST = root('apps/client/src/assets/icons/hero');
const STATUS_DEST = root('apps/client/src/assets/icons/status');
const TYPE_DEST = root('apps/client/src/assets/icons/type');
const OUT = root('apps/client/src/components/icons/icons.generated.ts');
const ROSTER = root('packages/content/src/heroes.generated.ts');
const TYPES = root('packages/content/src/types.ts');

/** Not a hero. Named exactly, never pattern-matched — see the header. */
const NOT_A_HERO = new Set(['00-overview-3x9.svg']);

/** Not a force. Same rule, same reason: an exact name, never a pattern. */
const NOT_A_TYPE = new Set(['00-overview.svg']);

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

/**
 * The nine forces, read out of `types.ts` rather than typed here.
 *
 * Same call as `roster()` above and for the same reason — the list is authored
 * once in `@lmntlz/content`, and a copy in a build tool is a second source of
 * truth for the one thing Constitution XV says must not have one.
 */
function forces(): string[] {
  const text = readFileSync(TYPES, 'utf8');
  const found: string[] = [];
  for (const block of ['MAGIC_TYPES', 'MELEE_TYPES']) {
    const match = text.match(new RegExp(`${block}[^=]*=\\s*Object\\.freeze\\(\\[([^\\]]*)\\]`));
    if (!match) {
      note(`could not parse ${block} out of ${TYPES} — the shape changed`);
      continue;
    }
    for (const name of match[1]!.matchAll(/'([a-z]+)'/g)) found.push(name[1]!);
  }
  if (found.length !== 9) note(`parsed ${found.length} forces, expected 9`);
  return found;
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

/**
 * Both variants of every force, checked against the authored list.
 *
 * `resources/damage-types/README.md` is explicit about which is which:
 * `type-*` is the bare glyph with a keyline, `badge-*` is the same glyph in a
 * dark disc ringed in the force colour — *"use this for damage callouts on a
 * hero: it holds its shape against portrait art and reads down to ~20px"*.
 * Both ship, because a screen with portraits needs one and a flat panel the
 * other.
 */
const typeFiles = new Set(svgsIn(TYPE_SRC).filter((f) => !NOT_A_TYPE.has(f)));
const typeRows: { force: string; variant: 'glyph' | 'badge'; ident: string; file: string }[] = [];
for (const force of forces()) {
  for (const [variant, prefix] of [
    ['glyph', 'type'],
    ['badge', 'badge'],
  ] as const) {
    const file = `${prefix}-${force}.svg`;
    if (!typeFiles.has(file)) {
      note(`force ${force} has no ${variant} icon — expected ${file}`);
      continue;
    }
    typeFiles.delete(file);
    typeRows.push({ force, variant, ident: `${variant}${pascal(force)}`, file });
  }
}
for (const orphan of typeFiles) note(`orphan type icon with no matching force: ${orphan}`);

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
for (const dir of [HERO_DEST, STATUS_DEST, TYPE_DEST]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
for (const row of heroRows) copyFileSync(join(HERO_SRC, row.file), join(HERO_DEST, row.file));
for (const row of statusRows) copyFileSync(join(STATUS_SRC, row.file), join(STATUS_DEST, row.file));
for (const row of typeRows) copyFileSync(join(TYPE_SRC, row.file), join(TYPE_DEST, row.file));

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
const typeImports = typeRows
  .map((r) => `import ${r.ident} from '../../assets/icons/type/${r.file}';`)
  .join('\n');

const heroEntries = heroRows.map((r) => `  ${r.id}: ${r.ident},`).join('\n');
const statusEntries = statusRows.map((r) => `  '${r.key}': ${r.ident},`).join('\n');
const statusKeys = statusRows.map((r) => `  '${r.key}',`).join('\n');
const glyphEntries = typeRows
  .filter((r) => r.variant === 'glyph')
  .map((r) => `  ${r.force}: ${r.ident},`)
  .join('\n');
const badgeEntries = typeRows
  .filter((r) => r.variant === 'badge')
  .map((r) => `  ${r.force}: ${r.ident},`)
  .join('\n');

writeFileSync(
  OUT,
  `${BANNER}
import type { DamageType, HeroId } from '@lmntlz/content';

${heroImports}

${statusImports}

${typeImports}

export const HERO_ICONS: Record<HeroId, string> = {
${heroEntries}
};

/**
 * The bare glyph, keylined so it survives a coloured ground. Flat panels.
 *
 * \`Record<DamageType, string>\` over the nine-force union, so a force without
 * an icon is a COMPILE ERROR — the same guarantee HERO_ICONS gives.
 */
export const TYPE_ICONS: Record<DamageType, string> = {
${glyphEntries}
};

/** The glyph in a dark disc ringed in the force colour. Over portrait art. */
export const TYPE_BADGES: Record<DamageType, string> = {
${badgeEntries}
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
  `icons:build wrote ${heroRows.length} hero icons, ${statusRows.length} status icons ` +
    `and ${typeRows.length} type icons`,
);
