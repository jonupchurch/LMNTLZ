/**
 * Roster validation (T020, FR-015, FR-017).
 *
 * Runs at build time and **again at startup**. Every message names the hero and
 * the field, because the audience is a designer looking at a spreadsheet, not a
 * developer looking at a stack trace.
 */

import { STAT_KEYS, checkRosterRules, checkTypeFamilies, statBudgetFor } from './schema.js';
import type { ValidationFailure } from './schema.js';
import { isLegalPairing } from './derive.js';
import { counter, family } from './types.js';
import type { Hero } from './hero.js';

export type { ValidationFailure };

/**
 * Validate a roster from scratch.
 *
 * Note that this re-derives `bane` and `fault` and compares them against what
 * the roster carries. On generated content those can never disagree — which is
 * the point. If they ever do, the generated file was hand-edited, and this is
 * the check that says so.
 */
export function validateHeroes(heroes: readonly Hero[]): ValidationFailure[] {
  const failures: ValidationFailure[] = [
    ...checkTypeFamilies(),
    ...checkRosterRules(heroes),
  ];

  for (const hero of heroes) {
    const where = `hero "${hero.id}" (${hero.name})`;

    const legality = isLegalPairing(hero.primary, hero.secondary);
    if (!legality.legal) {
      failures.push({
        rule: legality.rule,
        heroId: hero.id,
        field: 'secondary',
        message:
          `${where}, field "secondary": ${hero.primary}/${hero.secondary} breaks ` +
          `the distinctness rules (${legality.rule})`,
      });
    }

    if (hero.bane !== counter(hero.primary)) {
      failures.push({
        rule: 'derived-column-disagrees',
        heroId: hero.id,
        field: 'bane',
        message:
          `${where}, field "bane": carries "${hero.bane}" but counter(${hero.primary}) ` +
          `is "${counter(hero.primary)}" — this file was hand-edited`,
      });
    }

    if (hero.fault !== counter(hero.secondary)) {
      failures.push({
        rule: 'derived-column-disagrees',
        heroId: hero.id,
        field: 'fault',
        message:
          `${where}, field "fault": carries "${hero.fault}" but counter(${hero.secondary}) ` +
          `is "${counter(hero.secondary)}" — this file was hand-edited`,
      });
    }

    if (hero.family !== family(hero.primary)) {
      failures.push({
        rule: 'derived-column-disagrees',
        heroId: hero.id,
        field: 'family',
        message:
          `${where}, field "family": carries "${hero.family}" but ${hero.primary} is ` +
          `${family(hero.primary)}`,
      });
    }

    const total = STAT_KEYS.reduce((sum, key) => sum + hero.stats[key], 0);
    const budget = statBudgetFor(hero.primary, hero.role);
    if (total !== budget) {
      failures.push({
        rule: 'stat-budget-violated',
        heroId: hero.id,
        field: 'stats',
        message: `${where}, field "stats": total is ${total}, expected ${budget}`,
      });
    }

    for (const [slot, power] of hero.powers.entries()) {
      if (!Number.isInteger(power.cooldown)) {
        failures.push({
          rule: 'cooldown-not-integer',
          heroId: hero.id,
          field: `powers[${slot}].cooldown`,
          message:
            `${where}, field "powers[${slot}].cooldown": "${power.name}" has ` +
            `cooldown ${power.cooldown} — cooldowns are whole turns, never fractional`,
        });
      }
    }
  }

  return failures;
}
