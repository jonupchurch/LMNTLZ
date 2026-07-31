/**
 * Invitations (013 T018 · FR-012, FR-013).
 *
 * ### Accept joins immediately, with no second confirmation
 *
 * **The player is the one being asked, so their yes is the decision.** The only
 * thing that does get confirmed is the starter-league loss, and that is a different
 * question — it appears inline, before the button, rather than as a modal after it.
 *
 * ### "Accepting one withdraws the rest" is stated plainly (FR-013)
 *
 * Written above the list rather than discovered when four invitations vanish.
 */

import { useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { StarterWarningNotice, bothAcknowledged } from './StarterWarningNotice.js';
import type { InviteView, StarterWarning } from './types.js';

export function InviteList({
  invites,
  onChanged,
  onUnauthenticated,
}: {
  invites: readonly InviteView[];
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element | null {
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [warning, setWarning] = useState<StarterWarning | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invites.length === 0) return null;

  /**
   * The server answers `409` with the warning attached when the player is still a
   * beginner. **The client never decides whether to warn** — it renders what came
   * back, which is why a regenerated screen cannot drop the warning silently.
   */
  const accept = async (inviteId: string): Promise<void> => {
    setError(null);
    try {
      await api(`/invites/${inviteId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ acknowledged }),
      });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { starterWarning?: StarterWarning } | undefined;
        if (body?.starterWarning) {
          setWarning(body.starterWarning);
          return;
        }
      }
      setError('Could not accept that invitation.');
    }
  };

  return (
    <div className="rounded-lg border border-line p-5">
      <h2 className="mb-2 text-h2 font-semibold">You have been invited</h2>
      <p className="mb-3 text-body text-faint">
        Accepting joins you straight away.{' '}
        <strong className="text-parchment">Accepting one withdraws the others.</strong>
      </p>

      <StarterWarningNotice
        warning={warning}
        acknowledged={acknowledged}
        onToggle={(key, on) =>
          setAcknowledged((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
        }
      />

      <ul className="mt-3 grid gap-2">
        {invites.map((invitation) => (
          <li key={invitation.id} className="flex items-center justify-between gap-3">
            <span className="text-body text-parchment">{invitation.guildName}</span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={warning !== null && !bothAcknowledged(acknowledged)}
                className="rounded bg-gold text-void px-3 py-1 text-body disabled:opacity-40"
                onClick={() => void accept(invitation.id)}
              >
                Accept
              </button>
              <button
                type="button"
                className="rounded border border-line px-3 py-1 text-body"
                onClick={() => {
                  void api(`/invites/${invitation.id}/decline`, { method: 'POST' })
                    .then(onChanged)
                    .catch(() => setError('Could not decline.'));
                }}
              >
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>

      {error ? <p className="mt-2 text-body text-slash-lit">{error}</p> : null}
    </div>
  );
}
