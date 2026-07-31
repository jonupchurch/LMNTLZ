/**
 * **Playback reads the log and derives nothing** (018 T036, T037 · FR-014,
 * Constitution XVI).
 *
 * ### TL;DR
 *
 * Every number on the replay screen is one the server already wrote down. The
 * viewer cannot work anything out, which is what makes a balance patch unable
 * to reach a battle that already happened.
 *
 * ### The absence is asserted structurally, because behaviour cannot prove one
 *
 * `apps/api/tests/replays/playback.test.ts` makes the same call for the read
 * path: what makes *"no simulation runs"* true is that the module **cannot
 * reach a simulator at all**. A spy would only cover the call it knew to watch.
 * So the last block below scans the feature's own source, with the
 * comment-strip checked — a bad regex that ate the file would make every
 * assertion vacuously true, which is the failure mode of a source scan and the
 * one that leaves no trace.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplayViewer } from '../../src/features/replays/ReplayViewer.js';
import { fallenBy, parseSeat, seatLabel, standing } from '../../src/features/replays/types.js';
import { LOG, stubReplays } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const open = async (role: 'attacker' | 'defender' = 'attacker') => {
  stubReplays({ '/replays/': LOG });
  render(
    <ReplayViewer
      battleId="btl-1"
      viewerRole={role}
      onLeave={() => {}}
      onUnauthenticated={() => {}}
    />,
  );
  return screen.findByRole('region', { name: /playback/i });
};

const panel = (): HTMLElement => document.querySelector('[data-cursor]') as HTMLElement;

const cursor = (): number => Number(panel().dataset['cursor']);

/**
 * The current turn only.
 *
 * **Scoped, because the whole log is also on the screen.** The list below the
 * panel carries a line per turn, so an unscoped `getByText(/missed/i)` matches
 * both the turn being shown and every other miss in the battle — and the
 * version of that mistake that *passes* is the one where a single match happens
 * to be the wrong one.
 */
const shown = () => within(panel());

describe('stepping through the log', () => {
  it('starts before the first turn rather than at the end', async () => {
    await open();

    expect(cursor()).toBe(0);
    expect(shown().getByText(/nothing has happened yet/i)).toBeTruthy();
  });

  it('advances one recorded turn at a time', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: /forward one turn/i }));
    expect(cursor()).toBe(1);

    await user.click(screen.getByRole('button', { name: /forward one turn/i }));
    expect(cursor()).toBe(2);

    await user.click(screen.getByRole('button', { name: /back one turn/i }));
    expect(cursor()).toBe(1);
  });

  it('counts in turns, and the total is the log length', async () => {
    await open();
    /* Not seconds, not a percentage — this game counts turns everywhere. */
    expect(screen.getByText(`Turn 0 of ${LOG.events.length}`)).toBeTruthy();
  });

  it('cannot step past either end', async () => {
    const user = userEvent.setup();
    await open();

    expect(screen.getByRole('button', { name: /back one turn/i })).toBeDisabled();

    for (let i = 0; i < LOG.events.length + 3; i += 1) {
      const forward = screen.getByRole('button', { name: /forward one turn/i });
      if (!forward.hasAttribute('disabled')) await user.click(forward);
    }
    expect(cursor()).toBe(LOG.events.length);
  });
});

describe('what is on the screen came out of the log', () => {
  it('shows the recorded damage, not a recomputed one', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: /forward one turn/i }));
    /* 214 is in the fixture. Nothing multiplies Might by a multiplier here. */
    expect(shown().getByText(/214 damage/i)).toBeTruthy();
  });

  it('marks a critical because the log says crit, and a miss because it says miss', async () => {
    const user = userEvent.setup();
    await open();
    const forward = screen.getByRole('button', { name: /forward one turn/i });

    await user.click(forward);
    await user.click(forward);
    expect(shown().getByText(/missed/i)).toBeTruthy();

    await user.click(forward);
    expect(shown().getByText(/critical/i)).toBeTruthy();
  });

  it('names riders landed and resisted separately', async () => {
    const user = userEvent.setup();
    await open();
    const forward = screen.getByRole('button', { name: /forward one turn/i });
    for (let i = 0; i < 5; i += 1) await user.click(forward);

    expect(shown().getByText(/landed: burn/i)).toBeTruthy();
    expect(shown().getByText(/resisted: slow/i)).toBeTruthy();
  });

  it('renders a pass as a pass rather than as a zero-damage hit', async () => {
    const user = userEvent.setup();
    await open();
    const forward = screen.getByRole('button', { name: /forward one turn/i });
    for (let i = 0; i < 6; i += 1) await user.click(forward);

    expect(shown().getByText(/passed/i)).toBeTruthy();
  });

  it('surfaces the versions the battle was fought under', async () => {
    await open();
    /**
     * The visible half of Constitution XVI. Read from the log rather than from
     * the running build, so a replay recorded two engines ago still says so.
     */
    expect(screen.getByText(/engine 1\.4\.0/i)).toBeTruthy();
    expect(screen.getByText(/content 2026-07-12/i)).toBeTruthy();
  });
});

describe('the result appears at the end, not before it', () => {
  it('is absent mid-battle', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: /forward one turn/i }));

    /* Showing the outcome while the player is still watching is the one thing
       a replay viewer must not do. */
    expect(screen.queryByRole('region', { name: 'Result' })).toBeNull();
  });

  it('reads as a victory for the side the viewer was on', async () => {
    const user = userEvent.setup();
    await open('attacker');

    for (let i = 0; i < LOG.events.length; i += 1) {
      await user.click(screen.getByRole('button', { name: /forward one turn/i }));
    }

    expect(screen.getByRole('region', { name: 'Result' }).textContent).toMatch(/victory/i);
  });

  it('and as a defeat for the other one, from the same log', async () => {
    const user = userEvent.setup();
    await open('defender');

    for (let i = 0; i < LOG.events.length; i += 1) {
      await user.click(screen.getByRole('button', { name: /forward one turn/i }));
    }

    /**
     * **The same stored conclusion, read from two sides.** `winner` is
     * `attacker` in the log and stays that way; what changes is who is reading.
     * A viewer that stored "won" rather than comparing would be right for one
     * of the two participants.
     */
    expect(screen.getByRole('region', { name: 'Result' }).textContent).toMatch(/defeat/i);
  });
});

describe('seats, which is all an instance id carries', () => {
  it('reads a seat out of an instance id', () => {
    expect(parseSeat('a-front-0')).toEqual({ side: 'attacker', row: 'front', index: 0 });
    expect(parseSeat('d-middle-2')).toEqual({ side: 'defender', row: 'middle', index: 2 });
  });

  it('returns null on anything it does not recognise, rather than throwing', () => {
    /* A replay is a seven-day-old document written by an older build. */
    for (const bad of ['', 'x', 'a-front', 'z-front-0', 'a-flank-0', 'a-front-x', 'a-front--1']) {
      expect(parseSeat(bad), `${bad} parsed as a seat`).toBeNull();
    }
  });

  it('labels a seat relative to whoever is watching', () => {
    const seat = parseSeat('a-front-0')!;
    expect(seatLabel(seat, 'attacker')).toMatch(/yours/i);
    expect(seatLabel(seat, 'defender')).toMatch(/theirs/i);
    /* 0-based on the wire, 1-based on screen, as every other seat is counted. */
    expect(seatLabel(seat, 'attacker')).toContain('1');
  });

  it('names no champion, because the log names none', async () => {
    await open();

    /**
     * **A property the current log shape has for free**, and worth an assertion
     * before anybody proposes putting the opening `BattleState` into it to get
     * a board back: `instanceIdOf()` mints ids from side and seat, so a replay
     * reveals no composition to either participant.
     */
    for (const champion of ['Bramwen', 'Reyna', 'Kaellis', 'Nyxara', 'Terragosa']) {
      expect(document.body.textContent, `${champion} appears in a replay`).not.toContain(champion);
    }
  });
});

describe('standing is counted from recorded deaths', () => {
  it('drops a side only when the log says somebody fell', () => {
    /* Turn 3 kills `d-front-1`; turn 7 kills `d-middle-0`. */
    expect(standing(LOG.events, 0, 'defender')).toBe(6);
    expect(standing(LOG.events, 2, 'defender')).toBe(6);
    expect(standing(LOG.events, 3, 'defender')).toBe(5);
    expect(standing(LOG.events, 7, 'defender')).toBe(4);
  });

  it('never touches the other side', () => {
    expect(standing(LOG.events, LOG.events.length, 'attacker')).toBe(6);
  });

  it('counts a death once even if it appears twice', () => {
    /* A set, not a tally — a duplicate in an old log must not read as two. */
    const twice = [...LOG.events, LOG.events[2]!];
    expect(fallenBy(twice, twice.length).size).toBe(2);
  });
});

describe('⛔ there is no re-simulation path (T037, FR-014)', () => {
  const dir = join(import.meta.dirname, '../../src/features/replays');

  const sources = (function walk(d: string): string[] {
    return readdirSync(d).flatMap((name) => {
      const full = join(d, name);
      return statSync(full).isDirectory()
        ? walk(full)
        : full.endsWith('.ts') || full.endsWith('.tsx')
          ? [full]
          : [];
    });
  })(dir);

  /**
   * The file with its comments removed.
   *
   * These files explain *why* playback may not simulate, so a scan that read
   * prose would flag the explanation and the only way to pass would be to
   * delete the reason. The strip is itself checked: a bad regex that ate the
   * file would make every assertion below vacuously true.
   */
  const codeOf = (path: string): string => {
    const stripped = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(
      /\b(import|export|const|function)\b/.test(stripped),
      `stripping comments emptied ${path} — the scan below would pass on nothing`,
    ).toBe(true);

    return stripped;
  };

  it('scans a non-empty feature tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('imports nothing that can resolve a turn', () => {
    for (const path of sources) {
      const source = codeOf(path);
      for (const forbidden of ['@lmntlz/sim/resolver', '@lmntlz/sim/ai']) {
        expect(source.includes(forbidden), `${path} imports ${forbidden}`).toBe(false);
      }
    }
  });

  it('calls nothing that would re-derive an outcome', () => {
    /**
     * Named functions rather than a general "does it do arithmetic", because
     * the arithmetic that *is* allowed here — summing recorded deaths — is
     * indistinguishable from any other addition. These are the entry points a
     * re-simulation would have to come through.
     */
    const FORBIDDEN = [
      /\bresolveTurn\b/,
      /\bavailablePowers\b/,
      /\blegalTargets\b/,
      /\bnextActor\b/,
      /\btypeMultiplier\b/,
      /\bmitigate\b/,
      /\brand\(/,
      /Math\.random/,
    ];

    for (const path of sources) {
      const source = codeOf(path);
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${path} calls ${String(pattern)} during playback`).toBe(
          false,
        );
      }
    }
  });
});
