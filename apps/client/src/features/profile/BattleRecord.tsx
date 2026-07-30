/**
 * The last twenty Visible battles (012 T014).
 *
 * ### The empty and short cases are worded carefully, and that is the feature
 *
 * A short list must read as *"they have not fought many Visible battles"* and
 * never as *"some entries were removed"*. The server already guarantees the
 * former by **selecting** twenty Visible battles rather than filtering a longer
 * list — but copy can undo that. "Showing 8 of 20" or "some battles are hidden"
 * would hand back exactly the inference the query was shaped to prevent.
 *
 * So: no total, no count-of-count, no ellipsis, and no mention of the Hidden
 * zone anywhere on this component.
 */

import type { JSX } from 'react';
import type { ProfileBattle } from './types.js';

export function BattleRecord({
  battles,
  username,
}: {
  battles: readonly ProfileBattle[];
  username: string;
}): JSX.Element {
  if (battles.length === 0) {
    return (
      <section aria-labelledby="battle-record-heading">
        <h2
          id="battle-record-heading"
          className="font-display text-sm tracking-widest text-faint uppercase"
        >
          Battle record
        </h2>
        <p className="mt-3 text-sm text-muted">
          {/* "No battles yet" — a statement about them, not about this list. */}
          {username} has not fought a battle yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="battle-record-heading">
      <h2
        id="battle-record-heading"
        className="font-display text-sm tracking-widest text-faint uppercase"
      >
        Battle record
      </h2>

      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs tracking-widest text-faint uppercase">
            <th scope="col" className="py-2 pr-4 font-normal">
              Day
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Side
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Opponent
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Result
            </th>
            <th scope="col" className="py-2 font-normal">
              Turns
            </th>
          </tr>
        </thead>
        <tbody>
          {battles.map((battle) => (
            <tr key={battle.battleId} className="border-b border-line/40">
              <td className="py-2 pr-4 text-muted tabular-nums">{battle.concludedOn}</td>
              <td className="py-2 pr-4 text-muted capitalize">{battle.role}</td>
              <td className="py-2 pr-4 text-parchment">
                {battle.opponent ?? <span className="text-faint">a departed player</span>}
                {battle.opponentWasBot ? (
                  <span className="ml-2 text-xs tracking-widest text-faint uppercase">bot</span>
                ) : null}
              </td>
              <td
                className={`py-2 pr-4 uppercase ${
                  battle.outcome === 'win' ? 'text-gold' : 'text-faint'
                }`}
              >
                {battle.outcome}
              </td>
              <td className="py-2 text-muted tabular-nums">{battle.turnCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
