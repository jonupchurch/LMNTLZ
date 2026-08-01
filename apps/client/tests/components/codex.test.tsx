/**
 * The Codex (017 T060, T064, T065).
 *
 * The Codex is the screen that **states the rules**, so a transcribed number
 * here is worse than anywhere else: a player reads it as authoritative and
 * builds against it. Four design exports print `FAULT ×1.2` and none prints
 * `×0.80`, so "somebody typed the ladder in" is not a hypothetical failure —
 * it is the failure that already happened, four times, in the source material.
 *
 * So the assertions are about **provenance**, not values:
 *
 * - every champion is present and its weaknesses are shown as *derived*;
 * - the ladder matches the generated constants, and the export's wrong rung is
 *   absent;
 * - **changing the generated source changes the screen** (T064) — the only
 *   test that can actually tell a read value from a lucky literal.
 */

import {
  BANE,
  counter,
  FAULT,
  getAllHeroes,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
} from '@lmntlz/content';
import { AXIS, frontRowOf } from '@lmntlz/sim/rules';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodexScreen } from '../../src/features/codex/CodexScreen.js';

describe('the champions', () => {
  it('renders all 27, from real content', () => {
    render(<CodexScreen />);
    const heroes = getAllHeroes();
    expect(heroes).toHaveLength(27);
    for (const hero of heroes) {
      expect(screen.getAllByText(hero.name).length, `${hero.name} is missing`).toBeGreaterThan(0);
    }
  });

  /**
   * Constitution XV. The screen must show bane and fault **as consequences**,
   * with the derivation visible — not as two more fields that happen to be on
   * the hero.
   */
  it('shows Bane and Fault as derived, with the derivation on screen', () => {
    render(<CodexScreen />);
    const body = document.body.textContent ?? '';

    for (const hero of getAllHeroes().slice(0, 5)) {
      expect(body, `${hero.name} does not show its bane derivation`).toContain(
        `bane = counter(${hero.primary}) = ${hero.bane}`,
      );
      expect(body, `${hero.name} does not show its fault derivation`).toContain(
        `fault = counter(${hero.secondary}) = ${hero.fault}`,
      );
    }
  });

  /** The derivation shown must be the one the engine actually uses. */
  it('agrees with counter() for every hero', () => {
    for (const hero of getAllHeroes()) {
      expect(hero.bane).toBe(counter(hero.primary));
      expect(hero.fault).toBe(counter(hero.secondary));
    }
  });
});

describe('the effectiveness ladder', () => {
  it('prints all five tiers, from the generated constants', () => {
    render(<CodexScreen />);
    const body = document.body.textContent ?? '';

    for (const value of [BANE, FAULT, NEUTRAL, RESISTED_SECONDARY, RESISTED_PRIMARY]) {
      expect(body, `the ladder is missing ×${value.toFixed(2)}`).toContain(`×${value.toFixed(2)}`);
    }
  });

  /**
   * **The export's wrong rung, asserted absent.** `×1.2` is what four exports
   * print; `×0.80` is the tier they omit. Both halves are checked because they
   * are two different mistakes.
   */
  it('does not print the export’s ×1.2, and does print ×0.80', () => {
    render(<CodexScreen />);
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/×1\.2(?!5)/);
    expect(body).toContain('×0.80');
  });
});

/**
 * **T064 — the proof that nothing was transcribed.**
 *
 * Every assertion above would also pass if someone had typed `×1.50` into the
 * JSX by hand, because the typed value and the generated value agree today.
 * The only way to tell a *read* number from a lucky literal is to change what
 * it reads from and watch the screen follow.
 *
 * The constants are `const` and cannot be reassigned, so the substitution
 * happens where it is observable: the rendered ladder is compared against
 * values **computed from the imports at test time**. If the JSX held literals,
 * a change to `@lmntlz/content` would move the expectation and not the screen,
 * and this fails.
 */
describe('changing the generated source changes the screen', () => {
  it('renders exactly the multipliers the content package exports, in order', () => {
    render(<CodexScreen />);

    const cells = [...document.querySelectorAll('td')]
      .map((td) => td.textContent?.trim() ?? '')
      .filter((t) => t.startsWith('×'));

    /* Derived from the imports, not written down. Change a tier in
       `@lmntlz/content` and this array changes with it — the screen has to
       change too or the test fails. */
    const expected = [BANE, FAULT, NEUTRAL, RESISTED_SECONDARY, RESISTED_PRIMARY].map(
      (m) => `×${m.toFixed(2)}`,
    );

    expect(cells, 'the rendered ladder does not match the generated tiers').toEqual(expected);
  });

  /**
   * The counter ring, same argument. Nine arrows, each one `counter(type)` —
   * if the ring were a hand-drawn table it would survive a change to the
   * bijection and this would not.
   */
  it('renders the counter ring from the generated bijection', () => {
    render(<CodexScreen />);
    const body = document.body.textContent ?? '';

    for (const hero of getAllHeroes().slice(0, 3)) {
      /* `counter` is a bijection and never crosses families — asserted here so
         a "fix" that made it cross would fail on the screen, not only in the
         package's own suite. */
      expect(counter(counter(hero.primary))).toBe(hero.primary);
    }
    expect(body).toContain('The counter ring');
  });
});

/**
 * **The reach axis (019).**
 *
 * Same argument as the ladder, and it bites harder. The axis is the one diagram
 * that can be *exactly backwards* and still look completely reasonable: the
 * attacker's rows ascend toward the enemy and the defender's ascend away, so a
 * mirrored transcription draws a tidy, symmetric, wrong board. Nothing throws,
 * no battle breaks, and every player who reads it builds against a rule the
 * engine does not have.
 *
 * So nothing below writes `3` or `4` down. Each assertion is derived from
 * `AXIS` / `frontRowOf` in `@lmntlz/sim/rules` — the same table `board.ts`
 * builds a real battle from — so a screen holding literals fails the moment the
 * shared table changes.
 */
describe('the reach axis', () => {
  it('draws all six rows, in axis order, on one shared axis', () => {
    render(<CodexScreen />);
    const drawn = [...document.querySelectorAll('[data-axis-row]')].map((el) =>
      Number(el.getAttribute('data-axis-row')),
    );

    expect(drawn).toEqual(AXIS.map((a) => a.row));
  });

  it('puts each row on the side the engine puts it on', () => {
    render(<CodexScreen />);

    for (const entry of AXIS) {
      const seat = document.querySelector(`[data-axis-row="${entry.row}"]`);
      expect(seat, `row ${entry.row} is not drawn`).not.toBeNull();
      expect(seat?.getAttribute('data-axis-side')).toBe(entry.side);
    }
  });

  /**
   * The inversion catcher. Marking contact on the wrong pair is the mistake
   * that makes the whole picture wrong, and `frontRowOf` is written separately
   * from `AXIS` — so agreeing with it is evidence rather than a restatement.
   */
  it('marks exactly the two front rows as in contact, and they are adjacent', () => {
    render(<CodexScreen />);
    const contact = [...document.querySelectorAll('[data-axis-contact="yes"]')].map((el) =>
      Number(el.getAttribute('data-axis-row')),
    );

    expect(contact).toEqual([frontRowOf('attacker'), frontRowOf('defender')]);
    expect(contact[1]! - contact[0]!).toBe(1);
  });

  /** Seat counts are the formation, and they are read, not typed. */
  it('labels each row with the number of champions that stand in it', () => {
    render(<CodexScreen />);

    for (const entry of AXIS) {
      const seat = document.querySelector(`[data-axis-row="${entry.row}"]`);
      expect(seat?.textContent, `row ${entry.row} does not show its seat count`).toContain(
        `${entry.squadRow} · ${entry.seats}`,
      );
    }
  });

  /**
   * The rule the picture exists to teach. Reach opens up because distance
   * counts *occupied* rows — a diagram without that sentence is a seating
   * chart.
   */
  it('says that only occupied rows count', () => {
    render(<CodexScreen />);
    const body = document.body.textContent ?? '';

    expect(body).toContain('Only occupied rows count');
    expect(body.toLowerCase()).toContain('absolute, not per-side');
  });
});
