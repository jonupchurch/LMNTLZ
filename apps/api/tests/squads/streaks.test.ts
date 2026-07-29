/**
 * Three streaks, never conflated (T032–T033).
 *
 * **All three are integers called "streak" and only one of them changes what
 * happens to anybody.** That is the whole hazard: conflating them is not a
 * display bug. A hold streak feeding ambush would mean editing a defense squad
 * lowers the player's own ambush odds — which nothing in the design says and no
 * player would ever guess.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  AMBUSH_CAP,
  AMBUSH_CAP_AT,
  AMBUSH_PER_WIN,
  ambushChance,
  ambushConfig,
  nextAttackStreak,
} from '../../src/squads/ambush.js';

describe('ambush odds (SC-006)', () => {
  it('is +2% per consecutive win', () => {
    expect(ambushChance(0)).toBe(0);
    expect(ambushChance(1)).toBe(2);
    expect(ambushChance(10)).toBe(20);
    expect(AMBUSH_PER_WIN).toBe(2);
  });

  it('reaches exactly 90% at 45 wins and NEVER exceeds it', () => {
    expect(AMBUSH_CAP_AT).toBe(45);
    expect(ambushChance(45)).toBe(90);

    // The 46th win is where an unclamped implementation goes wrong, and a
    // 45-win streak is what a strong player has by the end of a good session.
    for (const streak of [46, 50, 100, 1_000, 10_000]) {
      expect(ambushChance(streak), `streak ${streak}`).toBe(AMBUSH_CAP);
    }
  });

  it('never reaches 100%, so the Visible squad stays live', () => {
    // A guaranteed ambush means nobody ever fights a Visible squad again — and
    // Visible is the only squad anybody can CHOOSE to attack.
    expect(AMBUSH_CAP).toBeLessThan(100);
    expect(ambushChance(Number.MAX_SAFE_INTEGER)).toBeLessThan(100);
  });

  it('is 0 for a negative or nonsense streak rather than negative', () => {
    for (const bad of [-1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ambushChance(bad), String(bad)).toBeGreaterThanOrEqual(0);
    }
    expect(ambushChance(-5)).toBe(0);
  });
});

describe('the attack streak is universal across all three squads (SC-005, FR-013)', () => {
  it('counts consecutive wins regardless of which squad won', () => {
    // Switching squads is the ordinary way to answer a different opponent. A
    // per-squad streak would teach players to attack with one squad forever,
    // which is the opposite of the counter-building this game is about.
    let streak = 0;
    for (const _squad of [0, 1, 2]) {
      streak = nextAttackStreak(streak, 'win', false).attackStreak;
    }
    expect(streak).toBe(3);
    expect(ambushChance(streak)).toBe(6);
  });

  it('lives on the account, not on a squad', () => {
    // Structural: the column is on `player_streaks`, keyed by account. On a
    // squad it would reset on every switch, which IS the bug FR-013 names.
    const schema = readFileSync(
      join(import.meta.dirname, '../../src/db/schema/streaks.ts'),
      'utf8',
    );
    expect(schema).toContain('accountId');
    expect(schema).toContain('attack_streak');

    const squadSchema = readFileSync(
      join(import.meta.dirname, '../../src/db/schema/squads.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(squadSchema).not.toContain('attack_streak');
    expect(squadSchema).not.toContain('attackStreak');
  });

  it('an AMBUSHED loss does not reset it', () => {
    // The player did not choose that fight; the ambush chose them, and it is a
    // harder one. Resetting would make the reward for a long streak be that the
    // streak ends — and the correct play would be to stop attacking near the cap.
    const after = nextAttackStreak(20, 'loss', true);
    expect(after.attackStreak).toBe(20);
    expect(after.ambushChance).toBe(40);
  });

  it('a CHOSEN loss does reset it', () => {
    expect(nextAttackStreak(20, 'loss', false).attackStreak).toBe(0);
  });
});

describe('the constants are served, never compiled into the client (SC-008)', () => {
  it('exposes them as config from one place', () => {
    expect(ambushConfig()).toEqual({ perWin: 2, cap: 90, capAt: 45 });
  });

  it('has no literal per-win or cap value anywhere in apps/client/src', () => {
    /**
     * **The reason is a week of disagreement, not tidiness.**
     *
     * Ambush rate decides how often anybody's Hidden squad is ever seen, and
     * Hidden squads are half the defensive game. If 2% turns out to put nobody
     * into a Hidden battle, the fix must be a config change — not a client
     * build, a store submission and a Steam update some players will not take
     * for a week, during which the web and Steam builds disagree about a
     * competitive number.
     */
    const dir = join(import.meta.dirname, '../../../client/src');

    const files = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((entry) => {
        const full = join(d, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(full) ? [full] : [];
      });
    })(dir);

    expect(files.length).toBeGreaterThan(0);

    // Shapes that would mean the client is deciding rather than displaying.
    const FORBIDDEN: [string, RegExp][] = [
      ['a per-win rate', /streak\s*\*\s*2\b/],
      ['a per-win rate', /\b2\s*\*\s*\w*[Ss]treak/],
      ['a 90 cap', /Math\.min\(\s*90\b/],
      ['a 90 cap', /\b90\s*\)?\s*(?:,|\))?\s*\/\/.*cap/i],
      ['an ambush constant', /AMBUSH_(?:PER_WIN|CAP)\s*=/],
      ['a hard-coded ambush percent', /ambush\w*\s*[:=]\s*(?:90|2)\b/i],
    ];

    for (const path of files) {
      const source = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const [what, pattern] of FORBIDDEN) {
        expect(pattern.test(source), `${path} contains ${what}`).toBe(false);
      }
    }
  });
});
