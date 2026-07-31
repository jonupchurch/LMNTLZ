/**
 * The starter-league warning, at every door (013 T027, T028 · FR-015 · SC-002).
 *
 * ### Both losses are named, because they are two different things
 *
 * **Beginner status** is the authored, bot-only opponent pool — the protection.
 * The **beginner bonus** is the ×1.5 on attack income. A player told only *"you'll
 * leave the starter league"* has not been told their income drops.
 *
 * `09-matchmaking.md` records that this warning has been **lost three times** to
 * screen regenerations. So the two acknowledgements are separate checkboxes with
 * separate labels, and the confirm button stays disabled until both are ticked —
 * one tick is not an acknowledgement of two losses.
 *
 * ### And it does not oversell it
 *
 * The ×1.5 mostly replaces dormant hold income. About **11%** is actual help, and
 * saying so is what makes the rest of the warning believable.
 */

import { type JSX } from 'react';
import { ACKNOWLEDGEMENTS, type StarterWarning } from './types.js';

export function StarterWarningNotice({
  warning,
  acknowledged,
  onToggle,
}: {
  /** `null` when the player has nothing left to lose — render nothing. */
  warning: StarterWarning | null;
  acknowledged: readonly string[];
  onToggle: (key: string, on: boolean) => void;
}): JSX.Element | null {
  if (warning === null) return null;

  const rows: ReadonlyArray<{ key: string; label: string; detail: string }> = [
    {
      key: ACKNOWLEDGEMENTS[0],
      label: 'I understand my opponents stop being beginners',
      detail:
        'The starter league only offers authored opponents built to be beatable. ' +
        'After this you are matched against real players.',
    },
    {
      key: ACKNOWLEDGEMENTS[1],
      label: 'I understand my shard income drops',
      detail:
        'The ×1.5 on attack income ends. In practice that is about 11% of a ' +
        'typical day, because most of the multiplier replaces the hold income a ' +
        'starter does not earn — but it is a real drop.',
    },
  ];

  return (
    <div className="rounded-lg border border-crush bg-crush-deep/25 p-4">
      <h3 className="mb-1 font-semibold text-crush-lit">This ends your beginner status</h3>
      <p className="mb-3 text-body text-muted">
        Joining or founding a guild takes you out of the starter league.{' '}
        <strong className="text-crush-lit">There is no way back in.</strong>
      </p>

      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.key}>
            <label className="flex items-start gap-2 text-body">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged.includes(row.key)}
                onChange={(e) => onToggle(row.key, e.currentTarget.checked)}
              />
              <span>
                <span className="block font-medium text-parchment">{row.label}</span>
                <span className="block text-caption text-faint">{row.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Both, or it is not an acknowledgement. Exported so callers cannot re-derive it. */
export function bothAcknowledged(acknowledged: readonly string[]): boolean {
  return ACKNOWLEDGEMENTS.every((a) => acknowledged.includes(a));
}
