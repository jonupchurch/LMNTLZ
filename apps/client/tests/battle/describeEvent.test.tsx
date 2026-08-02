/**
 * **"I'm noticing healing doesn't always work"** — reported from live play,
 * 2026-08-01.
 *
 * It always worked. The event line printed `outcome.damage` for anything that
 * landed, and a heal lands with `hit: true, damage: 0, healing: N` — so every
 * heal in the game, however large, was reported as `0`. The health bar moved,
 * because the server had been right the whole time; the only written account of
 * what happened said nothing had.
 *
 * ### There were two copies of the formatter and they were identical
 *
 * `describe()` and an inline expression inside `EventLog` — same logic, twice.
 * Fixing one and shipping would have left the *other* half of the screen still
 * printing zeroes, which is this project's recurring wound: a fix applied to one
 * caller of two is half deployed. There is one function now, and these tests
 * exercise it directly rather than through either call site.
 *
 * ### It speaks in champion names now (Jon, 2026-08-01)
 *
 * > *"it should say like, Corvane attacks Marisel. Hits for 250 damage. Or 'Misses'."*
 *
 * The old lines named a **seat** — `a-middle-1 → d-front-0: 214` — and asked the player
 * to hold a mapping the screen was already drawing for them. `nameOf` is passed in
 * rather than looked up here, because the instance→champion map lives in the battle
 * state and this function must stay a pure formatter.
 */

import { describe, expect, it } from 'vitest';
import { RUNE_EFFECTS } from '@lmntlz/sim/rules';
import { describeEvent } from '../../src/features/battle/BattleScreen.js';
import type { TurnEvent } from '../../src/features/battle/types.js';

/** The seats this fixture uses, named. Anything else falls through as its raw id. */
const NAMES: Record<string, string> = {
  'a-middle-1': 'Corvane',
  'a-front-0': 'Marisel',
  'd-front-1': 'Seraphel',
};

const nameOf = (instanceId: string): string => NAMES[instanceId] ?? instanceId;

const event = (outcome: Partial<TurnEvent['outcome']>, over: Partial<TurnEvent> = {}): TurnEvent => ({
  actorInstanceId: 'a-middle-1',
  powerId: 'mend',
  targetInstanceId: 'a-front-0',
  source: 'player',
  outcome: {
    hit: true,
    crit: false,
    damage: 0,
    healing: 0,
    overheal: 0,
    ridersLanded: [],
    ridersResisted: [],
    deaths: [],
    ...outcome,
  },
  ...over,
});

const line = (outcome: Partial<TurnEvent['outcome']>, over: Partial<TurnEvent> = {}): string =>
  describeEvent(event(outcome, over), nameOf);

describe('a heal is reported as a heal', () => {
  /** The reported bug, stated as an assertion. */
  it('never prints a heal as damage', () => {
    const healed = line({ healing: 240 });

    expect(healed, 'a 240-point heal read as "0"').not.toMatch(/\b0\b/);
    expect(healed).toMatch(/240/);
  });

  it('names the amount restored', () => {
    expect(line({ healing: 240 })).toBe('Corvane mends Marisel for 240.');
  });

  /**
   * The other half of *"doesn't ALWAYS work"*. A heal on a full-health ally
   * genuinely restores nothing — correct behaviour, a wasted turn, and
   * indistinguishable from a broken heal until `overheal` existed.
   */
  it('distinguishes a wasted heal from a broken one', () => {
    const wasted = line({ healing: 0, overheal: 180 });

    expect(wasted).toBe('Corvane mends Marisel, already at full health.');
    expect(wasted, 'a wasted heal still read as damage').not.toMatch(/\b0\b/);
  });

  it('prefers the amount restored when a party heal did both', () => {
    /* One ally topped up, another already full: the restored total wins the
       line, because that is the part the player acted for. */
    expect(line({ healing: 90, overheal: 150 })).toMatch(/for 90\./);
  });
});

describe('an attack reads as a sentence', () => {
  it('names both champions and the damage', () => {
    expect(line({ damage: 214 }, { targetInstanceId: 'd-front-1' })).toBe(
      'Corvane attacks Seraphel. Hits for 214 damage.',
    );
  });

  it('marks a crit', () => {
    expect(line({ damage: 428, crit: true })).toBe(
      'Corvane attacks Marisel. Hits for 428 damage, a critical.',
    );
  });

  it('prints a miss', () => {
    expect(line({ hit: false })).toBe('Corvane attacks Marisel. Misses.');
  });

  it('prints a pass', () => {
    expect(line({}, { powerId: null, targetInstanceId: null })).toBe(
      'Corvane has no legal target. Passes.',
    );
  });

  /**
   * **Never a raw seat id where a champion belongs.** The whole point of the change:
   * a line naming `a-middle-1` is a line the player has to decode.
   */
  it('leaves no instance id in any line it produces', () => {
    const lines = [
      line({ damage: 214 }),
      line({ hit: false }),
      line({ healing: 90 }),
      line({ healing: 0, overheal: 40 }),
      line({}, { powerId: null, targetInstanceId: null }),
    ];

    for (const l of lines) {
      expect(l, `"${l}" still names a seat`).not.toMatch(/[ad]-(front|middle|back)-\d/);
    }
  });

  /**
   * The fallback, asserted rather than assumed: a champion the client cannot resolve
   * still produces a line. Dropping the event would hide a turn that really happened.
   */
  it('falls back to the raw id rather than dropping the line', () => {
    expect(describeEvent(event({ damage: 12 }, { actorInstanceId: 'z-front-9' }), nameOf)).toBe(
      'z-front-9 attacks Marisel. Hits for 12 damage.',
    );
  });
});

describe('an old replay still reads', () => {
  /**
   * ⚠️ **A replay recorded before 2026-08-01 has no `overheal` and never can.**
   * Constitution XVI: a replay is played back verbatim, never re-simulated, so
   * the field cannot be backfilled. An old recording of a wasted heal therefore
   * still reads as a hit for 0 — the honest answer, because the information was
   * never captured. What must NOT happen is a crash or an `undefined` on screen.
   */
  it('survives an old replay that predates the field', () => {
    const old = event({ healing: 0 });
    const { overheal: _dropped, ...withoutField } = old.outcome;
    const rendered = describeEvent({ ...old, outcome: withoutField } as TurnEvent, nameOf);

    expect(rendered).toBe('Corvane attacks Marisel. Hits for 0 damage.');
    expect(rendered).not.toMatch(/undefined|NaN/);
  });
});

// ---------------------------------------------------------------------------
// A rune has a voice (021 US4, T059)
// ---------------------------------------------------------------------------

/**
 * 🔴 **Twenty-nine of the thirty-three effects place a status, so the board grew
 * a pip and the transcript said nothing.** The other four are worse: `Too Close`
 * reflects damage and `Take It Back` *removes* something, so they leave no pip
 * either — a player who bought a 25% effect had no way to learn it ever fired.
 *
 * These assert the line, the display name, and the two ways it must stay quiet.
 */
describe('naming the rune that fired', () => {
  const struck = (
    runesFired: readonly string[] | undefined,
    over: Partial<TurnEvent> = {},
  ): TurnEvent =>
    event(
      {
        damage: 41,
        ...(runesFired === undefined ? {} : { runesFired }),
      },
      { powerId: 'strike', targetInstanceId: 'd-front-1', ...over },
    );

  it('🔴 names the effect and who it happened to', () => {
    const rendered = describeEvent(struck(['both-ways:a-middle-1']), nameOf);

    expect(rendered).toContain('Both Ways on Corvane');
  });

  /**
   * 🔴 **The display name comes from the catalog, not from the id.** A line
   * reading `both-ways on Corvane` would be the client inventing its own
   * vocabulary for something the Forge already named a different way.
   */
  it('🔴 uses the catalog’s display name rather than the stored id', () => {
    const rendered = describeEvent(struck(['take-it-back:d-front-1']), nameOf);

    expect(rendered).toContain(RUNE_EFFECTS['take-it-back']!.name);
    expect(rendered, 'the kebab-case id must not reach a player').not.toContain('take-it-back');
  });

  it('names several, comma-joined, in the order they fired', () => {
    const rendered = describeEvent(
      struck(['too-close:a-middle-1', 'both-ways:a-middle-1']),
      nameOf,
    );

    expect(rendered).toContain('Too Close on Corvane, Both Ways on Corvane');
  });

  /** 🔴 The control: an ordinary turn with no rune says nothing extra. */
  it('🔴 adds nothing when no rune fired', () => {
    const rendered = describeEvent(struck([]), nameOf);

    expect(rendered).toBe('Corvane attacks Seraphel. Hits for 41 damage.');
  });

  /**
   * ⚠️ **An absent field is not an empty one** (Constitution XVI). Every battle
   * recorded before this shipped has no `runesFired` and cannot be given one, so
   * an old replay must read cleanly rather than crash or print `undefined`.
   */
  it('🔴 survives a replay recorded before the field existed', () => {
    const rendered = describeEvent(struck(undefined), nameOf);

    expect(rendered).toBe('Corvane attacks Seraphel. Hits for 41 damage.');
    expect(rendered).not.toMatch(/undefined|NaN/);
  });

  /** An id the catalog does not know renders as itself rather than vanishing. */
  it('falls back to the raw id for an effect the catalog has never heard of', () => {
    const rendered = describeEvent(struck(['no-such-rune:d-front-1']), nameOf);

    expect(rendered).toContain('no-such-rune on Seraphel');
  });
});
