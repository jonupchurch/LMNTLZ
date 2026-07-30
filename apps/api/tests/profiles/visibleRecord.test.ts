/**
 * The last 20 **Visible** battles — **selected**, never filtered (012 T003–T005).
 *
 * ### TL;DR
 *
 * A profile shows twenty recent battles. If the code asks the database for the
 * twenty most recent battles and *then* removes the Hidden ones, the list comes
 * back short — and **the shortfall is the disclosure**. Anyone who can count can
 * work out how many of that player's last twenty battles were Hidden, and
 * repeating it over days yields their ambush rate and roughly when they were
 * ambushed. Asking the database for *twenty Visible ones*, however far back that
 * reaches, always returns twenty and leaks nothing.
 *
 * ### Why this test exists before the query does
 *
 * The two implementations differ by where a single `LIMIT` sits, both read
 * correctly, and **no amount of code review reliably catches the difference**:
 *
 * ```sql
 * -- WRONG: take 20, then drop Hidden. The gap is measurable.
 * SELECT * FROM (SELECT … ORDER BY concluded_at DESC LIMIT 20) t WHERE zone='visible';
 * -- RIGHT: select 20 Visible, however far back that reaches.
 * SELECT … WHERE zone='visible' ORDER BY concluded_at DESC LIMIT 20;
 * ```
 *
 * A fixture whose last forty battles alternate strictly Visible/Hidden separates
 * them by a factor of two: the filtered query returns **10**, the selected one
 * **20**. Nothing subtler is needed and nothing weaker would do — an unalternated
 * fixture returns twenty under both.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/client.js';
import {
  VISIBLE_RECORD_LIMIT,
  recentVisibleBattles,
} from '../../src/profiles/visibleRecord.js';
import { DAY_MS, Ledger, dropAccounts, makeAccount, record } from './helpers.js';

const ledger = new Ledger();
const accountIds: string[] = [];

/** Strictly alternating, most recent first: Visible, Hidden, Visible, Hidden… */
let alternating: { id: string; username: string };
/** Eight Visible battles ever, and nothing else. */
let sparse: { id: string; username: string };
/** The twenty most recent are all Hidden; older Visible ones exist behind them. */
let hiddenRecent: { id: string; username: string };
/** No battles at all. */
let fresh: { id: string; username: string };
/** The other side of every fixture battle. */
let foe: { id: string; username: string };

beforeAll(async () => {
  [alternating, sparse, hiddenRecent, fresh, foe] = await Promise.all([
    makeAccount('alt'),
    makeAccount('sparse'),
    makeAccount('hidrec'),
    makeAccount('fresh'),
    makeAccount('foe'),
  ]);
  accountIds.push(alternating.id, sparse.id, hiddenRecent.id, fresh.id, foe.id);

  const now = Date.now();

  // 40 battles, strictly alternating. Index 0 is the most recent.
  for (let i = 0; i < 40; i += 1) {
    await record(ledger, {
      attackerId: alternating.id,
      defenderId: foe.id,
      zone: i % 2 === 0 ? 'visible' : 'hidden',
      concludedAt: new Date(now - i * DAY_MS),
    });
  }

  // Eight Visible battles ever. Fewer than the limit, and that is the truth.
  for (let i = 0; i < 8; i += 1) {
    await record(ledger, {
      attackerId: sparse.id,
      defenderId: foe.id,
      zone: 'visible',
      concludedAt: new Date(now - i * DAY_MS),
    });
  }

  // 20 recent Hidden, then 20 older Visible behind them.
  for (let i = 0; i < 20; i += 1) {
    await record(ledger, {
      attackerId: hiddenRecent.id,
      defenderId: foe.id,
      zone: 'hidden',
      concludedAt: new Date(now - i * DAY_MS),
    });
  }
  for (let i = 20; i < 40; i += 1) {
    await record(ledger, {
      attackerId: hiddenRecent.id,
      defenderId: foe.id,
      zone: 'visible',
      concludedAt: new Date(now - i * DAY_MS),
    });
  }
});

afterAll(async () => {
  await ledger.drop();
  await dropAccounts(accountIds);
  await closeDb();
});

describe('selected, not filtered (T003)', () => {
  it('returns 20 Visible battles from a strictly alternating history of 40', async () => {
    const entries = await recentVisibleBattles(alternating.id);

    // A filtered implementation returns 10 here. This assertion is the feature.
    expect(entries).toHaveLength(VISIBLE_RECORD_LIMIT);
    expect(
      entries.length,
      'A filtered query returns ~10 for this fixture. If this reads 10, the ' +
        'LIMIT is on the wrong side of the zone predicate.',
    ).toBe(20);
  });

  it('reaches back past the Hidden battles rather than stopping at them', async () => {
    const entries = await recentVisibleBattles(alternating.id);
    const days = entries.map((e) => e.concludedOn);

    // 20 Visible battles alternating with 20 Hidden span ~40 days, not ~20.
    const oldest = days[days.length - 1]!;
    const newest = days[0]!;
    const spanDays = Math.round(
      (Date.parse(newest) - Date.parse(oldest)) / DAY_MS,
    );

    expect(
      spanDays,
      `Expected the window to span ~38 days (20 Visible interleaved with 20 ` +
        `Hidden). Got ${spanDays}, which is what a query that stops at 20 rows ` +
        `of any zone would return.`,
    ).toBeGreaterThanOrEqual(30);
  });

  it('never returns a Hidden battle', async () => {
    const entries = await recentVisibleBattles(alternating.id);
    const serialised = JSON.stringify(entries);

    expect(serialised).not.toContain('hidden');
  });
});

describe('the three sharper fixtures (T004)', () => {
  it('returns as many as exist and never pads', async () => {
    const entries = await recentVisibleBattles(sparse.id);

    expect(entries).toHaveLength(8);
    // A padded list would be indistinguishable from a filtered one to a viewer.
    expect(entries.every((e) => e.battleId.length > 0)).toBe(true);
  });

  it('returns 20 Visible from further back when the 20 most recent are all Hidden', async () => {
    const entries = await recentVisibleBattles(hiddenRecent.id);

    expect(
      entries,
      'The 20 most recent battles are all Hidden. A filtered query returns an ' +
        'EMPTY list here, which tells the viewer exactly what happened.',
    ).toHaveLength(VISIBLE_RECORD_LIMIT);
  });

  it('returns an empty list for a brand-new account without throwing', async () => {
    const entries = await recentVisibleBattles(fresh.id);

    expect(entries).toEqual([]);
  });
});

describe('day-rounded timestamps (T005)', () => {
  it('carries concludedOn as a day and never a precise time', async () => {
    const entries = await recentVisibleBattles(alternating.id);

    for (const entry of entries) {
      expect(
        entry.concludedOn,
        `concludedOn must be YYYY-MM-DD. Got "${entry.concludedOn}" — a precise ` +
          `time leaks the same information one step removed, because the ` +
          `INTERVALS between entries reveal how many battles happened in the gaps.`,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('exposes no other timestamp field anywhere in the entry', async () => {
    const entries = await recentVisibleBattles(alternating.id);
    const keys = new Set(entries.flatMap((e) => Object.keys(e)));

    for (const key of keys) {
      expect(
        key === 'concludedOn' || !/at$|At$|time|Time/.test(key),
        `"${key}" looks like a timestamp. Only concludedOn — a day — may appear.`,
      ).toBe(true);
    }

    // And the serialised form carries no ISO instant either.
    expect(JSON.stringify(entries)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });
});
