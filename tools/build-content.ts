/**
 * Build `packages/content` from the authored workbook.
 *
 * `resources/characters/hero-stats.xlsx` is the single authored source. This
 * script **only ever reads it** — the five scripts that used to write to it were
 * deleted in T008, and nothing may reintroduce one (FR-018).
 *
 * Emits, all committed:
 *   packages/content/src/heroes.generated.ts   the roster       (T025)
 *   packages/content/src/version.generated.ts  the content stamp (T035)
 *   resources/characters/MATCHUPS.md           the roster of record (T026)
 *
 * Run with `pnpm content:build`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

import { family, DAMAGE_TYPES } from '../packages/content/src/types.js';
import type { DamageType } from '../packages/content/src/types.js';
import { derive } from '../packages/content/src/derive.js';
import {
  STAT_KEYS,
  authoredHeroSchema,
  checkRosterRules,
  statBudgetFor,
  type AuthoredHero,
  type Role,
  type ValidationFailure,
} from '../packages/content/src/schema.js';

const root = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

const WORKBOOK = root('resources/characters/hero-stats.xlsx');
const OVERLAY = root('tools/power-targeting.json');
const OUT_HEROES = root('packages/content/src/heroes.generated.ts');
const OUT_VERSION = root('packages/content/src/version.generated.ts');
const OUT_MATCHUPS = root('resources/characters/MATCHUPS.md');

// ---------------------------------------------------------------------------
// Failing loudly
// ---------------------------------------------------------------------------

class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildError';
  }
}

const problems: string[] = [];
const note = (message: string): void => {
  problems.push(message);
};

// ---------------------------------------------------------------------------
// Header-keyed column access (T022)
// ---------------------------------------------------------------------------

/**
 * Resolve every column by its header string, once, at load.
 *
 * **Never index a column by position.** Inserting a column in the workbook is a
 * thing a designer does without thinking, and a positional reader answers that
 * by silently reading the wrong field — a stat becomes a different stat and
 * every number downstream is wrong but plausible. A header miss throws instead.
 */
class Sheet {
  private readonly columns: ReadonlyMap<string, number>;

  constructor(
    private readonly sheet: ExcelJS.Worksheet,
    readonly name: string,
  ) {
    const columns = new Map<string, number>();
    this.sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
      const header = String(cell.value ?? '').trim();
      if (header !== '') columns.set(header, index);
    });
    this.columns = columns;
  }

  /** Exact header match. Throws on a miss, naming the sheet and what it does have. */
  column(header: string): number {
    const index = this.columns.get(header);
    if (index === undefined) {
      throw new BuildError(
        `sheet "${this.name}": no column headed "${header}". Headers present: ` +
          [...this.columns.keys()].map((h) => `"${h}"`).join(', '),
      );
    }
    return index;
  }

  /**
   * Prefix match, returning every hit in column order.
   *
   * Used for the six power columns (T023). The first of them is headed
   * `"Power 0 — auto"` with a **non-ASCII em dash**, so an exact-match list
   * would need that character typed correctly in the source — which is exactly
   * the kind of thing that works on the machine it was written on.
   */
  columnsStartingWith(prefix: string): { header: string; index: number }[] {
    return [...this.columns.entries()]
      .filter(([header]) => header.startsWith(prefix))
      .map(([header, index]) => ({ header, index }))
      .sort((a, b) => a.index - b.index);
  }

  headers(): readonly string[] {
    return [...this.columns.keys()];
  }

  /** Every row with something in `keyColumn`, skipping the header. */
  *rows(keyColumn: number): Generator<{ row: ExcelJS.Row; number: number }> {
    for (let n = 2; n <= this.sheet.rowCount; n++) {
      const row = this.sheet.getRow(n);
      const key = row.getCell(keyColumn).value;
      if (key === null || key === undefined || String(key).trim() === '') continue;
      yield { row, number: n };
    }
  }
}

const sheetOf = (wb: ExcelJS.Workbook, name: string): Sheet => {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    throw new BuildError(
      `workbook has no sheet "${name}". Sheets present: ` +
        wb.worksheets.map((w) => `"${w.name}"`).join(', '),
    );
  }
  return new Sheet(ws, name);
};

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

const text = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v.richText as { text: string }[]).map((t) => t.text).join('').trim();
  }
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
};

const isBlank = (cell: ExcelJS.Cell): boolean => text(cell) === '';

const number = (cell: ExcelJS.Cell, where: string): number => {
  const raw = text(cell);
  const n = Number(raw);
  if (raw === '' || Number.isNaN(n)) {
    throw new BuildError(`${where}: expected a number, got "${raw}"`);
  }
  return n;
};

/** `"Earth"` -> `earth`. Rejects anything not one of the nine. */
const damageType = (raw: string, where: string): DamageType => {
  const normalized = raw.trim().toLowerCase();
  if (!(DAMAGE_TYPES as readonly string[]).includes(normalized)) {
    throw new BuildError(
      `${where}: "${raw}" is not a damage type (expected one of ${DAMAGE_TYPES.join(', ')})`,
    );
  }
  return normalized as DamageType;
};

const ROLES: Record<string, Role> = {
  striker: 'striker',
  tank: 'tank',
  ranged: 'ranged',
  buffer: 'buffer',
};

const role = (raw: string, where: string): Role => {
  const found = ROLES[raw.trim().toLowerCase()];
  if (!found) throw new BuildError(`${where}: "${raw}" is not a role`);
  return found;
};

// ---------------------------------------------------------------------------
// Power List (T023, T040)
// ---------------------------------------------------------------------------

interface PowerDef {
  readonly name: string;
  readonly tier: 0 | 1 | 2 | 3 | 4 | 5;
  readonly multiplier: number | null;
  readonly cooldown: number;
  readonly types: readonly [DamageType] | readonly [DamageType, DamageType];
}

/** `"0 — auto"` -> 0, `"4"` -> 4, `"passive"` -> null. */
const parseTier = (raw: string): 0 | 1 | 2 | 3 | 4 | 5 | null => {
  if (raw.trim().toLowerCase() === 'passive') return null;
  const match = /^(\d)/.exec(raw.trim());
  if (!match) throw new BuildError(`Power List: cannot read tier from "${raw}"`);
  const tier = Number(match[1]);
  if (tier < 0 || tier > 5) throw new BuildError(`Power List: tier ${tier} out of range`);
  return tier as 0 | 1 | 2 | 3 | 4 | 5;
};

/** `04-turns.md`: tier 4 gates at turn 3, tier 5 at turn 5, everything else at 1. */
const gateTurnFor = (tier: number): number => (tier === 4 ? 3 : tier === 5 ? 5 : 1);

const parseElements = (
  raw: string,
  where: string,
): readonly [DamageType] | readonly [DamageType, DamageType] => {
  const parts = raw
    .split(/[·/,]/)
    .map((p) => p.trim())
    .filter((p) => p !== '');

  if (parts.length === 1) return [damageType(parts[0]!, where)] as const;
  if (parts.length === 2) {
    return [damageType(parts[0]!, where), damageType(parts[1]!, where)] as const;
  }
  throw new BuildError(`${where}: expected one or two types, got "${raw}"`);
};

interface PowerList {
  readonly actives: ReadonlyMap<string, PowerDef>;
  readonly passives: ReadonlySet<string>;
}

function readPowerList(wb: ExcelJS.Workbook): PowerList {
  const sheet = sheetOf(wb, 'Power List');
  const cName = sheet.column('Power');
  const cTier = sheet.column('Tier');
  const cElements = sheet.column('Elements');
  const cMultiplier = sheet.column('Power Multiplier');
  const cCooldown = sheet.column('Cooldown');

  const actives = new Map<string, PowerDef>();
  const passives = new Set<string>();

  for (const { row, number: n } of sheet.rows(cName)) {
    const name = text(row.getCell(cName));
    const where = `Power List row ${n} ("${name}")`;
    const tier = parseTier(text(row.getCell(cTier)));

    if (tier === null) {
      // A passive. It carries no cooldown and no multiplier, and that is correct
      // rather than missing (T023).
      if (passives.has(name)) note(`${where}: duplicate passive name "${name}"`);
      passives.add(name);
      continue;
    }

    if (actives.has(name)) {
      note(`${where}: duplicate power name "${name}" — power names must be unique (T040)`);
      continue;
    }

    // T023: a blank cooldown is acceptable on a passive and never on an active.
    if (isBlank(row.getCell(cCooldown))) {
      note(`${where}: active power has a blank cooldown — actives must state one in turns`);
      continue;
    }

    const cooldown = number(row.getCell(cCooldown), `${where} cooldown`);

    // A blank multiplier is meaningful: the three powers that deal neither
    // damage nor healing have no multiplier at all. Zero would read as "deals no
    // damage", which is a different and false claim (03-powers.md).
    const multiplier = isBlank(row.getCell(cMultiplier))
      ? null
      : number(row.getCell(cMultiplier), `${where} multiplier`);

    actives.set(name, {
      name,
      tier,
      multiplier,
      cooldown,
      types: parseElements(text(row.getCell(cElements)), `${where} elements`),
    });
  }

  return { actives, passives };
}

// ---------------------------------------------------------------------------
// The authored targeting overlay
// ---------------------------------------------------------------------------

interface Overlay {
  readonly targets: Record<string, 'single' | 'row' | 'party' | number>;
  readonly friendly: readonly string[];
  readonly reactive: readonly string[];
  readonly noDamage: readonly string[];
}

function readOverlay(actives: ReadonlyMap<string, PowerDef>): Overlay {
  const parsed = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay & { $comment?: unknown };

  // The overlay names powers by string, so it is exactly the kind of file that
  // rots silently. Every name in it must exist in the workbook.
  for (const name of [
    ...Object.keys(parsed.targets),
    ...parsed.friendly,
    ...parsed.reactive,
    ...parsed.noDamage,
  ]) {
    if (!actives.has(name)) {
      note(
        `tools/power-targeting.json names "${name}", which is not an active power in ` +
          `the workbook — the overlay has drifted from Power List`,
      );
    }
  }

  return parsed;
}

/**
 * Self-clearing debt.
 *
 * `03-powers.md` says the three powers that deal neither damage nor healing
 * carry a **blank** multiplier — *"zero would read as 'deals no damage', when
 * the truth is that damage is not a thing these powers have."* The workbook
 * gives all three the tier-5 default of 5 instead, which is a live content bug
 * rather than a documentation mismatch.
 *
 * The override keeps the emitted content correct today. The warning fires on
 * every build for as long as the workbook still disagrees, and stops by itself
 * the moment the three cells are blanked — so nobody has to remember to come
 * back and delete this.
 */
function warnOnUnclearedNoDamage(
  overlay: Overlay,
  actives: ReadonlyMap<string, PowerDef>,
): void {
  const stale = overlay.noDamage.filter((name) => actives.get(name)?.multiplier !== null);
  if (stale.length === 0) return;

  console.warn(
    `\n  ! ${stale.length} power(s) specified to deal no damage still carry a multiplier ` +
      `in the workbook:\n` +
      stale
        .map((n) => `      ${n} (multiplier ${String(actives.get(n)?.multiplier)})`)
        .join('\n') +
      `\n    Blank those cells in Power List and this warning stops.\n` +
      `    Until then tools/power-targeting.json overrides them to null.\n`,
  );
}

// ---------------------------------------------------------------------------
// Powers sheet — which six powers and which three passives each hero carries
// ---------------------------------------------------------------------------

interface HeroPowers {
  readonly powerNames: readonly string[];
  readonly passives: readonly [string, string, string];
}

function readHeroPowers(wb: ExcelJS.Workbook): ReadonlyMap<string, HeroPowers> {
  const sheet = sheetOf(wb, 'Powers');
  const cHero = sheet.column('Hero');

  // T023: match by prefix, because the first header carries a non-ASCII em dash.
  const powerColumns = sheet.columnsStartingWith('Power ');
  if (powerColumns.length !== 6) {
    throw new BuildError(
      `sheet "Powers": expected 6 columns starting "Power ", found ${powerColumns.length} ` +
        `(${powerColumns.map((c) => `"${c.header}"`).join(', ')})`,
    );
  }

  const passiveColumns = sheet.columnsStartingWith('Passive');
  if (passiveColumns.length !== 3) {
    throw new BuildError(
      `sheet "Powers": expected 3 columns starting "Passive", found ${passiveColumns.length}`,
    );
  }

  const byHero = new Map<string, HeroPowers>();

  for (const { row, number: n } of sheet.rows(cHero)) {
    const hero = text(row.getCell(cHero));
    const powerNames = powerColumns.map((c) => text(row.getCell(c.index)));
    const passives = passiveColumns.map((c) => text(row.getCell(c.index)));

    for (const [i, name] of powerNames.entries()) {
      if (name === '') note(`Powers row ${n} ("${hero}"): power slot ${i} is blank`);
    }
    for (const [i, name] of passives.entries()) {
      if (name === '') note(`Powers row ${n} ("${hero}"): passive slot ${i} is blank`);
    }

    byHero.set(hero, {
      powerNames,
      passives: passives as unknown as readonly [string, string, string],
    });
  }

  return byHero;
}

// ---------------------------------------------------------------------------
// Hero Stats — the roster
// ---------------------------------------------------------------------------

/** Workbook header -> the stat key it carries. */
const STAT_COLUMNS: Record<string, (typeof STAT_KEYS)[number]> = {
  Might: 'might',
  Perception: 'perception',
  Agility: 'agility',
  Toughness: 'toughness',
  Armor: 'armor',
  Penetration: 'penetration',
  MagicResist: 'magicResist',
  Speed: 'speed',
  Resolve: 'resolve',
  Luck: 'luck',
};

function readHeroes(
  wb: ExcelJS.Workbook,
  powerList: PowerList,
  overlay: Overlay,
  heroPowers: ReadonlyMap<string, HeroPowers>,
): AuthoredHero[] {
  const sheet = sheetOf(wb, 'Hero Stats');
  const cIndex = sheet.column('#');
  const cHero = sheet.column('Hero');
  const cSlug = sheet.column('Slug');
  const cFamily = sheet.column('Family');
  const cPrimary = sheet.column('Primary');
  const cSecondary = sheet.column('Secondary');
  const cBane = sheet.column('Bane (derived)');
  const cFault = sheet.column('Fault (derived)');
  const cRole = sheet.column('Role');
  const cReach = sheet.column('Reach (proposed)');

  const statColumns = Object.entries(STAT_COLUMNS).map(([header, key]) => ({
    key,
    index: sheet.column(header),
    header,
  }));

  const heroes: AuthoredHero[] = [];

  for (const { row, number: n } of sheet.rows(cHero)) {
    const name = text(row.getCell(cHero));
    const where = `Hero Stats row ${n} ("${name}")`;
    const index = number(row.getCell(cIndex), `${where} #`);

    // An opaque, name-free identifier. `slug` carries the readable form; `id`
    // deliberately does not, so a display-name change is a one-column edit
    // rather than a migration (FR-011, and the same shape as `Account.id`).
    const id = `h${String(index).padStart(2, '0')}`;

    const primary = damageType(text(row.getCell(cPrimary)), `${where} Primary`);
    const secondary = damageType(text(row.getCell(cSecondary)), `${where} Secondary`);

    // T024 — the workbook's convenience columns are read as an ASSERTION and
    // never as a source. Reading them as a source would look identical here and
    // be a silent violation of Constitution XV.
    const derived = derive(primary, secondary);
    const assertDerived = (label: string, column: number, expected: DamageType): void => {
      const stated = text(row.getCell(column));
      if (stated === '') return; // an empty convenience column is not a disagreement
      if (stated.toLowerCase() !== expected) {
        note(
          `derived-column-disagrees — hero "${id}" (${name}), field "${label}": the workbook ` +
            `says "${stated}" but ${label} derives to "${expected}" from ` +
            `${label === 'bane' ? `primary=${primary}` : `secondary=${secondary}`}. ` +
            `The workbook column is a convenience; the derivation is the truth.`,
        );
      }
    };
    assertDerived('bane', cBane, derived.bane);
    assertDerived('fault', cFault, derived.fault);

    // `Family` is a convenience column too — "Arcane"/"Martial" for magic/melee.
    const statedFamily = text(row.getCell(cFamily)).toLowerCase();
    const familyAliases: Record<string, string> = {
      arcane: 'magic',
      magic: 'magic',
      martial: 'melee',
      melee: 'melee',
    };
    if (statedFamily !== '' && familyAliases[statedFamily] !== family(primary)) {
      note(
        `derived-column-disagrees — hero "${id}" (${name}), field "family": the workbook ` +
          `says "${statedFamily}" but primary=${primary} is ${family(primary)}`,
      );
    }

    const stats = Object.fromEntries(
      statColumns.map((c) => [c.key, number(row.getCell(c.index), `${where} ${c.header}`)]),
    ) as Record<(typeof STAT_KEYS)[number], number>;

    const heroRole = role(text(row.getCell(cRole)), `${where} Role`);
    const reach = number(row.getCell(cReach), `${where} Reach`);

    const slots = heroPowers.get(name);
    if (!slots) {
      note(`${where}: no row in the "Powers" sheet for this hero`);
      continue;
    }

    const powers = slots.powerNames.map((powerName, slot) => {
      const def = powerList.actives.get(powerName);
      if (!def) {
        // T040 — a hero referencing a power absent from Power List fails naming both.
        throw new BuildError(
          `hero "${id}" (${name}), power slot ${slot}: references "${powerName}", which is ` +
            `not in the "Power List" sheet`,
        );
      }
      return {
        id: powerName,
        name: powerName,
        tier: def.tier,
        // See warnOnUnclearedNoDamage: the workbook currently states a tier-5
        // multiplier for three powers specified to have none at all.
        multiplier: overlay.noDamage.includes(powerName) ? null : def.multiplier,
        cooldown: def.cooldown,
        gateTurn: gateTurnFor(def.tier),
        types: def.types,
        targets: overlay.targets[powerName] ?? 'single',
        friendly: overlay.friendly.includes(powerName),
        reactive: overlay.reactive.includes(powerName),
      };
    });

    heroes.push({
      id,
      name,
      slug: text(row.getCell(cSlug)),
      primary,
      secondary,
      role: heroRole,
      reach: reach as 1 | 2,
      stats,
      powers: powers as unknown as AuthoredHero['powers'],
      passives: slots.passives,
    } as AuthoredHero);
  }

  return heroes;
}

// ---------------------------------------------------------------------------
// Validation that the Zod schema cannot express
// ---------------------------------------------------------------------------

function checkStatBudgets(heroes: readonly AuthoredHero[]): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  for (const hero of heroes) {
    const total = STAT_KEYS.reduce((sum, key) => sum + hero.stats[key], 0);
    const budget = statBudgetFor(hero.primary, hero.role);

    if (total !== budget) {
      failures.push({
        rule: 'stat-budget-violated',
        heroId: hero.id,
        field: 'stats',
        message:
          `hero "${hero.id}" (${hero.name}), field "stats": total is ${total}, ` +
          `expected ${budget} for a ${family(hero.primary)} ${hero.role} ` +
          `(${total > budget ? `+${total - budget}` : total - budget})`,
      });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

const BANNER = `// GENERATED by tools/build-content.ts from resources/characters/hero-stats.xlsx.
// DO NOT EDIT. Run \`pnpm content:build\` and commit the result.
//
// Constitution XV: bane, fault, strengths and family are DERIVED here and are
// not authored anywhere. Editing this file by hand would make the roster and its
// source disagree, and CI diffs it against a fresh build precisely to catch that.
`;

function emitHeroes(heroes: readonly AuthoredHero[]): void {
  const body = heroes
    .map((h) => {
      const d = derive(h.primary, h.secondary);
      return `  ${JSON.stringify({ ...h, ...d })},`;
    })
    .join('\n');

  writeFileSync(
    OUT_HEROES,
    `${BANNER}
import type { Hero } from './hero.js';

export const HEROES: readonly Hero[] = Object.freeze([
${body}
] as const);
`,
    'utf8',
  );
}

function emitVersion(stamp: string): void {
  writeFileSync(
    OUT_VERSION,
    `${BANNER}
/** \`"c" + sha256(workbook bytes)[0:12]\`. Distinct from engineVersion. */
export const CONTENT_VERSION = '${stamp}';
`,
    'utf8',
  );
}

function emitMatchups(heroes: readonly AuthoredHero[], stamp: string): void {
  const title = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

  const rows = heroes
    .map((h, i) => {
      const d = derive(h.primary, h.secondary);
      return (
        `| ${i + 1} | ${h.name} | ${title(h.primary)} | ${title(h.secondary)} | ` +
        `${title(h.primary)} · ${title(h.secondary)} | ${title(d.bane)} | ${title(d.fault)} |`
      );
    })
    .join('\n');

  const distribution = DAMAGE_TYPES.map((t) => {
    const asPrimary = heroes.filter((h) => h.primary === t).length;
    const asSecondary = heroes.filter((h) => h.secondary === t).length;
    return `| ${title(t)} | ${asPrimary} | ${asSecondary} |`;
  }).join('\n');

  writeFileSync(
    OUT_MATCHUPS,
    `<!-- GENERATED by tools/build-content.ts. DO NOT EDIT. Content ${stamp}. -->

# LMNTLZ · Hero Matchup Table

Strength/weakness profile for all ${heroes.length} heroes. **Every column after
\`Attuned 2nd\` is derived** — a hero authors \`primary\` and \`secondary\` and nothing
else. Its Bane is \`counter(primary)\`, its Fault is \`counter(secondary)\`, and it
resists both of its own types.

Element oppositions — Earth↔Air · Fire↔Water · Light↔Dark. Melee triangle —
Slash ▸ Pierce ▸ Crush ▸ Slash (each is Bane-weak to the one that beats it).

**Constraint:** all four slots must stay distinct, so \`secondary ≠ primary\`,
\`counter(primary) ≠ secondary\`, and \`counter(secondary) ≠ primary\`. A consequence
worth stating plainly: **a melee hero can never take a melee 2nd attunement** —
the triangle is a 3-cycle, so both remaining options collide. Every melee hero
therefore carries a magic attunement. Of the 72 pairings with a distinct
secondary, exactly **60 are legal**.

| # | Hero | Type | Attuned 2nd | Strong to (resists) | Very weak — Bane | Moderately weak — Fault |
|---|------|------|-------------|---------------------|------------------|--------------------------|
${rows}

## Distribution (whole roster, all ${heroes.length})

| Type | As primary | As 2nd attunement |
|---|---|---|
${distribution}
`,
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const bytes = readFileSync(WORKBOOK);

  // T034 — the stamp tracks the AUTHORED SOURCE, not the emitted output. Hashing
  // the output would move the stamp when the emitter's formatting changed and
  // hold it still when a designer edited a number, which is backwards.
  const stamp = `c${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);

  const powerList = readPowerList(wb);
  const overlay = readOverlay(powerList.actives);
  warnOnUnclearedNoDamage(overlay, powerList.actives);
  const heroPowers = readHeroPowers(wb);
  const heroes = readHeroes(wb, powerList, overlay, heroPowers);

  const failures: ValidationFailure[] = [
    ...checkRosterRules(heroes),
    ...checkStatBudgets(heroes),
  ];

  for (const hero of heroes) {
    const parsed = authoredHeroSchema.safeParse(hero);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        note(
          `hero "${hero.id}" (${hero.name}), field "${issue.path.join('.') || '(root)'}": ` +
            issue.message,
        );
      }
    }
  }

  for (const failure of failures) note(failure.message);

  if (problems.length > 0) {
    console.error(`\n${problems.length} content problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  emitHeroes(heroes);
  emitVersion(stamp);
  emitMatchups(heroes, stamp);

  console.log(
    `content ${stamp}: ${heroes.length} heroes, ${powerList.actives.size} powers, ` +
      `${powerList.passives.size} passives`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
