/**
 * The applications you have already sent (013 T017 · FR-008, FR-011).
 *
 * ### This file used to ask a human to type a UUID
 *
 * It was the *"apply to a guild"* form, and its first field was a guild id — which
 * nothing in the game ever showed you. Every route behind it worked. **The feature
 * was unusable and every test passed**, which is the same defect as an unrendered
 * component, one level up: the wire was connected to a socket no hand could reach.
 *
 * Applying now happens from a guild's card in `GuildBrowser`, where the decision is
 * actually made. What is left here is the half that was always sound — *what have
 * I sent, and can I take one back* — because the five-at-once budget is only a
 * budget if you can see what is spending it.
 */

import { useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import type { ApplicationView } from './types.js';

export function ApplicationForm({
  applications,
  onChanged,
  onUnauthenticated,
}: {
  applications: readonly ApplicationView[];
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element | null {
  const [error, setError] = useState<string | null>(null);

  const open = applications.filter((a) => a.state === 'open');
  const dismissed = applications.filter((a) => a.state === 'dismissed');

  if (open.length === 0 && dismissed.length === 0) return null;

  const withdraw = async (id: string): Promise<void> => {
    setError(null);
    try {
      await api(`/applications/${id}/withdraw`, { method: 'POST' });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError('Could not withdraw that application.');
    }
  };

  return (
    <div className="rounded-lg border border-line p-5">
      <h2 className="mb-3 text-h2 font-semibold">Your applications</h2>

      {open.length > 0 ? (
        <ul className="grid gap-2">
          {open.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 text-body">
              <span className="text-parchment">
                Waiting ·{' '}
                <span className="text-faint">
                  expires {new Date(a.expiresAt).toLocaleDateString()}
                </span>
              </span>
              <button
                type="button"
                className="text-caption text-faint underline"
                onClick={() => void withdraw(a.id)}
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/**
       * FR-014 — **shown as dismissed rather than vanishing.** A row that
       * disappears reads as a bug; a row that says it was turned down is
       * information, and it is what makes the 24-hour wait explicable instead of
       * mysterious.
       */}
      {dismissed.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-body text-faint">
          {dismissed.map((a) => (
            <li key={a.id}>
              Dismissed — you can apply to that guild again a day later.
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-body text-slash-lit">{error}</p> : null}
    </div>
  );
}
