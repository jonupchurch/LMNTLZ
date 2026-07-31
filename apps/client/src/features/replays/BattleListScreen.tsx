/**
 * Your battles, and the ones you can still watch (018 T035 · FR-011, FR-012).
 *
 * ### What was missing
 *
 * Feature 008 built the record, the replay blob, the seven-day window, the
 * cleanup sweep, the holds and both read routes — and **`GET /v1/me/battles`
 * has never had a caller**. `tools/gap-audit.py` has listed it and
 * `/replays/:id` as gaps since the audit existed. Every replay this game has
 * ever written expired without anybody being able to open one.
 *
 * ### `watchable` comes off the wire and nothing here recomputes it
 *
 * FR-011. `listBattles()` decides it server-side because **one flag covers four
 * situations** — never written, swept, past the window, held for a report — and
 * the player's options are identical in all four. A client subtracting seven
 * days from `concludedAt` would be wrong in three of them, and would be wrong
 * *after* a click on a control that had already promised a video.
 *
 * The age column is presentation and nothing branches on it. That distinction —
 * showing a date versus deciding from one — is exactly where this requirement
 * gets broken by accident, so `tests/replays/watchable.test.tsx` inverts the
 * fixture: a thirty-day-old watchable battle and a two-hour-old unwatchable
 * one, both of which a date-computing client gets wrong.
 *
 * ### And no composition, which is the export disagreeing with the rules
 *
 * `LMNTLZ Battle Record.dc.html` draws a **SQUAD SENT** column of six hero
 * emblems per row. The route carries neither squad, deliberately — *"a list is
 * not a scouting surface"* (Constitution XVII) — so that column cannot be
 * filled and is not drawn. Recorded in `resources/README.md`, per the rule that
 * a generated screen is look and feel rather than a source of rules.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { Button, Panel } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { ageOf, type BattleListEntry, type BattleListResponse } from './types.js';

export interface BattleListScreenProps {
  readonly onWatch: (battle: BattleListEntry) => void;
  readonly onUnauthenticated: () => void;
  /** Injected by tests so the age column is deterministic. */
  readonly now?: Date;
}

/**
 * **No `onLeave` here, deliberately.** This is a rail destination, so the rail
 * is the way out and a second back control would be a button that duplicates
 * the navigation beside it. `ReplayViewer` does take one, because a replay is
 * reached only from this list and *"back to your battles"* is a real
 * destination rather than a synonym for the rail.
 */
export function BattleListScreen({
  onWatch,
  onUnauthenticated,
  now,
}: BattleListScreenProps): JSX.Element {
  const [list, setList] = useState<BattleListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<BattleListResponse>('/me/battles'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError('Your battles could not be loaded.');
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const stamp = now ?? new Date();

  return (
    <>
      <Panel span={12}>
        <header>
          <h1 className="text-h1 font-display uppercase tracking-wide">Battle record</h1>
          <p className="text-body text-muted mt-1 max-w-3xl">
            {/* The export's own header badge — REPLAYS HELD 7 DAYS. It is the
                one number that explains every empty REPLAY cell below. */}
            Replays are held for seven days. The result is kept for good.
          </p>
        </header>
      </Panel>

      <Panel span={12}>
        {error ? (
          <p role="alert" className="text-body text-muted">
            {error}
          </p>
        ) : list === null ? (
          <p role="status" className="text-body tracking-widest text-faint uppercase">
            Loading your battles…
          </p>
        ) : list.battles.length === 0 ? (
          /* A statement about the player, not about this list — the same
             wording rule `BattleRecord.tsx` follows for a stranger's profile. */
          <p className="text-body text-muted">You have not fought a battle yet.</p>
        ) : (
          <table aria-label="Your battles" className="text-body w-full border-collapse">
            <thead>
              <tr className="text-caption border-b border-line text-left font-display tracking-widest text-faint uppercase">
                <th scope="col" className="py-2 pr-4 font-normal">
                  When
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Side
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Opponent
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Zone
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Result
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Turns
                </th>
                <th scope="col" className="py-2 font-normal">
                  Replay
                </th>
              </tr>
            </thead>
            <tbody>
              {list.battles.map((battle) => (
                <Row key={battle.battleId} battle={battle} now={stamp} onWatch={onWatch} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

function Row({
  battle,
  now,
  onWatch,
}: {
  readonly battle: BattleListEntry;
  readonly now: Date;
  readonly onWatch: (battle: BattleListEntry) => void;
}): JSX.Element {
  return (
    <tr data-battle={battle.battleId} className="border-b border-line/40">
      <td className="py-2 pr-4 font-mono text-muted tabular-nums">
        {ageOf(battle.concludedAt, now)}
      </td>
      <td className="py-2 pr-4 text-muted capitalize">{battle.role}</td>
      <td className="py-2 pr-4 text-parchment">
        {battle.opponent.username ?? <span className="text-faint">a departed player</span>}
        {battle.opponent.isBot ? (
          <span className="text-caption ml-2 tracking-widest text-faint uppercase">bot</span>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-muted capitalize">{battle.zone}</td>
      <td
        className={`py-2 pr-4 uppercase ${battle.outcome === 'win' ? 'text-gold' : 'text-muted'}`}
      >
        {battle.outcome}
      </td>
      <td className="py-2 pr-4 font-mono text-muted tabular-nums">{battle.turnCount}</td>
      <td className="py-2">
        {battle.watchable ? (
          <Button size="sm" variant="secondary" onClick={() => onWatch(battle)}>
            Watch
          </Button>
        ) : (
          /**
           * **One sentence for all four unwatchable states, because the server
           * sends one flag** — and because the player's options are the same in
           * every one of them. FR-012's framing is load-bearing: the *replay*
           * is what is gone. The result, the opponent and the length are in the
           * same row, unchanged, and no word here suggests the battle was
           * deleted.
           */
          <span className="text-caption font-mono text-faint">No longer watchable</span>
        )}
      </td>
    </tr>
  );
}
